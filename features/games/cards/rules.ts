// features/games/cards/rules.ts — truth or dare · would you rather · 20
// questions (§7.10). Opt-in levels. The deck is a deterministic shuffle of a
// static card list — same seed on both phones → same deck → apply stays pure.
import type { GameRules, UserId, Outcome } from '../engine/types';

export type CardLevel = 'sweet' | 'deep' | 'spicy'; // spicy is strictly opt-in (§7.10)
export type CardKind = 'truth' | 'dare' | 'wyr' | 'twentyq';

export type Card = { kind: CardKind; level: CardLevel; text: string };

export const DECK: readonly Card[] = [
  { kind: 'truth', level: 'sweet', text: 'what was the exact moment you knew?' },
  { kind: 'truth', level: 'sweet', text: 'what little thing do I do that you secretly love?' },
  { kind: 'truth', level: 'sweet', text: 'what song makes you think of me every time?' },
  { kind: 'truth', level: 'deep', text: 'what are you most afraid of losing?' },
  { kind: 'truth', level: 'deep', text: 'what have you never told me because you were scared?' },
  { kind: 'truth', level: 'deep', text: 'when did you last cry, and why?' },
  { kind: 'truth', level: 'spicy', text: 'what is your favorite memory of us alone?' },
  { kind: 'truth', level: 'spicy', text: 'what have you imagined but never said out loud?' },
  { kind: 'dare', level: 'sweet', text: 'send a voice note singing one line of our song' },
  { kind: 'dare', level: 'sweet', text: 'draw a terrible portrait of me on the canvas right now' },
  { kind: 'dare', level: 'deep', text: 'write the first sentence of the letter you owe me' },
  { kind: 'dare', level: 'spicy', text: 'describe your ideal night in, in exactly five words' },
  { kind: 'wyr', level: 'sweet', text: 'would you rather relive our first date or fast-forward to our next one?' },
  { kind: 'wyr', level: 'sweet', text: 'would you rather a year of Sundays together or one perfect week away?' },
  { kind: 'wyr', level: 'deep', text: 'would you rather know every thought I have or feel every feeling I hide?' },
  { kind: 'wyr', level: 'spicy', text: 'would you rather always know what I want, or always be surprised?' },
  { kind: 'twentyq', level: 'sweet', text: 'I am thinking of a place we have been. 20 questions. go.' },
  { kind: 'twentyq', level: 'deep', text: 'I am thinking of a memory I never told you about. 20 questions. go.' },
  { kind: 'twentyq', level: 'spicy', text: 'I am thinking of something I want to do with you. 20 questions. go.' },
] as const;

export type CardsMove =
  | { k: 'begin'; levels: CardLevel[]; players: [UserId, UserId]; order: number[] }
  | { k: 'draw' }
  | { k: 'skip' };

export type CardsState = {
  phase: 'lobby' | 'playing' | 'done';
  levels: CardLevel[];
  players: UserId[];
  order: number[]; // DECK indices, shuffled client-side by the starter
  index: number; // next card to draw
  drawn: number[]; // DECK indices already drawn
  lastDrawBy: UserId | null;
};

/** Filter the static deck by the opted-in levels (§7.10: spicy never appears
 *  unless BOTH opted in — enforced by the UI before begin). */
export function deckFor(levels: readonly CardLevel[]): Card[] {
  return DECK.filter((c) => levels.includes(c.level));
}

export function currentCard(s: CardsState): Card | null {
  if (s.phase !== 'playing' || s.drawn.length === 0) return null;
  const idx = s.drawn[s.drawn.length - 1];
  if (idx === undefined) return null;
  return deckFor(s.levels)[idx] ?? null;
}

export function cardsLeft(s: CardsState): number {
  return s.order.length - s.index;
}

export const cardsRules: GameRules<CardsState, CardsMove> = {
  init: () => ({ phase: 'lobby', levels: [], players: [], order: [], index: 0, drawn: [], lastDrawBy: null }),

  apply(state, move, by) {
    switch (move.k) {
      case 'begin': {
        if (state.phase !== 'lobby' || move.order.length === 0) return state;
        return { ...state, phase: 'playing', levels: move.levels, players: move.players, order: move.order };
      }
      case 'draw':
      case 'skip': {
        if (state.phase !== 'playing') return state;
        if (!state.players.includes(by)) return state;
        if (state.lastDrawBy === by) return state; // strictly alternating
        if (state.index >= state.order.length) return { ...state, phase: 'done' };
        const deckIdx = state.order[state.index];
        if (deckIdx === undefined) return { ...state, phase: 'done' };
        const drawn = move.k === 'draw' ? [...state.drawn, deckIdx] : state.drawn;
        const index = state.index + 1;
        const phase = index >= state.order.length && move.k === 'skip' ? ('done' as const) : state.phase;
        return { ...state, drawn, index, lastDrawBy: by, phase };
      }
    }
  },

  turnOf(state) {
    if (state.phase !== 'playing') return null;
    if (state.lastDrawBy === null) return null; // either may draw first
    return state.players.find((p) => p !== state.lastDrawBy) ?? null;
  },

  outcome(state): Outcome | null {
    if (state.phase !== 'done') return null;
    return { winner: null, summary: 'the deck is empty. shuffle again whenever you want' };
  },
};
