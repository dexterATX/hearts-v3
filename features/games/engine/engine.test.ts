// features/games/engine/engine.test.ts — engine contracts, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { fold, nextSeq, canMove } from './fold';
import { SeqBuffer } from './buffer';
import type { GameRules, MoveEnvelope, Outcome } from './types';

// a minimal counting game to exercise the fold machinery
type CountState = { total: number; turn: string };
const countRules: GameRules<CountState, number> = {
  init: () => ({ total: 0, turn: 'a' }),
  apply: (s, n, by) => ({ total: s.total + n, turn: by === 'a' ? 'b' : 'a' }),
  turnOf: (s) => s.turn,
  outcome: (s): Outcome | null =>
    s.total >= 10 ? { winner: null, summary: 'you counted to ten together' } : null,
};

const mv = (seq: number, authorId: string, payload: number): MoveEnvelope<number> => ({
  seq,
  authorId,
  payload,
});

describe('fold', () => {
  it('is deterministic regardless of arrival order', () => {
    const moves = [mv(1, 'a', 2), mv(2, 'b', 3), mv(3, 'a', 4)];
    const shuffled = [mv(3, 'a', 4), mv(1, 'a', 2), mv(2, 'b', 3)];
    expect(fold(countRules, 'seed', moves)).toEqual(fold(countRules, 'seed', shuffled));
  });

  it('same log on both phones → identical state', () => {
    const moves = [mv(1, 'a', 5), mv(2, 'b', 6)];
    expect(fold(countRules, 's', moves)).toEqual({ total: 11, turn: 'a' });
  });

  it('computes the next seq as max+1', () => {
    expect(nextSeq([])).toBe(1);
    expect(nextSeq([mv(3, 'a', 1), mv(7, 'b', 1)])).toBe(8);
  });

  it('rejects moves out of turn or after the game ends', () => {
    expect(canMove(countRules, { total: 0, turn: 'a' }, 'a')).toBe(true);
    expect(canMove(countRules, { total: 0, turn: 'a' }, 'b')).toBe(false);
    expect(canMove(countRules, { total: 10, turn: 'a' }, 'a')).toBe(false);
  });
});

describe('SeqBuffer', () => {
  it('delivers in-order moves immediately', () => {
    const b = new SeqBuffer<number>(0);
    const r = b.offer(mv(1, 'a', 10));
    expect(r.ready).toHaveLength(1);
    expect(r.gap).toBeNull();
    expect(b.lastSeq).toBe(1);
  });

  it('drops duplicates by seq', () => {
    const b = new SeqBuffer<number>(0);
    b.offer(mv(1, 'a', 10));
    const dup = b.offer(mv(1, 'a', 10));
    expect(dup.duplicate).toBe(true);
    expect(dup.ready).toHaveLength(0);
  });

  it('buffers out-of-order moves and reports the gap', () => {
    const b = new SeqBuffer<number>(0);
    const r = b.offer(mv(3, 'a', 30));
    expect(r.ready).toHaveLength(0);
    expect(r.gap).toEqual({ from: 1, to: 2 });
  });

  it('drains the buffer when the gap closes', () => {
    const b = new SeqBuffer<number>(0);
    b.offer(mv(3, 'a', 30));
    b.offer(mv(2, 'b', 20));
    const r = b.offer(mv(1, 'a', 10));
    expect(r.ready.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(b.lastSeq).toBe(3);
  });

  it('absorbs an authoritative gap-fill page from Postgres', () => {
    const b = new SeqBuffer<number>(0);
    b.offer(mv(4, 'a', 40)); // held
    const applied = b.absorbGapFill([mv(1, 'a', 10), mv(2, 'b', 20), mv(3, 'a', 30)]);
    expect(applied.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });

  it('ignores gap-fill rows it already applied', () => {
    const b = new SeqBuffer<number>(2);
    const applied = b.absorbGapFill([mv(1, 'a', 10), mv(2, 'b', 20), mv(3, 'a', 30)]);
    expect(applied.map((m) => m.seq)).toEqual([3]);
  });
});
