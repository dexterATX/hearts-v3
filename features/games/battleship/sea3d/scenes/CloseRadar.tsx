// features/games/battleship/sea3d/scenes/CloseRadar.tsx — the close-up of
// unexplored enemy water: dark water with a faint grid and two slow drifting
// ripple bands, a sonar sweep arm rotating once every 3.5s with a gradient
// wedge trailing it (opacity decaying along the arc in five slices), two
// silver corner brackets breathing in/out ±2dp over a 1px blueSoft inner
// glow, a softly pulsing center dot, and a faint static range ring framing
// the scene.
//
// Motion budget: exactly 4 loops — sweep rotate, bracket breathe, ONE shared
// ripple drift, dot pulse. Every loop is a wrapped timing on an in-out curve
// so the wrap frames are pixel-identical: the rotate resets at 360 ≡ 0, each
// ripple band translates by exactly its own wavelength per cycle (the reset
// frame matches in position AND ~0 velocity), and the breathe/pulse reverse
// at rest speed. All movement lives on Animated.View transform arrays (the
// production-crash rule: NEVER a `transform` key through useAnimatedProps);
// svg attributes animate numerically only (the dot's opacity). Reduced
// motion holds a static composed frame: sweep parked at 35°, brackets and
// bands at rest, dot at full glow.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, radius } from '../../../../../theme/theme';
import type { SceneProps } from '../seaTypes';

// one full turn per 3.5s; the brackets breathe on exactly half that period so
// the two loops phase-lock at the sweep's slowest point instead of drifting
const SWEEP_MS = 3500;
const BREATHE_MS = SWEEP_MS / 2;
const BREATHE_DP = 2;
// the center dot's soft pulse: full glow down to 0.6 and back every 1.4s
const PULSE_MS = 1400;
const PULSE_LO = 0.6;
// the two ripple bands share ONE slow drift driver; different wavelengths and
// directions so the water reads as crossing seas, not a single sliding sheet
const RIPPLE_MS = 9000;

// geometry inside the 56×56 box: the reticle reaches just short of the edge,
// the wedge trails the leading edge by 42° in five fading slices
const CX = 28;
const CY = 28;
const R = 24;
const LEAD_DEG = 35; // parked angle for reduced motion
const TRAIL_DEG = 42;

const rad = (deg: number) => (deg * Math.PI) / 180;
const px = (deg: number) => CX + R * Math.cos(rad(deg));
const py = (deg: number) => CY + R * Math.sin(rad(deg));

// a sector slice of the trailing wedge, from `from` to `to` degrees behind 0°
const slice = (from: number, to: number) =>
  `M${CX} ${CY} L${px(from).toFixed(2)} ${py(from).toFixed(2)} ` +
  `A${R} ${R} 0 0 1 ${px(to).toFixed(2)} ${py(to).toFixed(2)} Z`;

// five slices, opacity decaying quadratically along the arc so the trail
// melts into the water instead of stepping down in visible bands (angles run
// clockwise, so the trail sits at negative rotation behind the arm)
const WEDGE_SLICES = 5;
const WEDGE: { d: string; opacity: number }[] = [];
for (let i = 0; i < WEDGE_SLICES; i++) {
  const t0 = i / WEDGE_SLICES;
  const t1 = (i + 1) / WEDGE_SLICES;
  const mid = (t0 + t1) / 2;
  WEDGE.push({
    d: slice(-TRAIL_DEG * (1 - t0), -TRAIL_DEG * (1 - t1)),
    opacity: 0.02 + 0.17 * (1 - mid) * (1 - mid),
  });
}

// faint depth grid under the water: 8×8, like the board it is a close-up of
const GRID_STEP = 7;
const GRID_LINES: number[] = [];
for (let i = 1; i < 8; i++) GRID_LINES.push(i * GRID_STEP);

// the two breathing brackets: top-left and bottom-right corners
const BRACKET = { offset: 6, arm: 10, size: 12 };

// the range ring framing the scene: static, just inside the clip corner
const RANGE_R = 27;

// ── the two slow ripple bands ───────────────────────────────────────────────
// a sine band one wavelength wider than the box on BOTH sides; the shared
// drift translates each band by exactly its own λ per cycle, so the wrap
// frame is pixel-identical for both even though they share one driver
type BandShape = { fill: string; crest: string };
const buildBand = (lambda: number, baseY: number, amp: number, phase: number): BandShape => {
  const x0 = -lambda;
  const x1 = 56 + lambda;
  const steps = Math.ceil((x1 - x0) / 2);
  let crest = '';
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = baseY + amp * Math.sin(((2 * Math.PI) / lambda) * x + phase);
    crest += `${i === 0 ? 'M' : ' L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return { crest, fill: `${crest} L${x1.toFixed(2)} 56 L${x0.toFixed(2)} 56 Z` };
};
const BANDS = [
  { lambda: 28, baseY: 17, amp: 1.8, phase: 0.9, dir: 1 as const, fillOp: 0.5, crestOp: 0.1 },
  { lambda: 40, baseY: 38, amp: 2.4, phase: 3.7, dir: -1 as const, fillOp: 0.35, crestOp: 0.14 },
];
const BAND_SHAPES = BANDS.map((b) => buildBand(b.lambda, b.baseY, b.amp, b.phase));

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** One drifting ripple band: the translation lives on an Animated.View (the
 *  only safe place for it), the svg inside just paints the band. */
function RippleBand({
  shape,
  lambda,
  dir,
  fillOpacity,
  crestOpacity,
  k,
  driver,
}: {
  shape: BandShape;
  lambda: number;
  dir: 1 | -1;
  fillOpacity: number;
  crestOpacity: number;
  k: number;
  driver: SharedValue<number>;
}) {
  const w = (56 + 2 * lambda) * k;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dir * lambda * k * driver.value }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: -lambda * k, top: 0, width: w, height: 56 * k }, style]}
    >
      <Svg width={w} height={56 * k} viewBox={`${-lambda} 0 ${56 + 2 * lambda} 56`}>
        <Path d={shape.fill} fill={colors.blueSoft} opacity={fillOpacity} />
        <Path
          d={shape.crest}
          fill="none"
          stroke={colors.lineBright}
          strokeWidth={0.5}
          opacity={crestOpacity}
        />
      </Svg>
    </Animated.View>
  );
}

export function CloseRadar({ size }: SceneProps) {
  const reduced = useReducedMotion();
  const k = size / 56;
  const [ids] = useState(() => {
    const n = uid++;
    return { water: `radarwater${n}`, wedge: `radarwedge${n}` };
  });

  // loop 1: the sweep, one full 360° turn per 3.5s (resets invisibly at 0 ≡ 360)
  const sweep = useSharedValue(LEAD_DEG);
  // loop 2: the brackets, 0 → 1 and back, read as ±2dp toward/away from center
  const breathe = useSharedValue(0.5);
  // loop 3: the shared ripple drift, one wavelength per 9s for both bands
  const ripple = useSharedValue(0);
  // loop 4: the center dot pulse, a fade so it rides withTiming by the rules
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    sweep.value = withRepeat(
      withTiming(360 + LEAD_DEG, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    breathe.value = withRepeat(
      withTiming(1, { duration: BREATHE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    ripple.value = withRepeat(
      withTiming(1, { duration: RIPPLE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withTiming(PULSE_LO, { duration: PULSE_MS / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(sweep);
      cancelAnimation(breathe);
      cancelAnimation(ripple);
      cancelAnimation(pulse);
    };
  }, [reduced, sweep, breathe, ripple, pulse]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value}deg` }],
  }));
  // top-left bracket moves down-right as it breathes in, bottom-right the
  // mirror image — both read the same driver so they stay in lockstep
  const bracketTLStyle = useAnimatedStyle(() => {
    const d = interpolate(breathe.value, [0, 1], [-BREATHE_DP, BREATHE_DP]);
    return { transform: [{ translateX: d }, { translateY: d }] };
  });
  const bracketBRStyle = useAnimatedStyle(() => {
    const d = interpolate(breathe.value, [0, 1], [BREATHE_DP, -BREATHE_DP]);
    return { transform: [{ translateX: d }, { translateY: d }] };
  });
  // the dot's halo and core pulse together; opacity is numeric svg, not a
  // transform, so it is safe through useAnimatedProps (animatedProps replaces
  // the static opacity prop wholesale, so the halo's 0.25 is baked in here)
  const dotHaloProps = useAnimatedProps(() => ({ opacity: pulse.value * 0.25 }));
  const dotCoreProps = useAnimatedProps(() => ({ opacity: pulse.value }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // the scene's own corner coincides with the dive stage's inner clip
      // (SeaCloseUp's MetallicFrame: radius.lg − its 2dp FRAME)
      style={{ width: size, height: size, borderRadius: radius.lg - 2, overflow: 'hidden' }}
    >
      {/* the water: depth gradient + faint grid + two slow ripple bands */}
      <Svg width={size} height={size} viewBox="0 0 56 56" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={ids.water} cx="0.5" cy="0.5" r="0.72">
            <Stop offset="0" stopColor={colors.surface} />
            <Stop offset="1" stopColor={colors.bg} />
          </RadialGradient>
          {/* userSpaceOnUse: the slices are thin sectors whose own bounding
              boxes would misplace an objectBoundingBox gradient's center */}
          <RadialGradient id={ids.wedge} gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r={R}>
            <Stop offset="0" stopColor={colors.blue} stopOpacity={0.9} />
            <Stop offset="0.7" stopColor={colors.blue} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={56} height={56} fill={`url(#${ids.water})`} />
        {GRID_LINES.map((g) => (
          <Line
            key={`v${g}`}
            x1={g}
            y1={0}
            x2={g}
            y2={56}
            stroke={colors.line}
            strokeWidth={0.5}
            opacity={0.35}
          />
        ))}
        {GRID_LINES.map((g) => (
          <Line
            key={`h${g}`}
            x1={0}
            y1={g}
            x2={56}
            y2={g}
            stroke={colors.line}
            strokeWidth={0.5}
            opacity={0.35}
          />
        ))}
      </Svg>

      {/* the ripples sit between water and reticle, moved as VIEWS */}
      {BANDS.map((b, i) => (
        <RippleBand
          key={b.lambda}
          shape={BAND_SHAPES[i] as BandShape}
          lambda={b.lambda}
          dir={b.dir}
          fillOpacity={b.fillOp}
          crestOpacity={b.crestOp}
          k={k}
          driver={ripple}
        />
      ))}

      {/* the reticle: rings + range ring, all static */}
      <Svg width={size} height={size} viewBox="0 0 56 56" style={StyleSheet.absoluteFill}>
        <Circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={colors.blue}
          strokeWidth={0.6}
          opacity={0.22}
        />
        <Circle
          cx={CX}
          cy={CY}
          r={R * 0.55}
          fill="none"
          stroke={colors.blue}
          strokeWidth={0.5}
          opacity={0.12}
        />
        {/* the faint range ring framing the scene */}
        <Circle
          cx={CX}
          cy={CY}
          r={RANGE_R}
          fill="none"
          stroke={colors.lineBright}
          strokeWidth={0.7}
          opacity={0.2}
        />
      </Svg>

      {/* the sweep: a rotating Animated.View carrying the wedge + leading arm;
          transform lives on the view, never on svg props */}
      <Animated.View
        style={[
          { position: 'absolute', left: 0, top: 0, width: size, height: size },
          sweepStyle,
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 56 56">
          {WEDGE.map((w, i) => (
            <Path key={i} d={w.d} fill={`url(#${ids.wedge})`} opacity={w.opacity} />
          ))}
          <Line
            x1={CX}
            y1={CY}
            x2={px(0)}
            y2={py(0)}
            stroke={colors.blue}
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={0.9}
          />
        </Svg>
      </Animated.View>

      {/* the brackets: silver 1.5px corners over a 1px blueSoft inner glow,
          breathing ±2dp, moved as views */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: BRACKET.offset * k,
            top: BRACKET.offset * k,
            width: BRACKET.size * k,
            height: BRACKET.size * k,
          },
          bracketTLStyle,
        ]}
      >
        <Svg width={BRACKET.size * k} height={BRACKET.size * k} viewBox="0 0 12 12">
          <Path
            d={`M0 ${BRACKET.arm} L0 0 L${BRACKET.arm} 0`}
            fill="none"
            stroke={colors.blueSoft}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <Path
            d={`M0 ${BRACKET.arm} L0 0 L${BRACKET.arm} 0`}
            fill="none"
            stroke={colors.silver}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (56 - BRACKET.offset - BRACKET.size) * k,
            top: (56 - BRACKET.offset - BRACKET.size) * k,
            width: BRACKET.size * k,
            height: BRACKET.size * k,
          },
          bracketBRStyle,
        ]}
      >
        <Svg width={BRACKET.size * k} height={BRACKET.size * k} viewBox="0 0 12 12">
          <Path
            d={`M${BRACKET.size - BRACKET.arm} 12 L12 12 L12 ${BRACKET.size - BRACKET.arm}`}
            fill="none"
            stroke={colors.blueSoft}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <Path
            d={`M${BRACKET.size - BRACKET.arm} 12 L12 12 L12 ${BRACKET.size - BRACKET.arm}`}
            fill="none"
            stroke={colors.silver}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>

      {/* the pulsing center dot and its quiet halo */}
      <Svg width={size} height={size} viewBox="0 0 56 56" style={StyleSheet.absoluteFill}>
        <AnimatedCircle
          cx={CX}
          cy={CY}
          r={2.6}
          fill={colors.blue}
          opacity={0.25}
          animatedProps={dotHaloProps}
        />
        <AnimatedCircle
          cx={CX}
          cy={CY}
          r={1.4}
          fill={colors.silver}
          animatedProps={dotCoreProps}
        />
      </Svg>
    </View>
  );
}
