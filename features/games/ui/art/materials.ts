// features/games/ui/art/materials.ts — the shared realism toolkit every
// arcade art file builds on. Pure TS + theme tokens only: no RN, no
// reanimated, no react-native-svg, so it unit-tests in plain node (§2.9).
//
// What's here and why:
//   · seededRand — djb2 hash → LCG, the SAME algorithm pair as
//     features/voice's waveBars and features/home's story-row waveform. It is
//     re-implemented here on purpose (features never import each other,
//     §2.1): deterministic scatter — star fields, bubbles, petal jitter — so a
//     scene draws identically on every render and on both phones.
//   · cubicAt / cubicLength — the numeric-bezier technique CanvasArt already
//     uses (this react-native-svg has no pathLength prop), promoted to shared
//     so every scene can do dash-draw strokes and point-at-length tracking
//     without re-deriving the math.
//   · KEY_LIGHT — the ONE top-left key light shared by every scene. Specular
//     dots sit toward it, contact shadows fall away from it; if one scene lit
//     from the right the arcade wall would read as collage, not set.
//   · STOP_SETS — ready-made svg <Stop> triplets for the materials the
//     scenes share (silver sheen, pooled blue glow, water depth). One
//     definition per material keeps highlight placement consistent.

import { colors } from '../../../../theme/theme';

// ── deterministic randomness ────────────────────────────────────────────────

/** Deterministic PRNG from a string seed: djb2 hashes the seed into a 32-bit
 *  state, then an LCG (Numerical Recipes constants) advances it. Same seed →
 *  same sequence on every render, every device — never Math.random in render.
 *  Returns values in [0, 1). */
export function seededRand(seed: string): () => number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  let state = h >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0; // LCG — deterministic
    return state / 4294967296; // 2^32 → [0, 1)
  };
}

// ── cubic bezier evaluation + arc length ────────────────────────────────────

export type Pt = { x: number; y: number };

/** Point at parameter t ∈ [0,1] on the cubic from p0 to p3 (controls p1, p2).
 *  t=0 returns p0 exactly, t=1 returns p3 exactly. */
export function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Arc length of the cubic, sampled into a polyline. 100 samples matches the
 *  accuracy CanvasArt's dash strokes already rely on; raise only for very
 *  long or very curvy paths. */
export function cubicLength(p0: Pt, p1: Pt, p2: Pt, p3: Pt, samples = 100): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const p = cubicAt(p0, p1, p2, p3, i / samples);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

// ── the one shared key light ────────────────────────────────────────────────

/** Unit-ish direction TOWARD the top-left key light. Speculars at
 *  center + KEY_LIGHT·r, contact shadows offset by −KEY_LIGHT. Shared by all
 *  scenes so the arcade reads as one lit stage. */
export const KEY_LIGHT = { dx: -0.4, dy: -0.6 } as const;

// ── shared gradient materials ───────────────────────────────────────────────

/** One svg <Stop> in the shape consumers map over:
 *  <Stop offset={s.o} stopColor={s.c} stopOpacity={s.op} /> */
export type StopSpec = { o: number; c: string; op: number };

export const STOP_SETS: Record<string, readonly StopSpec[]> = {
  // a metallic sheen sweeping across steel: bright edge, quick falloff
  silverSheen: [
    { o: 0, c: colors.silver, op: 0.16 },
    { o: 0.5, c: colors.silver, op: 0.04 },
    { o: 1, c: colors.silver, op: 0 },
  ],
  // a soft radial pool of the accent blue — glows, halos, lit felt
  bluePool: [
    { o: 0, c: colors.blue, op: 0.5 },
    { o: 0.55, c: colors.blue, op: 0.18 },
    { o: 1, c: colors.blue, op: 0 },
  ],
  // vertical water column: the surface catches the key light, depth sinks to bg
  waterDepth: [
    { o: 0, c: colors.blue, op: 0.28 },
    { o: 0.4, c: colors.blueTint, op: 0.9 },
    { o: 1, c: colors.bg, op: 1 },
  ],
} as const;
