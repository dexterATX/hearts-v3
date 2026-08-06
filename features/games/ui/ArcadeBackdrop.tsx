// features/games/ui/ArcadeBackdrop.tsx — the arcade's ambient depth, in three
// layers. Deepest, a static starfield: forty one-dp silver pinpricks at 4–6%
// opacity scattered across the upper two-thirds, so the dark keeps a texture
// even at rest. Above it, three large blue light pools drift ±30dp on 9–14s
// reverse loops, out of phase by both duration and start delay; peaks sit at
// 5–8% opacity over transparent — a glow you feel, not a thing you see.
// Above them, eight two-dp motes (six blue, two silver, 10–20% opacity)
// float slowly upward, 40dp over 11–17s each on its own duration and delay.
// A mote's opacity is 0 for the first and last 15% of its loop, so the wrap
// back to the start happens while it is invisible — no jump is ever seen.
// Last, one shooting mote: a 2dp blue dot that crosses the top quarter on a
// long diagonal every ~18s — 2.2s of eased travel, then parked offscreen for
// 16s; it is offscreen at both ends of the pass, so its wrap is invisible
// too. Every scatter comes from one fixed seed each, precomputed once at
// module load: nothing changes between renders or launches. Reduced motion:
// the pools rest, the motes sit still at full peak, the starfield simply
// stays, and the shooting mote never flies. Every loop is UI-thread and
// cancelled on unmount.
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../theme/theme';

// gradient ids resolve per document; every instance mints its own
let uid = 0;

// the pools: positions are window fractions, size is a window-width multiple.
// Durations span 9–14s and never share a period between a pool's two axes, so
// each path wanders (a slow Lissajous) instead of sliding on one diagonal.
const POOLS = [
  // high and left, the brightest — the page's key light
  { w: 1.15, cx: 0.2, cy: 0.14, peak: 0.08, ax: 30, ay: 22, xMs: 9000, yMs: 12000, delayMs: 0 },
  // mid-right, dimmer, the slowest
  { w: 0.95, cx: 0.95, cy: 0.48, peak: 0.06, ax: 26, ay: 30, xMs: 11000, yMs: 14000, delayMs: 2400 },
  // low and left, the faintest — depth under the bottom of the list
  { w: 1.05, cx: 0.3, cy: 0.88, peak: 0.05, ax: 30, ay: 26, xMs: 13000, yMs: 10000, delayMs: 4700 },
] as const;

type PoolSpec = (typeof POOLS)[number];

// the motes: 8 two-dp dots scattered by one fixed seed. x/y are window
// fractions, peak is the mid-loop opacity, ms the full rise duration.
const DOT_SEED = 0x5eed; // fixed — the scatter is part of the design, not chance
const RISE_DP = 40; // how far a mote floats up per loop
const FADE = 0.15; // the first/last fraction of the loop spent fading in/out

// the starfield: 40 one-dp silver pinpricks over the upper two-thirds, each
// at 4–6% opacity. Its own seed, so the constellation never collides with
// the motes' scatter — and never moves at all.
const STAR_SEED = 0x57a2;
const STAR_COUNT = 40;

// the shooting mote: one pass of eased travel, then a long park offscreen —
// travel + park make the ~18s cadence
const SHOT_TRAVEL_MS = 2200;
const SHOT_PARK_MS = 15800;
const SHOT_FIRST_MS = 6000; // let the page's entrance settle before the first pass
const SHOT_PEAK = 0.5; // brighter than the drifting motes — it is an event
const SHOT_FADE = 0.18; // the first/last fraction of the pass spent fading
const SHOT_Y0 = 0.05; // window-height fraction where the pass starts, high left
const SHOT_Y1 = 0.2; // …and where it ends, lower right — never leaving the top quarter
const SHOT_EDGE = 24; // how far past the screen edge the pass starts/ends

// mulberry32: a tiny deterministic PRNG so the scatter is seeded, not random
// per render. Runs once, at module load; the result is frozen in DOTS.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DotSpec = {
  x: number;
  y: number;
  peak: number;
  ms: number;
  delayMs: number;
  silver: boolean;
};

const DOTS: readonly DotSpec[] = (() => {
  const rand = mulberry32(DOT_SEED);
  return Array.from({ length: 8 }, (_, i) => {
    const silver = i === 2 || i === 6; // two silver motes among the blue
    return {
      x: 0.06 + rand() * 0.88,
      y: 0.1 + rand() * 0.82,
      peak: silver ? 0.1 + rand() * 0.06 : 0.1 + rand() * 0.1,
      ms: Math.round(11000 + rand() * 6000),
      delayMs: Math.round(rand() * 5200),
      silver,
    };
  });
})();

type StarSpec = { x: number; y: number; o: number };

const STARS: readonly StarSpec[] = (() => {
  const rand = mulberry32(STAR_SEED);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: 0.03 + rand() * 0.94,
    y: 0.02 + rand() * 0.64, // the upper two-thirds
    o: 0.04 + rand() * 0.02,
  }));
})();

function Pool({ spec, id, width, height }: { spec: PoolSpec; id: string; width: number; height: number }) {
  const reduced = useReducedMotion();
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const size = Math.round(width * spec.w);

  useEffect(() => {
    // reduced motion: the shared values stay 0 — the pool rests exactly where
    // it was placed, and no loop ever starts
    if (reduced) return;
    // raw-set to the near end of the range so the loop below oscillates the
    // full ±amplitude around the rest position instead of 0 → amp
    dx.value = -spec.ax;
    dy.value = -spec.ay;
    // withDelay wraps the repeat: the phase offset applies once, before the
    // loop starts — never a stall between iterations. inOut(quad) keeps the
    // turnaround soft, so the reverse never reads as a jolt.
    dx.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(spec.ax, { duration: spec.xMs, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    dy.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(spec.ay, { duration: spec.yMs, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    return () => {
      cancelAnimation(dx);
      cancelAnimation(dy);
    };
  }, [reduced, spec, dx, dy]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }, { translateY: dy.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: Math.round(width * spec.cx - size / 2),
          top: Math.round(height * spec.cy - size / 2),
          width: size,
          height: size,
        },
        style,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={spec.peak} />
            <Stop offset="0.55" stopColor={colors.blue} stopOpacity={spec.peak * 0.45} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function Dot({ spec, width, height }: { spec: DotSpec; width: number; height: number }) {
  const reduced = useReducedMotion();
  // one progress value drives the whole loop: 0 → 1 over `ms`, then it wraps
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    // not a reverse loop: p snaps 1 → 0 at the wrap, but opacity is 0 at both
    // ends (the FADE windows below), so the snap happens while invisible.
    // inOut(quad) lets the rise settle gently at both ends of the journey.
    p.value = withDelay(
      spec.delayMs,
      withRepeat(withTiming(1, { duration: spec.ms, easing: Easing.inOut(Easing.quad) }), -1, false),
    );
    return () => cancelAnimation(p);
  }, [reduced, spec, p]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, FADE, 1 - FADE, 1], [0, spec.peak, spec.peak, 0]),
    transform: [{ translateY: -RISE_DP * p.value }],
  }));

  const base = {
    position: 'absolute' as const,
    left: Math.round(width * spec.x),
    top: Math.round(height * spec.y),
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: spec.silver ? colors.silver : colors.blue,
  };

  // reduced motion: the static frame — the mote simply rests at its peak
  if (reduced) return <View style={[base, { opacity: spec.peak }]} />;
  return <Animated.View style={[base, style]} />;
}

function ShootingMote({ width, height }: { width: number; height: number }) {
  const reduced = useReducedMotion();
  // one progress value for the visible pass: 0 parked left → 1 parked right
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    // the sequence repeats without reversing: an eased pass, then a long hold
    // at 1 — the park is a hold, not motion, so the cadence is ~18s, not
    // 2.2s. p snaps 1 → 0 at the wrap, but the dot is offscreen (and at
    // opacity 0) at both ends of the pass, so the reset is never seen. The
    // outer withDelay applies once, before the first pass.
    p.value = withDelay(
      SHOT_FIRST_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: SHOT_TRAVEL_MS, easing: Easing.out(Easing.quad) }),
          withDelay(SHOT_PARK_MS, withTiming(1, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(p);
  }, [reduced, p]);

  const style = useAnimatedStyle(
    () => ({
      opacity: interpolate(p.value, [0, SHOT_FADE, 1 - SHOT_FADE, 1], [0, SHOT_PEAK, SHOT_PEAK, 0]),
      transform: [
        { translateX: interpolate(p.value, [0, 1], [-SHOT_EDGE, width + SHOT_EDGE]) },
        { translateY: interpolate(p.value, [0, 1], [height * SHOT_Y0, height * SHOT_Y1]) },
      ],
    }),
    [width, height],
  );

  // reduced motion: the pass simply never happens — the static frame is the
  // pools, the starfield, and the motes at their peaks
  if (reduced) return null;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: 2,
          height: 2,
          borderRadius: 1,
          backgroundColor: colors.blue,
        },
        style,
      ]}
    />
  );
}

export function ArcadeBackdrop() {
  const { width, height } = useWindowDimensions();
  // mint each pool's gradient id once, paired with its spec
  const [pools] = useState(() => POOLS.map((spec) => ({ spec, id: `abg${uid++}` })));

  return (
    // purely decorative: filled, touch-transparent, and hidden from the a11y tree
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {/* the starfield: the deepest layer, one static svg — it never animates,
          so it needs no loop and no reduced-motion branch */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {STARS.map((s, i) => (
          <Circle
            key={i}
            cx={width * s.x}
            cy={height * s.y}
            r={0.5}
            fill={colors.silver}
            fillOpacity={s.o}
          />
        ))}
      </Svg>
      {pools.map((p) => (
        <Pool key={p.id} spec={p.spec} id={p.id} width={width} height={height} />
      ))}
      {DOTS.map((spec, i) => (
        <Dot key={i} spec={spec} width={width} height={height} />
      ))}
      <ShootingMote width={width} height={height} />
    </View>
  );
}
