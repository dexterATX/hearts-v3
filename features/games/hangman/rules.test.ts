// features/games/hangman/rules.test.ts — daisy rules, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { hangmanRules, hashWord, positionsOf, PETALS, type HangmanState } from './rules';
import { fold } from '../engine/fold';

const SETTER = 'scotty';
const GUESSER = 'annsleigh';
const SEED = 'test-seed';

function playedState(word: string, guesses: string[]): HangmanState {
  const moves = [
    { seq: 1, authorId: SETTER, payload: { k: 'commit' as const, wordHash: hashWord(SEED, word), length: word.length } },
    ...guesses.flatMap((letter, i) => [
      { seq: 2 + i * 2, authorId: GUESSER, payload: { k: 'guess' as const, letter } },
      { seq: 3 + i * 2, authorId: SETTER, payload: { k: 'verdict' as const, letter, positions: positionsOf(word, letter) } },
    ]),
  ];
  return fold(hangmanRules, SEED, moves);
}

describe('hangman rules', () => {
  it('the hash is deterministic — both phones agree', () => {
    expect(hashWord(SEED, 'sunflower')).toBe(hashWord(SEED, ' sunflower '));
    expect(hashWord(SEED, 'sunflower')).not.toBe(hashWord('other-seed', 'sunflower'));
  });

  it('positions are found locally, case-insensitively', () => {
    expect(positionsOf('Lily', 'l')).toEqual([0, 2]);
    expect(positionsOf('rose', 'x')).toEqual([]);
  });

  it('a hit places letters and keeps the petals', () => {
    const s = playedState('rose', ['r']);
    expect(s.revealed[0]).toBe('r');
    expect(s.petals).toBe(PETALS);
  });

  it('a miss plucks one petal', () => {
    const s = playedState('rose', ['x']);
    expect(s.petals).toBe(PETALS - 1);
  });

  it('repeat guesses are ignored', () => {
    const s = playedState('rose', ['x', 'x']);
    expect(s.tried).toEqual(['x']);
    expect(s.petals).toBe(PETALS - 1);
  });

  it('only the setter may append verdicts', () => {
    const moves = [
      { seq: 1, authorId: SETTER, payload: { k: 'commit' as const, wordHash: hashWord(SEED, 'rose'), length: 4 } },
      { seq: 2, authorId: GUESSER, payload: { k: 'guess' as const, letter: 'r' } },
      { seq: 3, authorId: GUESSER, payload: { k: 'verdict' as const, letter: 'r', positions: [0] } },
    ];
    const s = fold(hangmanRules, SEED, moves);
    expect(s.revealed).toEqual([null, null, null, null]);
  });

  it('revealing every letter ends the game, affectionately', () => {
    const s = playedState('or', ['o', 'r']);
    expect(s.phase).toBe('done');
    expect(hangmanRules.outcome(s)?.summary).toContain('daisy');
  });

  it('losing the last petal still ends with love, never a loser (§6)', () => {
    const s = playedState('rose', ['x', 'y', 'z', 'q', 'w', 'v']);
    expect(s.petals).toBe(0);
    expect(s.phase).toBe('done');
    const out = hangmanRules.outcome(s);
    expect(out?.winner).toBeNull();
    expect(out?.summary).toContain('loves you');
  });
});
