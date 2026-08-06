// features/games/battleship/sea3d/layers/WaterBase.tsx — the board's water.
//
// The one always-on animated layer under the whole sea table, so it stays
// cheap: THREE loops total. A bg→blueTint depth gradient grounds the box.
// Two wide translucent wave bands counter-drift laterally on 9s / 14s
// wrapped timings — each path runs one wavelength past the box on BOTH
// sides and its loop translates by exactly λ, so the wrap is invisible in
// position AND velocity (in-out easing parks the drift at ~0 speed where
// the offset resets — the SeaArt wrap technique). Three caustic light
// blobs (radial blueSoft) share ONE breathing driver, phase-shifted per
// blob, opacity 0.05 ↔ 0.12.
//
// HARD RULE (the SeaArt production crash): never a `transform` key through
// useAnimatedProps. The wave drift lives on Animated.View transform arrays;
// svg animates numerically (opacity only, here).
//
// Reduced motion holds a static composed sea; every loop cancels on
// unmount.
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
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, radius } from '../../../../../theme/theme';

// internal paint space: 8 units per cell, 64 across the board
const BOX = 64;

// the table's corner: radius.lg, the same rounding the close-up stage wears —
// the water, the metal rim (GridLines) and the dive target all share it, so
// flying into a square reads as approaching the one continuous object
const CORNER_DP = radius.lg;

// sine lookup: wrapped 0 → 1 timings read motion through these tables, so
// breathing slows into both ends and the loop wrap lands where sin(0) =
// sin(2π) — identical position, ~0 velocity (no linear reverse anywhere)
const SINE_T: number[] = [];
const SINE_Y: number[] = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16;
  SINE_T.push(t);
  SINE_Y.push(Math.sin(t * 2 * Math.PI));
}

// a sine band one wavelength wider than the box on BOTH sides; the drift
// loop translates by exactly λ, so the reset frame is pixel-identical
const buildWave = (lambda: number, baseY: number, amp: number, phase: number): string => {
  const x0 = -lambda;
  const x1 = BOX + lambda;
  const steps = Math.ceil((x1 - x0) / 0.5);
  let crest = '';
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = baseY + amp * Math.sin(((2 * Math.PI) / lambda) * x + phase);
    crest += `${i === 0 ? 'M' : ' L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${crest} L${x1.toFixed(2)} ${BOX} L${x0.toFixed(2)} ${BOX} Z`;
};

// two depths of water: the wide far band drifts one way on 9s, the narrow
// near band the other on 14s. Differing wavelengths never phase-lock
const WAVE_BACK_L = 32;
const WAVE_FRONT_L = 64 / 3;
const WAVE_BACK = buildWave(WAVE_BACK_L, 30, 2.2, 0.6);
const WAVE_FRONT = buildWave(WAVE_FRONT_L, 44, 1.5, 2.3);
const WAVE_BACK_MS = 9000;
const WAVE_FRONT_MS = 14000;

// the caustics: three soft light wells, out of phase on one shared driver
const BREATHE_MS = 6500;
const BLOBS = [
  { cx: 14, cy: 18, r: 15, phase: 0 },
  { cx: 48, cy: 12, r: 12, phase: 0.33 },
  { cx: 34, cy: 50, r: 17, phase: 0.66 },
];
const CAUSTIC_LO = 0.05;
const CAUSTIC_HI = 0.12;
const CAUSTIC_MID = (CAUSTIC_LO + CAUSTIC_HI) / 2;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** One drifting wave band: the translation lives on an Animated.View (the
 *  only safe place for it), the svg inside just paints. */
function WaveBand({
  d,
  lambda,
  size,
  opacity,
  driver,
  reverse,
}: {
  d: string;
  lambda: number;
  size: number;
  opacity: number;
  driver: SharedValue<number>;
  reverse: boolean;
}) {
  const k = size / BOX;
  const w = (BOX + 2 * lambda) * k;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (reverse ? 1 : -1) * lambda * k * driver.value }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: -lambda * k, top: 0, width: w, height: size }, style]}
    >
      <Svg width={w} height={size} viewBox={`${-lambda} 0 ${BOX + 2 * lambda} ${BOX}`}>
        <Path d={d} fill={colors.blueSoft} opacity={opacity} />
      </Svg>
    </Animated.View>
  );
}

/** One caustic blob: radial blueSoft light breathing on the shared driver,
 *  phase-shifted so the three wells never swell in lockstep. Numeric svg
 *  props only. */
function CausticBlob({
  cx,
  cy,
  r,
  phase,
  glowId,
  driver,
}: {
  cx: number;
  cy: number;
  r: number;
  phase: number;
  glowId: string;
  driver: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => {
    const wave = interpolate((driver.value + phase) % 1, SINE_T, SINE_Y); // -1..1
    return { opacity: CAUSTIC_MID + (CAUSTIC_HI - CAUSTIC_MID) * wave };
  });
  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={r}
      fill={`url(#${glowId})`}
      opacity={CAUSTIC_MID}
      animatedProps={props}
    />
  );
}

export function WaterBase({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const k = size / BOX;
  const [ids] = useState(() => {
    const n = uid++;
    return { depth: `waterdepth${n}`, glow: `waterglow${n}` };
  });

  // three shared values, three loops: back band, front band, caustic breath
  const waveBack = useSharedValue(0);
  const waveFront = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    waveBack.value = withRepeat(
      withTiming(1, { duration: WAVE_BACK_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    waveFront.value = withRepeat(
      withTiming(1, { duration: WAVE_FRONT_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    breathe.value = withRepeat(
      withTiming(1, { duration: BREATHE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(waveBack);
      cancelAnimation(waveFront);
      cancelAnimation(breathe);
    };
  }, [reduced, waveBack, waveFront, breathe]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: CORNER_DP, overflow: 'hidden' }}
      pointerEvents="none"
    >
      {/* the base: rounded depth gradient, bg at the surface down to blueTint */}
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={ids.depth} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.blueTint} />
          </LinearGradient>
          <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={1} />
            <Stop offset="0.55" stopColor={colors.blue} stopOpacity={0.45} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* the base: depth gradient, bg at the surface down to blueTint —
            its corner matches the View's clip (CORNER_DP, in box units) */}
        <Rect x={0} y={0} width={BOX} height={BOX} rx={CORNER_DP / k} fill={`url(#${ids.depth})`} />
      </Svg>

      {/* the swell: two counter-drifting translucent bands, moved as VIEWS.
          Reduced motion parks both drivers at 0 — a static composed sea. */}
      <WaveBand
        d={WAVE_BACK}
        lambda={WAVE_BACK_L}
        size={size}
        opacity={0.55}
        driver={waveBack}
        reverse={false}
      />
      <WaveBand
        d={WAVE_FRONT}
        lambda={WAVE_FRONT_L}
        size={size}
        opacity={0.32}
        driver={waveFront}
        reverse={true}
      />

      {/* the light: three caustic wells on one shared breath */}
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} style={StyleSheet.absoluteFill}>
        {reduced
          ? BLOBS.map((b) => (
              <Circle
                key={`${b.cx}-${b.cy}`}
                cx={b.cx}
                cy={b.cy}
                r={b.r}
                fill={`url(#${ids.glow})`}
                opacity={CAUSTIC_MID}
              />
            ))
          : BLOBS.map((b) => (
              <CausticBlob
                key={`${b.cx}-${b.cy}`}
                cx={b.cx}
                cy={b.cy}
                r={b.r}
                phase={b.phase}
                glowId={ids.glow}
                driver={breathe}
              />
            ))}
      </Svg>
    </View>
  );
}
