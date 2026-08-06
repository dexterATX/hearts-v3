// features/games/ui/art/HeaderArt.tsx — the arcade's marquee: a wide, quiet
// composition that sits behind the header type. The ghosts of the games now
// drift in THREE PARALLAX DEPTH LAYERS — far (4 motifs at 0.08 opacity, 22s
// one-way drift, small and high), mid (3 at 0.13, 16s), near (2 at 0.2, 11s,
// bigger and lower) — each layer also bobbing on its own period (near bobs
// fastest, like closer water), so depth reads through motion before detail.
// Every ghost is a single-Path silhouette (daisy, heart, '?', card, stroke),
// adrift on its own lateral wander with its own phase offset; every loop is
// a reverse timing with inOut(quad) turnarounds (the slow-ambient allowance).
// The horizon is a gradient rule dissolving before either edge, and every
// ~14s a wide diagonal silver band (0.05 opacity) sweeps the full width
// left→right — 4.2s slow-in/out pass, then parked fully offscreen for the
// rest of the cycle, so the loop wrap snaps where nobody can see it. The
// root clips to the marquee, so the sweep's overhang and the drifting ghosts
// exit the frame instead of bleeding onto the page.
// Reduced motion: one static layer (the near ghosts at rest) — no loops at
// all. Gradient ids are minted per instance.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../../theme/theme';

// the marquee is always this tall; the parent hands it the width
const HEIGHT = 120;
// the hairline sits low, so the ghosts read as adrift above a horizon
const HORIZON_Y = 80;

// the light sweep: a wide silver band, rotated, washing left→right
const BAND_W = 150;
const BAND_H = 200; // overhangs the marquee — the root clips it
const BAND_ANGLE = 16; // degrees, leaning into the travel direction
// horizontal footprint of the rotated band: it must park fully past either
// edge, so the park offset and the travel both derive from this
const BAND_FOOT = Math.ceil(
  BAND_W * Math.cos((BAND_ANGLE * Math.PI) / 180) + BAND_H * Math.sin((BAND_ANGLE * Math.PI) / 180),
);
const SWEEP_MS = 4200; // the pass itself, slow-in/out
const PARK_MS = 9800; // parked offscreen between passes — 4.2 + 9.8 ≈ 14s
const BAND_OPACITY = 0.05;

// ── ghost silhouettes: one Path per motif ───────────────────────────────────

// the hangman daisy as a solid silhouette: six round petals + center, drawn
// as circle subpaths (arc pairs) on the 24-unit ghost grid
const DAISY_PATH = [
  'M9.4 6 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 Z',
  'M14.6 9 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 Z',
  'M14.6 15 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 Z',
  'M9.4 18 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 Z',
  'M4.2 15 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 Z',
  'M4.2 9 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0 Z',
  'M9.6 12 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0 Z',
].join(' ');

// the sea's tiny heart, on its own 12×11 viewBox (Svg centers it via the
// default preserveAspectRatio, so every ghost lays out in a square cell)
const HEART_PATH =
  'M6 11 C2.5 7.5 0 5.6 0 3.2 C0 1.2 1.6 0 3.2 0 C4.4 0 5.4 0.7 6 1.8 C6.6 0.7 7.6 0 8.8 0 C10.4 0 12 1.2 12 3.2 C12 5.6 9.5 7.5 6 11 Z';

// the quiz's wondering mark as a drawn silhouette (no font dependency): the
// outer bowl sweeps down into the stem, the inner counter carves back up,
// and the dot is a circle subpath below
const QUIZ_PATH = [
  'M7.6 8.2 C7.6 5.4 9.4 3.6 12 3.6 C14.7 3.6 16.4 5.3 16.4 7.6',
  'C16.4 10.6 13.4 11.1 13.4 13.6 L10.6 13.6',
  'C10.6 10.2 13.6 9.6 13.6 7.7 C13.6 6.6 12.9 5.9 12 5.9',
  'C11 5.9 10.3 6.7 10.3 8.2 Z',
  'M10.5 16.6 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 Z',
].join(' ');

// one card from the deck: a rounded-rect silhouette, the pip knocked out
// with evenodd so the page shows through the hole
const CARD_PATH = [
  'M9.5 4 L14.5 4 A2.5 2.5 0 0 1 17 6.5 L17 15.5 A2.5 2.5 0 0 1 14.5 18',
  'L9.5 18 A2.5 2.5 0 0 1 7 15.5 L7 6.5 A2.5 2.5 0 0 1 9.5 4 Z',
  'M10.3 11 a1.7 1.7 0 1 0 3.4 0 a1.7 1.7 0 1 0 -3.4 0 Z',
].join(' ');

// the canvas's first stroke, scaled onto the 24-unit ghost grid
const STROKE_PATH = 'M3.5 13.5 C7.7 5 13.7 19.6 19.7 9.3';

// gradient ids resolve per document; every instance mints its own
let uid = 0;

type MotifKind = 'daisy' | 'heart' | 'quiz' | 'card' | 'stroke';

type GhostSpec = {
  motif: MotifKind;
  /** anchor x, a fraction of the marquee width */
  at: number;
  /** resting center y, above the horizon */
  y: number;
  size: number;
  /** lateral drift amplitude, dp */
  amp: number;
  /** phase offset before the drift loop starts */
  delayMs: number;
};

type LayerSpec = {
  /** the whole layer's opacity — depth reads as faintness */
  opacity: number;
  /** one-way lateral drift duration shared by the layer's ghosts, ms */
  driftMs: number;
  /** one-way bob duration for the layer as a whole, ms */
  bobMs: number;
  /** bob amplitude, dp — nearer layers ride higher */
  bobDp: number;
  ghosts: readonly GhostSpec[];
};

// far → near: smaller, higher, fainter, slower behind; bigger, lower,
// brighter, quicker in front. Durations are pinned per layer (the parallax),
// phases and amplitudes differ per ghost so no two ever move in lockstep.
const FAR: LayerSpec = {
  opacity: 0.08,
  driftMs: 22000,
  bobMs: 6800,
  bobDp: 2,
  ghosts: [
    { motif: 'daisy', at: 0.08, y: 30, size: 16, amp: 20, delayMs: 0 },
    { motif: 'heart', at: 0.38, y: 44, size: 15, amp: 16, delayMs: 2600 },
    { motif: 'card', at: 0.62, y: 26, size: 16, amp: 24, delayMs: 1300 },
    { motif: 'stroke', at: 0.88, y: 40, size: 17, amp: 22, delayMs: 3900 },
  ],
};
const MID: LayerSpec = {
  opacity: 0.13,
  driftMs: 16000,
  bobMs: 5200,
  bobDp: 2.5,
  ghosts: [
    { motif: 'quiz', at: 0.2, y: 40, size: 20, amp: 22, delayMs: 800 },
    { motif: 'heart', at: 0.52, y: 56, size: 19, amp: 18, delayMs: 3400 },
    { motif: 'stroke', at: 0.78, y: 36, size: 21, amp: 26, delayMs: 1900 },
  ],
};
const NEAR: LayerSpec = {
  opacity: 0.2,
  driftMs: 11000,
  bobMs: 4100,
  bobDp: 3,
  ghosts: [
    { motif: 'daisy', at: 0.32, y: 62, size: 24, amp: 20, delayMs: 500 },
    { motif: 'card', at: 0.68, y: 48, size: 26, amp: 24, delayMs: 2400 },
  ],
};
const LAYERS: readonly LayerSpec[] = [FAR, MID, NEAR];

function Motif({ kind, size }: { kind: MotifKind; size: number }) {
  switch (kind) {
    // the daisy: solid silver silhouette
    case 'daisy':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={DAISY_PATH} fill={colors.silver} />
        </Svg>
      );
    // battleship's heart-dot
    case 'heart':
      return (
        <Svg width={size} height={size} viewBox="0 0 12 11">
          <Path d={HEART_PATH} fill={colors.blue} />
        </Svg>
      );
    // the wondering mark
    case 'quiz':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={QUIZ_PATH} fill={colors.silver} />
        </Svg>
      );
    // the card: silver slab, pip knocked through
    case 'card':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={CARD_PATH} fill={colors.silver} fillRule="evenodd" />
        </Svg>
      );
    // the canvas's blue pen stroke
    case 'stroke':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d={STROKE_PATH}
            fill="none"
            stroke={colors.blue}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}

// one ghost: only the lateral wander is its own — the bob rides the layer
function Ghost({ spec, driftMs, width }: { spec: GhostSpec; driftMs: number; width: number }) {
  const dx = useSharedValue(0);

  useEffect(() => {
    // raw-set to the near end of the range so the loop oscillates the full
    // ±amplitude around the anchor instead of 0 → amp; withDelay wraps the
    // repeat, so the phase offset applies once and never stalls between
    // iterations
    dx.value = -spec.amp;
    dx.value = withDelay(
      spec.delayMs,
      withRepeat(
        withTiming(spec.amp, { duration: driftMs, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(dx);
  }, [spec, driftMs, dx]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: Math.round(width * spec.at - spec.size / 2),
          top: Math.round(spec.y - spec.size / 2),
          width: spec.size,
          height: spec.size,
        },
        style,
      ]}
    >
      <Motif kind={spec.motif} size={spec.size} />
    </Animated.View>
  );
}

// one depth layer: the shared bob carries every ghost in it, the shared
// opacity paints the whole layer at its depth
function Layer({ spec, width }: { spec: LayerSpec; width: number }) {
  const dy = useSharedValue(0);

  useEffect(() => {
    dy.value = -spec.bobDp;
    dy.value = withRepeat(
      withTiming(spec.bobDp, { duration: spec.bobMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(dy);
  }, [spec, dy]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: spec.opacity }, style]}>
      {spec.ghosts.map((g) => (
        <Ghost key={g.motif} spec={g} driftMs={spec.driftMs} width={width} />
      ))}
    </Animated.View>
  );
}

// the light sweep: parks fully offscreen left, crosses once, parks offscreen
// right, snaps home invisibly during the park — a ~14s cycle with one pass
function Sweep({ width, gradientId }: { width: number; gradientId: string }) {
  const sx = useSharedValue(0);
  // far enough that the rotated band's trailing edge clears the right edge
  const travel = width + 2 * BAND_FOOT;

  useEffect(() => {
    sx.value = withRepeat(
      withSequence(
        withTiming(travel, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
        // the band is parked offscreen at both ends, so the instant reset is
        // the invisible loop wrap
        withDelay(PARK_MS, withTiming(0, { duration: 1 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(sx);
  }, [travel, sx]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: sx.value }, { rotate: `${BAND_ANGLE}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: -(BAND_FOOT + 20),
          top: (HEIGHT - BAND_H) / 2,
          width: BAND_W,
          height: BAND_H,
          opacity: BAND_OPACITY,
        },
        style,
      ]}
    >
      <Svg width={BAND_W} height={BAND_H}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset={0} stopColor={colors.silver} stopOpacity={0} />
            <Stop offset={0.5} stopColor={colors.silver} stopOpacity={1} />
            <Stop offset={1} stopColor={colors.silver} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={BAND_W} height={BAND_H} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

export function HeaderArt({ width }: { width: number }) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { horizon: `hzn${n}`, sweep: `hsw${n}` };
  });

  return (
    // purely decorative: touch-transparent and hidden from the a11y tree.
    // overflow hidden clips the sweep's overhang and lets the ghosts drift
    // out of frame at the edges instead of bleeding onto the page
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: HEIGHT, overflow: 'hidden' }}
    >
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <LinearGradient id={ids.horizon} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.line} stopOpacity={0} />
            <Stop offset="0.1" stopColor={colors.line} stopOpacity={1} />
            <Stop offset="0.9" stopColor={colors.line} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.line} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* the horizon: a 1px gradient rule that dissolves before either edge */}
        <Rect x={0} y={HORIZON_Y - 0.5} width={width} height={1} fill={`url(#${ids.horizon})`} />
      </Svg>
      {reduced ? (
        // reduced motion: a single static layer — the near ghosts at rest
        <View style={[StyleSheet.absoluteFill, { opacity: NEAR.opacity }]}>
          {NEAR.ghosts.map((g) => (
            <View
              key={g.motif}
              style={{
                position: 'absolute',
                left: Math.round(width * g.at - g.size / 2),
                top: Math.round(g.y - g.size / 2),
                width: g.size,
                height: g.size,
              }}
            >
              <Motif kind={g.motif} size={g.size} />
            </View>
          ))}
        </View>
      ) : (
        <>
          {LAYERS.map((layer) => (
            <Layer key={layer.driftMs} spec={layer} width={width} />
          ))}
          <Sweep width={width} gradientId={ids.sweep} />
        </>
      )}
    </View>
  );
}
