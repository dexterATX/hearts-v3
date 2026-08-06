// features/games/hangman/rules.ts — "loves me, loves me not" daisy, six petals.
// Secrecy by architecture (§2.6): the setter's word NEVER leaves their device —
// only a hash travels. The guesser guesses; the setter's phone resolves the
// verdict locally and appends it. PURE: no io, no randomness.
import type { GameRules, UserId, Outcome } from '../engine/types';

export type HangmanMove =
  | { k: 'commit'; wordHash: number; length: number } // setter locks the word in
  | { k: 'guess'; letter: string } // guesser tries one letter
  | { k: 'verdict'; letter: string; positions: number[] }; // setter's phone answers

export type HangmanState = {
  phase: 'setting' | 'guessing' | 'done';
  setter: UserId | null;
  guesser: UserId | null;
  wordHash: number | null;
  length: number;
  revealed: (string | null)[]; // letters the verdicts have placed
  tried: string[]; // every guessed letter
  resolved: string[]; // letters with a verdict — a second verdict is a no-op
  petals: number; // six, one plucked per miss
  lastGuessBy: UserId | null;
};

export const PETALS = 6;

/** djb2 over `seed:word` — deterministic on both phones, no crypto needed
 *  for a couple's pinky-promise anti-cheat. */
export function hashWord(seed: string, word: string): number {
  const s = `${seed}:${word.toLowerCase().trim()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

/** Setter-side helper (runs ONLY on the setter's device): where does this
 *  letter occur in their local word? */
export function positionsOf(word: string, letter: string): number[] {
  const w = word.toLowerCase();
  const l = letter.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < w.length; i++) if (w[i] === l) out.push(i);
  return out;
}

export function isComplete(s: HangmanState): boolean {
  return s.length > 0 && s.revealed.every((r) => r !== null);
}

export const hangmanRules: GameRules<HangmanState, HangmanMove> = {
  init: () => ({
    phase: 'setting',
    setter: null,
    guesser: null,
    wordHash: null,
    length: 0,
    revealed: [],
    tried: [],
    resolved: [],
    petals: PETALS,
    lastGuessBy: null,
  }),

  apply(state, move, by) {
    switch (move.k) {
      case 'commit': {
        if (state.phase !== 'setting') return state;
        return {
          ...state,
          phase: 'guessing',
          setter: by,
          guesser: null, // resolved by turnOf caller — the OTHER user
          wordHash: move.wordHash,
          length: move.length,
          revealed: Array<string | null>(move.length).fill(null),
        };
      }
      case 'guess': {
        if (state.phase !== 'guessing') return state;
        const letter = move.letter.toLowerCase();
        if (state.tried.includes(letter)) return state; // no repeats
        return { ...state, tried: [...state.tried, letter], lastGuessBy: by };
      }
      case 'verdict': {
        if (state.phase !== 'guessing' || by !== state.setter) return state;
        const letter = move.letter.toLowerCase();
        if (!state.tried.includes(letter)) return state;
        if (state.resolved.includes(letter)) return state; // already judged — no double-pluck
        const revealed = [...state.revealed];
        for (const pos of move.positions) {
          if (pos >= 0 && pos < revealed.length) revealed[pos] = letter;
        }
        const hit = move.positions.length > 0;
        const next: HangmanState = {
          ...state,
          revealed,
          resolved: [...state.resolved, letter],
          petals: hit ? state.petals : state.petals - 1,
        };
        if (isComplete(next) || next.petals <= 0) return { ...next, phase: 'done' };
        return next;
      }
    }
  },

  turnOf(state) {
    if (state.phase !== 'guessing') return null;
    // A guess is awaiting its verdict → ONLY the setter may move (their phone
    // resolves it locally). Otherwise it's the guesser's move — returned as
    // null ("anyone") because the rules don't know both user ids; apply()
    // and the UI gate the rest. (The runtime's canMove must not block the
    // setter here — an earlier version did and verdicts could never land.)
    if (state.tried.length > state.resolved.length) return state.setter;
    return null;
  },

  outcome(state): Outcome | null {
    if (state.phase !== 'done') return null;
    if (isComplete(state)) {
      // Both phones render this, the setter's included — so not "you found".
      return { winner: null, summary: 'every letter found. the daisy says loves you, always' };
    }
    return { winner: null, summary: 'the last petal fell. and even loves-me-not loves you' };
  },
};
