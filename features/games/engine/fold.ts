// features/games/engine/fold.ts — state = moves.reduce(apply, init(seed)).
// NEVER sync derived state — sync moves (spec §2.6). Both phones fold the
// same log through the same pure apply and arrive at identical state.
import type { GameRules, MoveEnvelope, UserId } from './types';

export function fold<S, M>(
  rules: GameRules<S, M>,
  seed: string,
  moves: readonly MoveEnvelope<M>[],
): S {
  const ordered = [...moves].sort((a, b) => a.seq - b.seq);
  return ordered.reduce(
    (state, m) => rules.apply(state, m.payload, m.authorId),
    rules.init(seed),
  );
}

/** The seq the NEXT appended move must carry — server assigns via max(seq)+1,
 *  clients predict with this for the optimistic fast path. */
export function nextSeq(moves: readonly MoveEnvelope[]): number {
  return moves.reduce((max, m) => Math.max(max, m.seq), 0) + 1;
}

/** Validate a move BEFORE appending: turn order + outcome not reached. */
export function canMove<S, M>(
  rules: GameRules<S, M>,
  state: S,
  by: UserId,
): boolean {
  if (rules.outcome(state)) return false;
  const turn = rules.turnOf(state);
  return turn === null || turn === by;
}
