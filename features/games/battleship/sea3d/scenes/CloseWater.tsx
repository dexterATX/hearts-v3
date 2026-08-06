// features/games/battleship/sea3d/scenes/CloseWater.tsx — open water, flown
// down close: the unexplored cell at eye level. FOUR sine-ripple depths
// counter-drift on the wavelength wrap (each band runs one λ past the box on
// both sides and its loop translates by exactly λ, so the reset frame is
// pixel-identical in position AND ~0 velocity under inOut easing). The detail
// pass on top: three caustic filaments — thin bright S-curves standing in
// for the refracted light web (GPU Gems ch.2, taken aesthetically) —
// breathing a third of a period apart on ONE shared driver; a seeded foam
// speckle field (16 half-unit ink dots held at 0.06) so the surface never
// reads as flat gradient; the one shared top-left key light catching a single
// crest of the nearest band (a bright ink stroke at 0.12, sampled onto that
// band's own sine so the drift carries it instead of sliding off); and a
// faint inner shade at the frame edge seating the water in its cell. A tiny
// bubble rises every ~3s: 1.3s up, then it holds invisible at the surface
// while the driver parks, snapping back to the floor only at opacity 0 (wrap
// while invisible). Six loops total, every one cancelled on unmount; reduced
// motion holds the composed static frame.
//
// HARD RULE (learned from a production crash): NEVER pass a `transform` key
// through useAnimatedProps. Ripple translation lives on Animated.View style
// arrays; svg attributes animate numerically (opacity/strokeWidth/cx/cy/r)
// only.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, radius } from '../../../../../theme/theme';
import { KEY_LIGHT, seededRand } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';

// internal geometry lives in a fixed 120-unit box; `size` only scales it
const BOX = 120;

// the organic-motion lookup: wrapped 0 → 1 timings are read through this sine
// table so every loop slows into both ends like real water instead of
// reversing at constant speed (no linear motion anywhere)
const SINE_T: number[] = [];
const SINE_Y: number[] = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16;
  SINE_T.push(t);
  SINE_Y.push(Math.sin(t * 2 * Math.PI));
}

type WaveShape = { fill: string; crest: string };

// a sine band one wavelength wider than the box on BOTH sides; the drift loop
// translates by exactly λ, so the wrap frame is pixel-identical
const buildWave = (lambda: number, baseY: number, amp: number, phase: number): WaveShape => {
  const x0 = -lambda;
  const x1 = BOX + lambda;
  const steps = Math.ceil((x1 - x0) / 2);
  let crest = '';
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = baseY + amp * Math.sin(((2 * Math.PI) / lambda) * x + phase);
    crest += `${i === 0 ? 'M' : ' L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return { crest, fill: `${crest} L${x1.toFixed(2)} ${BOX} L${x0.toFixed(2)} ${BOX} Z` };
};

// sine peaks sit where 2πx/λ + φ = π/2 + 2πn; this picks the peak nearest
// `nearX`, so the glint lands on an actual crest top and not a flank
const crestPeakX = (lambda: number, phase: number, nearX: number): number => {
  const x0 = (lambda * (Math.PI / 2 - phase)) / (2 * Math.PI);
  return x0 + lambda * Math.round((nearX - x0) / lambda);
};

// a short lit segment of one crest, sampled onto the SAME sine as its band:
// rendered inside the band's drifting view it stays glued to the peak it
// lights. halfLen ≈ λ/5 keeps just the crest's top arc
const buildCrestGlint = (
  lambda: number,
  baseY: number,
  amp: number,
  phase: number,
  centerX: number,
  halfLen: number,
): string => {
  let d = '';
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const x = centerX - halfLen + (2 * halfLen * i) / steps;
    const y = baseY + amp * Math.sin(((2 * Math.PI) / lambda) * x + phase);
    d += `${i === 0 ? 'M' : ' L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
};

// four depths. Wavelengths share no common multiple so the layers never
// phase-lock; drift alternates direction so the swell reads as crossing seas.
// Farther = higher in frame, denser fill, softer crest; nearer = lower,
// thinner fill, sharper crest highlight from the top-left key light.
const WAVES = [
  { lambda: 64, baseY: 52, amp: 4.5, phase: 0.6, periodMs: 9000, dir: -1, fillOp: 0.45, crestOp: 0.1, crestW: 0.6 },
  { lambda: 44, baseY: 70, amp: 5.5, phase: 2.3, periodMs: 7000, dir: 1, fillOp: 0.34, crestOp: 0.16, crestW: 0.9 },
  { lambda: 30, baseY: 90, amp: 7, phase: 4.1, periodMs: 5000, dir: -1, fillOp: 0.24, crestOp: 0.24, crestW: 1.2 },
  { lambda: 22, baseY: 106, amp: 7.5, phase: 5.3, periodMs: 4000, dir: 1, fillOp: 0.16, crestOp: 0.3, crestW: 1.4 },
] as const;
const WAVE_SHAPES = WAVES.map((w) => buildWave(w.lambda, w.baseY, w.amp, w.phase));

// the key-lit crest: on the NEAREST band, the peak closest to the top-left
// light (KEY_LIGHT, the arcade's one shared key). Static in itself — it
// paints inside the band's own view, so the band's drift carries it
const NEAR = WAVES[3];
const GLINT_X = crestPeakX(NEAR.lambda, NEAR.phase, BOX / 2 + KEY_LIGHT.dx * 55);
const GLINT_D = buildCrestGlint(NEAR.lambda, NEAR.baseY, NEAR.amp, NEAR.phase, GLINT_X, NEAR.lambda * 0.2);

// caustic filaments: one cubic with opposed controls reads as an S. Three of
// them, phase-split thirds apart on the shared breath driver, so the light
// web sloshes across the water instead of blinking in unison
const buildFilament = (x0: number, y0: number, len: number, sag: number): string =>
  `M${x0} ${y0} C${(x0 + len * 0.35).toFixed(2)} ${(y0 - sag).toFixed(2)} ` +
  `${(x0 + len * 0.65).toFixed(2)} ${(y0 + sag).toFixed(2)} ${(x0 + len).toFixed(2)} ${y0.toFixed(2)}`;
const FILAMENTS = [
  { d: buildFilament(14, 36, 46, 5), phase: 0 },
  { d: buildFilament(52, 64, 52, 6), phase: 1 / 3 },
  { d: buildFilament(16, 92, 44, 4.5), phase: 2 / 3 },
] as const;
const FILAMENT_MS = 5200;

// fine foam speckle: a seeded scatter of half-unit ink dots at 0.06 — the
// micro-texture pass. Deterministic (seededRand, the shared PRNG), identical
// on every render and both phones; fully static, it costs no loop
const FOAM_DOTS = (() => {
  const rand = seededRand('close-water-foam');
  return Array.from({ length: 16 }, () => ({
    x: 6 + rand() * (BOX - 12),
    y: 8 + rand() * (BOX - 16),
    r: 0.35 + rand() * 0.25,
  }));
})();

// the occasional bubble: rise 1.3s, then hold invisible while the 3s period
// completes; the snap back to the seabed happens at opacity 0
const BUBBLE_X = 44;
const BUBBLE_RISE_MS = 1300;
const BUBBLE_HOLD_MS = 1700;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** One drifting ripple band: the translation lives on an Animated.View (the
 *  only safe place for it), the svg inside just paints the band. `glintD`
 *  (the nearest band only) adds the key-lit crest segment, carried by the
 *  same drift. */
function RippleLayer({
  shape,
  lambda,
  dir,
  fillOpacity,
  crestOpacity,
  crestWidth,
  glintD,
  k,
  driver,
}: {
  shape: WaveShape;
  lambda: number;
  dir: 1 | -1;
  fillOpacity: number;
  crestOpacity: number;
  crestWidth: number;
  glintD?: string;
  k: number;
  driver: SharedValue<number>;
}) {
  const w = (BOX + 2 * lambda) * k;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dir * lambda * k * driver.value }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: -lambda * k, top: 0, width: w, height: BOX * k }, style]}
    >
      <Svg width={w} height={BOX * k} viewBox={`${-lambda} 0 ${BOX + 2 * lambda} ${BOX}`}>
        <Path d={shape.fill} fill={colors.blueSoft} opacity={fillOpacity} />
        <Path
          d={shape.crest}
          fill="none"
          stroke={colors.ink}
          strokeWidth={crestWidth}
          opacity={crestOpacity}
        />
        {glintD ? (
          <Path
            d={glintD}
            fill="none"
            stroke={colors.ink}
            strokeWidth={1.1}
            strokeLinecap="round"
            opacity={0.12}
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
}

export function CloseWater({ size }: SceneProps) {
  const reduced = useReducedMotion();
  const k = size / BOX;
  const [ids] = useState(() => {
    const n = uid++;
    return { sea: `cwsea${n}`, shade: `cwshade${n}` };
  });

  // six drivers, six loops: four ripple drifts, one shared filament breath,
  // one bubble rise
  const waveBack = useSharedValue(0);
  const waveMid = useSharedValue(0);
  const waveFront = useSharedValue(0);
  const waveNear = useSharedValue(0);
  const breath = useSharedValue(0);
  const bubble = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const drift = (periodMs: number) =>
      withRepeat(withTiming(1, { duration: periodMs, easing: Easing.inOut(Easing.quad) }), -1, false);
    waveBack.value = drift(WAVES[0].periodMs);
    waveMid.value = drift(WAVES[1].periodMs);
    waveFront.value = drift(WAVES[2].periodMs);
    waveNear.value = drift(WAVES[3].periodMs);
    breath.value = drift(FILAMENT_MS);
    bubble.value = withRepeat(
      withSequence(
        withTiming(1, { duration: BUBBLE_RISE_MS, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: BUBBLE_HOLD_MS }), // parked at the surface, invisible
        withTiming(0, { duration: 0 }), // back to the floor before anyone can see
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(waveBack);
      cancelAnimation(waveMid);
      cancelAnimation(waveFront);
      cancelAnimation(waveNear);
      cancelAnimation(breath);
      cancelAnimation(bubble);
    };
  }, [reduced, waveBack, waveMid, waveFront, waveNear, breath, bubble]);

  // the caustic web: each filament rides the sine a third of a period apart,
  // brightening and thickening as it breathes in
  const filamentAProps = useAnimatedProps(() => {
    const glow = (interpolate(breath.value, SINE_T, SINE_Y) + 1) / 2;
    return { opacity: 0.03 + 0.1 * glow, strokeWidth: 0.5 + 0.2 * glow };
  });
  const filamentBProps = useAnimatedProps(() => {
    const glow = (interpolate((breath.value + 1 / 3) % 1, SINE_T, SINE_Y) + 1) / 2;
    return { opacity: 0.03 + 0.1 * glow, strokeWidth: 0.5 + 0.2 * glow };
  });
  const filamentCProps = useAnimatedProps(() => {
    const glow = (interpolate((breath.value + 2 / 3) % 1, SINE_T, SINE_Y) + 1) / 2;
    return { opacity: 0.03 + 0.1 * glow, strokeWidth: 0.5 + 0.2 * glow };
  });

  // the bubble: rises with a gentle two-cycle sideways wobble, fades in fast,
  // fades out at the surface; the long hold parks it here at opacity 0
  const bubbleProps = useAnimatedProps(() => {
    const t = bubble.value;
    return {
      cx: BUBBLE_X + 3 * Math.sin(t * 4 * Math.PI),
      cy: interpolate(t, [0, 1], [104, 16], Extrapolation.CLAMP),
      r: interpolate(t, [0, 1], [1.1, 1.9], Extrapolation.CLAMP),
      opacity: interpolate(t, [0, 0.12, 0.75, 1], [0, 0.55, 0.5, 0], Extrapolation.CLAMP),
    };
  });

  const waveDrivers = [waveBack, waveMid, waveFront, waveNear];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // the scene's own corner coincides with the dive stage's inner clip
      // (SeaCloseUp's MetallicFrame: radius.lg − its 2dp FRAME)
      style={{ width: size, height: size, borderRadius: radius.lg - 2, overflow: 'hidden' }}
    >
      {/* the base: a quiet depth gradient, darker toward the floor */}
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={ids.sea} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.blueTint} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={BOX} height={BOX} fill={`url(#${ids.sea})`} />
      </Svg>

      {/* the water itself: four counter-drifting ripple bands, moved as
          VIEWS; the nearest carries the key-lit crest */}
      {WAVES.map((w, i) => (
        <RippleLayer
          key={w.lambda}
          shape={WAVE_SHAPES[i] as WaveShape}
          lambda={w.lambda}
          dir={w.dir}
          fillOpacity={w.fillOp}
          crestOpacity={w.crestOp}
          crestWidth={w.crestW}
          glintD={i === WAVES.length - 1 ? GLINT_D : undefined}
          k={k}
          driver={waveDrivers[i] as SharedValue<number>}
        />
      ))}

      {/* light, texture + life overlay: numeric svg props only, never transform */}
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* the inner shade: ambient occlusion where the dive frame meets
              the water, darkest at the rim */}
          <RadialGradient id={ids.shade} cx="0.5" cy="0.45" r="0.72">
            <Stop offset="0" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.7" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.2} />
          </RadialGradient>
        </Defs>

        {/* the caustic web: three breathing S-curves on one shared driver */}
        <AnimatedPath
          d={FILAMENTS[0].d}
          fill="none"
          stroke={colors.ink}
          strokeWidth={0.6}
          strokeLinecap="round"
          animatedProps={filamentAProps}
        />
        <AnimatedPath
          d={FILAMENTS[1].d}
          fill="none"
          stroke={colors.ink}
          strokeWidth={0.6}
          strokeLinecap="round"
          animatedProps={filamentBProps}
        />
        <AnimatedPath
          d={FILAMENTS[2].d}
          fill="none"
          stroke={colors.ink}
          strokeWidth={0.6}
          strokeLinecap="round"
          animatedProps={filamentCProps}
        />

        {/* the foam micro-texture: seeded, static, barely there */}
        <G opacity={0.06}>
          {FOAM_DOTS.map((d) => (
            <Circle
              key={`${d.x.toFixed(2)}-${d.y.toFixed(2)}`}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={colors.ink}
            />
          ))}
        </G>

        {/* one bubble language everywhere: silverSoft fill, silver rim — the
            same draw the Bubbles particle gives the wreck's column */}
        <AnimatedCircle
          cx={BUBBLE_X}
          cy={104}
          r={1.1}
          fill={colors.silverSoft}
          stroke={colors.silver}
          strokeWidth={0.6}
          animatedProps={bubbleProps}
        />

        <Rect x={0} y={0} width={BOX} height={BOX} fill={`url(#${ids.shade})`} />
      </Svg>
    </View>
  );
}
