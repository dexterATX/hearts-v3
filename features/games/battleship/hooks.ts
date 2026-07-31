// features/games/battleship/hooks.ts — fleets stay local; verdicts only (§7.8).
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from '../../../lib/session/store';
import { useGame } from '../engine/runtime';
import { createSession } from '../engine/session';
import { useGameSecrets } from '../engine/secrets';
import {
  battleshipRules,
  hashFleet,
  resolveShot,
  isSunk,
  type FleetLayout,
} from './rules';
import type { Result } from '../../../lib/result';
import { ok, err } from '../../../lib/result';
import type { GameSessionRow } from '../../../lib/db/database.types';

export function useBattleship(sessionId: string | null) {
  const runtime = useGame(battleshipRules, sessionId, sessionId ?? 'battleship');
  const userId = useSession((s) => s.userId);
  const myFleet = useGameSecrets((s) => (sessionId ? s.fleets[sessionId] : undefined));
  const attemptedRef = useRef<string | null>(null); // verdict loop-guard

  // the game is over — the sea can give up its secrets (device hygiene)
  useEffect(() => {
    if (runtime.outcome && sessionId) useGameSecrets.getState().clearSession(sessionId);
  }, [runtime.outcome, sessionId]);

  // OWNER'S DUTY: a shot lands on MY sea → resolve from my LOCAL fleet →
  // append the verdict. Her phone learns hit/miss/sunk, never my layout.
  // attemptedRef stops a failed verdict write from hot-looping on the refold
  // (fresh pendingShot identity each fold — swarm finding).
  useEffect(() => {
    const s = runtime.state;
    if (!s || !sessionId || !myFleet || !s.pendingShot || s.pendingShot.by === userId) return;
    if (runtime.lastFailedMove !== null) return; // manual retry owns it now
    const { x, y } = s.pendingShot;
    if (attemptedRef.current === `${x},${y}`) return;
    attemptedRef.current = `${x},${y}`;
    const hitsSoFar = s.shots
      .filter((shot) => shot.by !== userId && shot.result !== 'miss' && shot.result !== null)
      .map((shot) => ({ x: shot.x, y: shot.y }));
    const hitCells = [...hitsSoFar, { x, y }];
    let result = resolveShot(myFleet, x, y);
    if (result === 'hit') {
      const placement = myFleet.find((p) => p.cells.some((c) => c.x === x && c.y === y));
      if (placement && isSunk(placement, hitCells)) result = 'sunk';
    }
    void runtime.move({ k: 'verdict', x, y, result });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on pending shot
  }, [runtime.state?.pendingShot, myFleet, sessionId, userId]);

  const commitFleet = useCallback(
    async (layout: FleetLayout): Promise<boolean> => {
      if (!sessionId) return false;
      useGameSecrets.getState().setFleet(sessionId, layout);
      return runtime.move({ k: 'commit', fleetHash: hashFleet(sessionId, layout) });
    },
    [sessionId, runtime],
  );

  const fire = useCallback((x: number, y: number) => runtime.move({ k: 'shot', x, y }), [runtime]);

  return { ...runtime, commitFleet, fire, myFleet };
}

export function useStartBattleship(): {
  start: () => Promise<Result<GameSessionRow>>;
  busy: boolean;
} {
  const coupleId = useSession((s) => s.coupleId);
  const [busy, setBusy] = useState(false);
  const start = useCallback(async () => {
    if (!coupleId) return err({ code: 'validation', message: 'pair up first' });
    setBusy(true);
    try {
      const res = await createSession(coupleId, 'battleship', null, {});
      return res.ok ? ok(res.data) : res;
    } finally {
      setBusy(false);
    }
  }, [coupleId]);
  return { start, busy };
}
