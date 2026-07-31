// features/games/battleship/rules.test.ts — hearts at sea, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import {
  battleshipRules,
  validateLayout,
  resolveShot,
  isSunk,
  hashFleet,
  TOTAL_HEARTS,
  GRID,
  type FleetLayout,
} from './rules';
import { fold } from '../engine/fold';

const A = 'scotty';
const B = 'annsleigh';
const SEED = 'sea-seed';

const layoutA: FleetLayout = [
  { cells: [0, 1, 2, 3].map((x) => ({ x, y: 0 })) }, // 4
  { cells: [0, 1, 2].map((x) => ({ x, y: 2 })) }, // 3
  { cells: [0, 1, 2].map((y) => ({ x: 5, y })) }, // 3
  { cells: [0, 1].map((x) => ({ x, y: 7 })) }, // 2
];

const layoutB: FleetLayout = [
  { cells: [3, 4, 5, 6].map((y) => ({ x: 7, y })) },
  { cells: [3, 4, 5].map((x) => ({ x, y: 4 })) },
  { cells: [3, 4, 5].map((y) => ({ x: 1, y })) },
  { cells: [6, 7].map((y) => ({ x: 3, y })) },
];

function start() {
  return fold(battleshipRules, SEED, [
    { seq: 1, authorId: A, payload: { k: 'commit', fleetHash: hashFleet(SEED, layoutA) } },
    { seq: 2, authorId: B, payload: { k: 'commit', fleetHash: hashFleet(SEED, layoutB) } },
  ]);
}

describe('fleet layout validation (local only)', () => {
  it('accepts a legal fleet', () => {
    expect(validateLayout(layoutA)).toEqual({ ok: true });
  });
  it('rejects overlap, diagonal, gaps, out of bounds', () => {
    expect(validateLayout([
      { cells: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] },
      ...layoutA.slice(1),
    ]).ok).toBe(false);
    expect(validateLayout([
      { cells: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] },
      ...layoutA.slice(1),
    ]).ok).toBe(false);
    expect(validateLayout([
      { cells: [{ x: GRID, y: 0 }, { x: GRID + 1, y: 0 }, { x: GRID + 2, y: 0 }, { x: GRID + 3, y: 0 }] },
      ...layoutA.slice(1),
    ]).ok).toBe(false);
  });
});

describe('shots and verdicts', () => {
  it('first committer fires first', () => {
    expect(start().turn).toBe(A);
  });

  it('a shot blocks until the OWNER answers', () => {
    const s = fold(battleshipRules, SEED, [
      { seq: 1, authorId: A, payload: { k: 'commit', fleetHash: 1 } },
      { seq: 2, authorId: B, payload: { k: 'commit', fleetHash: 2 } },
      { seq: 3, authorId: A, payload: { k: 'shot', x: 7, y: 3 } },
      { seq: 4, authorId: B, payload: { k: 'shot', x: 0, y: 0 } }, // not her turn
    ]);
    expect(s.shots).toHaveLength(0);
    expect(s.pendingShot).toEqual({ x: 7, y: 3, by: A });
  });

  it('the shooter cannot answer their own shot', () => {
    const s = fold(battleshipRules, SEED, [
      { seq: 1, authorId: A, payload: { k: 'commit', fleetHash: 1 } },
      { seq: 2, authorId: B, payload: { k: 'commit', fleetHash: 2 } },
      { seq: 3, authorId: A, payload: { k: 'shot', x: 7, y: 3 } },
      { seq: 4, authorId: A, payload: { k: 'verdict', x: 7, y: 3, result: 'hit' as const } },
    ]);
    expect(s.pendingShot).not.toBeNull();
  });

  it('a verdict records the shot; a hit shoots again, a miss hands over', () => {
    const afterHit = fold(battleshipRules, SEED, [
      { seq: 1, authorId: A, payload: { k: 'commit', fleetHash: 1 } },
      { seq: 2, authorId: B, payload: { k: 'commit', fleetHash: 2 } },
      { seq: 3, authorId: A, payload: { k: 'shot', x: 7, y: 3 } },
      { seq: 4, authorId: B, payload: { k: 'verdict', x: 7, y: 3, result: 'hit' as const } },
    ]);
    expect(afterHit.shots).toHaveLength(1);
    expect(afterHit.turn).toBe(A); // classic rule: hit earns another shot

    const afterMiss = fold(battleshipRules, SEED, [
      { seq: 1, authorId: A, payload: { k: 'commit', fleetHash: 1 } },
      { seq: 2, authorId: B, payload: { k: 'commit', fleetHash: 2 } },
      { seq: 3, authorId: A, payload: { k: 'shot', x: 4, y: 4 } },
      { seq: 4, authorId: B, payload: { k: 'verdict', x: 4, y: 4, result: 'miss' as const } },
    ]);
    expect(afterMiss.turn).toBe(B); // miss hands the sea over
  });

  it('duplicate shots on the same cell are ignored', () => {
    const s = fold(battleshipRules, SEED, [
      { seq: 1, authorId: A, payload: { k: 'commit', fleetHash: 1 } },
      { seq: 2, authorId: B, payload: { k: 'commit', fleetHash: 2 } },
      { seq: 3, authorId: A, payload: { k: 'shot', x: 7, y: 3 } },
      { seq: 4, authorId: B, payload: { k: 'verdict', x: 7, y: 3, result: 'hit' as const } },
      { seq: 5, authorId: A, payload: { k: 'shot', x: 7, y: 3 } }, // same cell again
    ]);
    expect(s.pendingShot).toBeNull();
    expect(s.shots).toHaveLength(1);
  });
});

describe('secrecy helpers (owner device only)', () => {
  it('resolveShot sees hits and misses', () => {
    expect(resolveShot(layoutA, 0, 0)).toBe('hit');
    expect(resolveShot(layoutA, 4, 4)).toBe('miss');
  });
  it('isSunk needs every cell', () => {
    expect(isSunk(layoutA[3], [{ x: 0, y: 7 }])).toBe(false);
    expect(isSunk(layoutA[3], [{ x: 0, y: 7 }, { x: 1, y: 7 }])).toBe(true);
  });
});

describe('ending', () => {
  it('finding all 12 heart cells ends it with love on both phones', () => {
    const moves = [
      { seq: 1, authorId: A, payload: { k: 'commit' as const, fleetHash: 1 } },
      { seq: 2, authorId: B, payload: { k: 'commit' as const, fleetHash: 2 } },
      ...layoutB.flatMap((p) => p.cells).flatMap((c, i) => [
        { seq: 3 + i * 2, authorId: A, payload: { k: 'shot' as const, x: c.x, y: c.y } },
        { seq: 4 + i * 2, authorId: B, payload: { k: 'verdict' as const, x: c.x, y: c.y, result: 'hit' as const } },
      ]),
    ];
    const s = fold(battleshipRules, SEED, moves);
    expect(s.phase).toBe('done');
    const out = battleshipRules.outcome(s);
    expect(out?.winner).toBe(A);
    expect(out?.summary).toContain('hearts');
    expect(TOTAL_HEARTS).toBe(12);
  });
});
