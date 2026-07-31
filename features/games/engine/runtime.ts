// features/games/engine/runtime.ts — the shared live-game hook.
// Folds the move log, buffers out-of-order arrivals, gap-fills from Postgres,
// applies moves optimistically with visible rollback, streams over the bus.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../../lib/session/store';
import { emit, on } from '../../../lib/sync/bus';
import { supabase } from '../../../lib/db/client';
import { SeqBuffer } from './buffer';
import { fold, canMove } from './fold';
import {
  fetchMoves,
  fetchMoveRange,
  appendMove,
  finishSession,
} from './session';
import type { GameRules, MoveEnvelope, Outcome } from './types';
import type { GameMoveRow } from '../../../lib/db/database.types';

export type GameRuntime<S, M> = {
  state: S | null;
  outcome: Outcome | null;
  myTurn: boolean;
  loading: boolean;
  error: string | null;
  lastFailedMove: M | null; // shown in my voice, retryable (§2.3.6)
  move: (m: M) => Promise<boolean>;
  retryFailed: () => Promise<boolean>;
  moves: readonly MoveEnvelope<M>[];
};

function rowToEnvelope<M>(r: GameMoveRow): MoveEnvelope<M> {
  return { seq: r.seq, authorId: r.author_id, payload: r.payload as M };
}

function newOpId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function useGame<S, M>(
  rules: GameRules<S, M>,
  sessionId: string | null,
  seed: string,
): GameRuntime<S, M> {
  const userId = useSession((s) => s.userId);
  const [envelopes, setEnvelopes] = useState<MoveEnvelope<M>[]>([]);
  const [optimistic, setOptimistic] = useState<MoveEnvelope<M>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMove, setLastFailedMove] = useState<M | null>(null);
  const buffer = useRef(new SeqBuffer<M>(0));
  const finishedRef = useRef(false); // declared before the effects that use it
  const issuedRef = useRef(0); // last seq I issued — mirrors optimistic across ticks

  // cold start: load the durable log (truth), fold it
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    finishedRef.current = false; // a new session must be allowed to finish again
    setEnvelopes([]);
    setOptimistic([]);
    buffer.current = new SeqBuffer<M>(0);
    issuedRef.current = 0;
    setLoading(true);
    void fetchMoves(sessionId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        const rows = res.data.map(rowToEnvelope<M>);
        buffer.current = new SeqBuffer<M>((rows[rows.length - 1]?.seq ?? 0));
        issuedRef.current = buffer.current.lastSeq;
        setEnvelopes(rows);
        setError(null);
      } else {
        setError(res.error.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const applyEnvelopes = useCallback((incoming: MoveEnvelope<M>[]) => {
    if (incoming.length > 0) setEnvelopes((prev) => [...prev, ...incoming]);
  }, []);

  // live: fast path (bus) with seq buffering + gap-fill; catch-up (postgres_changes)
  useEffect(() => {
    if (!sessionId) return;

    const off = on('game:move', (ev) => {
      if (ev.sessionId !== sessionId) return;
      const env: MoveEnvelope<M> = { seq: ev.seq, authorId: ev.by, payload: ev.move as M };
      const { ready, gap } = buffer.current.offer(env);
      applyEnvelopes(ready);
      if (gap) {
        void fetchMoveRange(sessionId, gap.from, gap.to).then((res) => {
          if (res.ok) applyEnvelopes(buffer.current.absorbGapFill(res.data.map(rowToEnvelope<M>)));
        });
      }
    });

    const channel = supabase
      .channel(`game-catchup:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_moves', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const env = rowToEnvelope<M>(payload.new as GameMoveRow);
          const { ready, gap } = buffer.current.offer(env);
          applyEnvelopes(ready);
          if (gap) {
            void fetchMoveRange(sessionId, gap.from, gap.to).then((res) => {
              if (res.ok) applyEnvelopes(buffer.current.absorbGapFill(res.data.map(rowToEnvelope<M>)));
            });
          }
        },
      )
      .subscribe();

    return () => {
      off();
      supabase.removeChannel(channel);
    };
  }, [sessionId, applyEnvelopes]);

  // drop optimistic moves once their real echo lands (matched by author+payload position)
  useEffect(() => {
    setOptimistic((prev) => prev.filter((o) => o.seq > buffer.current.lastSeq));
  }, [envelopes]);

  const allMoves = useMemo(() => [...envelopes, ...optimistic], [envelopes, optimistic]);
  const state = useMemo(
    () => (sessionId ? fold(rules, seed, allMoves) : null),
    [rules, seed, allMoves, sessionId],
  );
  const outcome = state ? rules.outcome(state) : null;

  // once decided, both phones mark the session finished (idempotent update)
  useEffect(() => {
    if (outcome && sessionId && !finishedRef.current) {
      finishedRef.current = true;
      void finishSession(sessionId, { winner: outcome.winner });
    }
  }, [outcome, sessionId]);

  const move = useCallback(
    async (m: M): Promise<boolean> => {
      if (!sessionId || !userId || !state) return false;
      if (!canMove(rules, state, userId)) return false;
      // seq must clear BOTH the durable log and my un-echoed moves — the ref
      // tracks issuance synchronously, so even a same-tick double-tap can't
      // collide with my own pending move. On failure we rewind it so no hole
      // is left in the log (a hole would stall the partner's gap detection).
      const seq = Math.max(buffer.current.lastSeq, issuedRef.current) + 1;
      issuedRef.current = seq;
      const env: MoveEnvelope<M> = { seq, authorId: userId, payload: m };

      setOptimistic((prev) => [...prev, env]); // my screen moves NOW
      const res = await appendMove(sessionId, userId, seq, m, newOpId());
      if (res.ok && res.data !== 'collision') {
        emit({ t: 'game:move', sessionId, move: m, seq, by: userId }); // fast path
        return true;
      }
      if (res.ok) {
        // collision: someone else took my seq — refold and let her try again
        const fresh = await fetchMoves(sessionId);
        if (fresh.ok) {
          const rows = fresh.data.map(rowToEnvelope<M>);
          buffer.current = new SeqBuffer<M>((rows[rows.length - 1]?.seq ?? 0));
          issuedRef.current = buffer.current.lastSeq;
          setEnvelopes(rows);
        }
      } else {
        issuedRef.current = buffer.current.lastSeq; // rewind — leave no hole
      }
      // visible rollback (§2.3.6): optimistic move comes off, she is told plainly
      setOptimistic((prev) => prev.filter((o) => o !== env));
      setLastFailedMove(m);
      return false;
    },
    [sessionId, userId, state, rules],
  );

  const retryFailed = useCallback(async (): Promise<boolean> => {
    if (lastFailedMove === null) return false;
    const okRetry = await move(lastFailedMove);
    if (okRetry) setLastFailedMove(null);
    return okRetry;
  }, [lastFailedMove, move]);

  const myTurn = !!(state && userId && !outcome && (rules.turnOf(state) === null || rules.turnOf(state) === userId));

  return { state, outcome, myTurn, loading, error, lastFailedMove, move, retryFailed, moves: allMoves };
}
