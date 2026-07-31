// features/games/engine/session.ts — session + move persistence.
// THE ONLY engine file touching lib/db.
//
// Why moves go DIRECT, not through the outbox: a move's seq must be assigned
// against the authoritative log at write time (UNIQUE(session_id, seq) is the
// optimistic-concurrency backstop). A queued move carrying a stale seq would
// be rejected on flush anyway — so games apply optimistically, write directly,
// and roll back VISIBLY on failure. Content writes keep the outbox (§2.3).
import { supabase } from '../../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../../lib/result';
import type { GameKind, GameMoveRow, GameSessionRow } from '../../../lib/db/database.types';

export async function createSession(
  coupleId: string,
  kind: GameKind,
  firstTurn: string | null,
  initialState: unknown,
): Promise<Result<GameSessionRow>> {
  try {
    const res = await supabase
      .from('game_sessions')
      .insert({ couple_id: coupleId, kind, turn_user_id: firstTurn, state: initialState as Record<string, unknown> })
      .select()
      .single();
    if (res.error) return err(toAppError(res.error, 'could not start the game'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'could not start the game'));
  }
}

export async function fetchSession(sessionId: string): Promise<Result<GameSessionRow>> {
  try {
    const res = await supabase.from('game_sessions').select('*').eq('id', sessionId).single();
    if (res.error) return err(toAppError(res.error, 'the game would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'the game would not load'));
  }
}

export async function fetchMoves(sessionId: string): Promise<Result<GameMoveRow[]>> {
  try {
    const res = await supabase
      .from('game_moves')
      .select('*')
      .eq('session_id', sessionId)
      .order('seq', { ascending: true });
    if (res.error) return err(toAppError(res.error, 'the moves would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'the moves would not load'));
  }
}

/** Gap-fill: the authoritative page for [fromSeq, toSeq] (research pattern). */
export async function fetchMoveRange(
  sessionId: string,
  fromSeq: number,
  toSeq: number,
): Promise<Result<GameMoveRow[]>> {
  try {
    const res = await supabase
      .from('game_moves')
      .select('*')
      .eq('session_id', sessionId)
      .gte('seq', fromSeq)
      .lte('seq', toSeq)
      .order('seq', { ascending: true });
    if (res.error) return err(toAppError(res.error, 'catch-up failed'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'catch-up failed'));
  }
}

/**
 * Append a move. On a (session_id, seq) collision — both phones moved at
 * once — the caller refetches the log and retries with a fresh seq. op_id
 * makes a retried network write a no-op instead of a duplicate.
 */
export async function appendMove(
  sessionId: string,
  authorId: string,
  seq: number,
  payload: unknown,
  opId: string,
): Promise<Result<GameMoveRow | 'collision'>> {
  try {
    const res = await supabase
      .from('game_moves')
      .insert({ session_id: sessionId, author_id: authorId, seq, payload: payload as Record<string, unknown>, op_id: opId })
      .select()
      .single();
    if (res.error) {
      if (res.error.code === '23505') return ok('collision');
      return err(toAppError(res.error, 'the move did not land'));
    }
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'the move did not land — check your signal'));
  }
}

export async function finishSession(
  sessionId: string,
  outcome: { winner: string | null },
): Promise<void> {
  await supabase
    .from('game_sessions')
    .update({ status: 'finished', turn_user_id: outcome.winner })
    .eq('id', sessionId);
}

export async function listActiveSessions(coupleId: string): Promise<Result<GameSessionRow[]>> {
  try {
    const res = await supabase
      .from('game_sessions')
      .select('*')
      .eq('couple_id', coupleId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (res.error) return err(toAppError(res.error, 'games would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'games would not load'));
  }
}
