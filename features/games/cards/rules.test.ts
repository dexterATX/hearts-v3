// features/games/cards/rules.test.ts — the deck, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { cardsRules, deckFor, currentCard, cardsLeft, DECK, type CardLevel } from './rules';
import { fold } from '../engine/fold';

const A = 'scotty';
const B = 'annsleigh';
const LEVELS: CardLevel[] = ['sweet', 'deep'];

function begin(order?: number[]) {
  const full = order ?? deckFor(LEVELS).map((_, i) => i);
  return { k: 'begin' as const, levels: LEVELS, players: [A, B] as [string, string], order: full };
}

describe('cards rules', () => {
  it('spicy never appears unless opted in (§7.10)', () => {
    expect(deckFor(['sweet']).every((c) => c.level === 'sweet')).toBe(true);
    expect(deckFor(['sweet', 'deep']).some((c) => c.level === 'spicy')).toBe(false);
    expect(deckFor(['sweet', 'deep', 'spicy']).some((c) => c.level === 'spicy')).toBe(true);
  });

  it('draws alternate strictly between the two of us', () => {
    const s = fold(cardsRules, 'seed', [
      { seq: 1, authorId: A, payload: begin() },
      { seq: 2, authorId: A, payload: { k: 'draw' as const } },
      { seq: 3, authorId: A, payload: { k: 'draw' as const } }, // twice in a row — ignored
      { seq: 4, authorId: B, payload: { k: 'draw' as const } },
    ]);
    expect(s.drawn).toHaveLength(2);
    expect(s.lastDrawBy).toBe(B);
    expect(cardsRules.turnOf(s)).toBe(A);
  });

  it('skip advances without keeping the card', () => {
    const s = fold(cardsRules, 'seed', [
      { seq: 1, authorId: A, payload: begin([0, 1]) },
      { seq: 2, authorId: A, payload: { k: 'skip' as const } },
    ]);
    expect(s.drawn).toHaveLength(0);
    expect(s.index).toBe(1);
    expect(cardsLeft(s)).toBe(1);
  });

  it('current card comes from the filtered deck', () => {
    const s = fold(cardsRules, 'seed', [
      { seq: 1, authorId: A, payload: begin([1]) },
      { seq: 2, authorId: A, payload: { k: 'draw' as const } },
    ]);
    expect(currentCard(s)).toEqual(deckFor(LEVELS)[1]);
  });

  it('skipping past the end empties the deck, sweetly', () => {
    const s = fold(cardsRules, 'seed', [
      { seq: 1, authorId: A, payload: begin([0]) },
      { seq: 2, authorId: A, payload: { k: 'skip' as const } },
    ]);
    expect(s.phase).toBe('done');
    expect(cardsRules.outcome(s)?.winner).toBeNull();
  });

  it('the static deck is honest — every card has a kind and a level', () => {
    expect(DECK.length).toBeGreaterThan(10);
    for (const c of DECK) {
      expect(['truth', 'dare', 'wyr', 'twentyq']).toContain(c.kind);
      expect(['sweet', 'deep', 'spicy']).toContain(c.level);
    }
  });
});
