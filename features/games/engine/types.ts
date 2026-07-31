// features/games/engine/types.ts — one abstraction, four games (spec §2.6).
// PURE: no react, no react-native, no io. Runs in plain node.

export type UserId = string;

export type Outcome = {
  winner: UserId | null; // null = tie / cooperative finish — nobody ever "loses" (§6)
  summary: string; // affectionate ending text, shown on BOTH phones
};

export interface GameRules<S, M> {
  /** Deterministic initial state from a shared seed (both phones agree). */
  init(seed: string): S;
  /** PURE fold step. No io, no randomness — same log → same state. */
  apply(state: S, move: M, by: UserId): S;
  /** Whose turn, or null if anyone may move / game over. */
  turnOf(state: S): UserId | null;
  /** Non-null once the game is decided. */
  outcome(state: S): Outcome | null;
}

/** The wire shape of one logged move (mirrors game_moves row). */
export type MoveEnvelope<M = unknown> = {
  seq: number;
  authorId: UserId;
  payload: M;
};
