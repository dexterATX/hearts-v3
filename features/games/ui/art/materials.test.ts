// features/games/ui/art/materials.test.ts — the shared realism toolkit,
// plain node (§2.9). Determinism of the PRNG, exactness of the bezier
// endpoints, and sanity bounds on the numeric arc length.
import { describe, expect, it } from 'vitest';
import { cubicAt, cubicLength, seededRand, KEY_LIGHT, STOP_SETS } from './materials';

describe('seededRand', () => {
  it('is deterministic: same seed, same sequence, across instances', () => {
    const a = seededRand('sea-scene');
    const b = seededRand('sea-scene');
    const seqA = Array.from({ length: 16 }, () => a());
    const seqB = Array.from({ length: 16 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = seededRand('daisy');
    const b = seededRand('deck');
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays inside [0, 1)', () => {
    const rand = seededRand('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('cubicAt', () => {
  const p0 = { x: 2, y: 7 };
  const p1 = { x: 10, y: -4 };
  const p2 = { x: 20, y: 30 };
  const p3 = { x: 40, y: 1 };

  it('hits the endpoints exactly', () => {
    expect(cubicAt(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(cubicAt(p0, p1, p2, p3, 1)).toEqual(p3);
  });

  it('lands mid-segment on a straight-line cubic', () => {
    // control points exactly on the line → the curve IS the line
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 1 };
    const c = { x: 2, y: 2 };
    const d = { x: 3, y: 3 };
    const mid = cubicAt(a, b, c, d, 0.5);
    expect(mid.x).toBeCloseTo(1.5, 10);
    expect(mid.y).toBeCloseTo(1.5, 10);
  });
});

describe('cubicLength', () => {
  it('equals the straight-line distance for a collinear cubic', () => {
    const len = cubicLength({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 });
    expect(len).toBeCloseTo(3, 6);
  });

  it('bounds a quarter-circle bezier between chord and arc', () => {
    // standard quarter-circle approximation, kappa = 4/3·(√2 − 1)
    const k = (4 / 3) * (Math.SQRT2 - 1);
    const len = cubicLength({ x: 1, y: 0 }, { x: 1, y: k }, { x: k, y: 1 }, { x: 0, y: 1 });
    const chord = Math.hypot(1, 1); // straight line between the endpoints
    const arc = Math.PI / 2; // the true quarter-circle arc length
    expect(len).toBeGreaterThan(chord);
    expect(len).toBeCloseTo(arc, 3); // within a thousandth of the true arc
    expect(len).toBeLessThan(arc + 0.01);
  });

  it('converges: the default 100 samples sit within 0.01 of a fine estimate', () => {
    const p1 = { x: 0, y: 40 };
    const p2 = { x: 56, y: -20 };
    const p3 = { x: 56, y: 56 };
    const standard = cubicLength({ x: 0, y: 0 }, p1, p2, p3); // default 100
    const fine = cubicLength({ x: 0, y: 0 }, p1, p2, p3, 800);
    expect(Math.abs(fine - standard)).toBeLessThan(0.01);
  });
});

describe('shared constants', () => {
  it('KEY_LIGHT points up and to the left', () => {
    expect(KEY_LIGHT.dx).toBeLessThan(0);
    expect(KEY_LIGHT.dy).toBeLessThan(0);
  });

  it('every stop set is ordered, anchored at 0 and 1, and fading out', () => {
    for (const stops of Object.values(STOP_SETS)) {
      expect(stops.length).toBeGreaterThanOrEqual(2);
      expect(stops[0]?.o).toBe(0);
      expect(stops[stops.length - 1]?.o).toBe(1);
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i]?.o).toBeGreaterThan(stops[i - 1]?.o ?? -1);
      }
    }
  });
});
