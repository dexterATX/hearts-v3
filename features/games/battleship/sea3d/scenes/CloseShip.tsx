// features/games/battleship/sea3d/scenes/CloseShip.tsx — the close-up of one
// of my own hearts, safe at anchor. A glass heart stands upright out of the
// water: lit gradient body, a sheen pouring in from the key light and an
// inner shadow climbing the far corner (both clipped to the silhouette), a
// silver specular crescent + dot, and a two-stage contact shadow pooling on
// the water. Three mini-wave layers lap at its base, each crest capped with
// a tiny foam arc; a two-tone pennant flutters on a sine; a 1px silver
// anchor line drops from the heart's base into the deep.
//
// Loop budget (4, all cancelled on unmount, all skipped under reduced
// motion): waveBack drift (shared by the back AND mid bands), waveFront
// drift, pennant flutter, glow breathing. Every band runs one wavelength
// past the box on BOTH sides and drifts by exactly its own λ per cycle, so
// two bands on one driver still wrap pixel-identical; pennant and glow read
// their wrapped timings through the sine table — no linear easing anywhere.
//
// HARD RULE (the production crash): never a `transform` key through
// useAnimatedProps. The pennant's rotation and the wave bands' drift live on
// Animated.View style arrays; svg animates numerically only (glow opacity).
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
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, radius } from '../../../../../theme/theme';
// games is ONE feature (§2.1): the arcade's shared key light and seeded
// randomness live in features/games/ui/art/materials
import { KEY_LIGHT, seededRand } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';

// heart fill gradient axis runs toward the silver key light and back
const HEART_LIGHT = {
  x1: 0.5 + KEY_LIGHT.dx * 0.75,
  y1: 0.5 + KEY_LIGHT.dy * 0.75,
  x2: 0.5 - KEY_LIGHT.dx * 0.75,
  y2: 0.5 - KEY_LIGHT.dy * 0.75,
};

// a sine lookup: wrapped timings run 0 → 1 and styles read motion through
// these tables, so loops slow into both ends like real water
const SINE_T: number[] = [];
const SINE_Y: number[] = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16;
  SINE_T.push(t);
  SINE_Y.push(Math.sin(t * 2 * Math.PI));
}

// the heart, upright: two arcs meeting at the cleft, bezier-pulled lobes
// (12×11 box, same silhouette the arcade sea uses)
const HEART_PATH =
  'M6 11 C2.5 7.5 0 5.6 0 3.2 C0 1.2 1.6 0 3.2 0 C4.4 0 5.4 0.7 6 1.8 C6.6 0.7 7.6 0 8.8 0 C10.4 0 12 1.2 12 3.2 C12 5.6 9.5 7.5 6 11 Z';
// the silver specular crescent on the upper-left lobe — the key light —
// plus its bright dot at the crescent's lit end, and a faint bounce arc
// just inside the lower-right rim (glass throws a little light back)
const SPEC_PATH = 'M2.1 3.7 C2.3 2.5 3.2 1.6 4.3 1.5';
const BOUNCE_PATH = 'M11.2 4.7 C10.6 6.3 9.5 7.7 8.1 8.8';

// heart placement inside the 100×100 box: upright, base just in the water
const HEART_S = 3.6; // heart box scale → 43.2 × 39.6
const HEART_W = 12 * HEART_S;
const HEART_H = 11 * HEART_S;
const HEART_X = 50 - HEART_W / 2;
const HEART_Y = 20;
const HEART_BASE = HEART_Y + HEART_H; // ≈ 59.6 — the waterline laps here

// the anchor line: 1px silver, static, sagging from the heart's base and
// hooking left at the bottom where the anchor catches
const ANCHOR_LINE = 'M50 58.6 C49.2 66.5 50.8 74.5 49.9 82 C49.5 85.8 48.1 87.1 46.8 86.6';

// seeded micro-texture: a fixed field of silver motes drifting on the water
// at 0.04–0.09 opacity — identical on every render and on both phones
type Speck = { x: number; y: number; r: number; o: number };
const SPECKS: Speck[] = (() => {
  const rand = seededRand('closeship-specks-v1');
  const out: Speck[] = [];
  for (let i = 0; i < 30; i++) {
    out.push({
      x: 2 + rand() * 96,
      y: 52 + rand() * 45,
      r: 0.18 + rand() * 0.3,
      o: 0.04 + rand() * 0.05,
    });
  }
  return out;
})();

type WaveShape = { fill: string; crest: string; foam: string };

// a sine band one wavelength wider than the box on BOTH sides; the drift
// loop translates by exactly λ, so the reset frame is pixel-identical.
// Foam caps: a tiny arc astride each visual peak (sin = −1 ⇔ y smallest);
// the peaks sit exactly λ apart, so the arcs wrap with the band.
const buildWave = (lambda: number, baseY: number, amp: number, phase: number): WaveShape => {
  const x0 = -lambda;
  const x1 = 100 + lambda;
  const steps = Math.ceil((x1 - x0) / 2);
  let crest = '';
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = baseY + amp * Math.sin(((2 * Math.PI) / lambda) * x + phase);
    crest += `${i === 0 ? 'M' : ' L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  let foam = '';
  const r = 1.2 + amp * 0.45;
  const first = ((-Math.PI / 2 - phase) * lambda) / (2 * Math.PI);
  const nMin = Math.ceil((x0 + r - first) / lambda);
  const nMax = Math.floor((x1 - r - first) / lambda);
  for (let n = nMin; n <= nMax; n++) {
    const cx = first + n * lambda;
    const cy = baseY - amp;
    foam +=
      `M${(cx - r).toFixed(2)} ${(cy + r * 0.55).toFixed(2)} ` +
      `Q${cx.toFixed(2)} ${(cy - r * 0.85).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy + r * 0.55).toFixed(2)}`;
  }
  return { crest, fill: `${crest} L${x1.toFixed(2)} 100 L${x0.toFixed(2)} 100 Z`, foam };
};

// three small lapping loops at the heart's base: the far band slides left
// on 8s, the mid band rides the SAME driver to the right (one loop, two
// counter-drifting layers), the near band slides right on 5.5s — different
// periods and wavelengths, never phase-locked
const WAVE_BACK_L = 46;
const WAVE_MID_L = 34;
const WAVE_FRONT_L = 26;
const WAVE_BACK = buildWave(WAVE_BACK_L, HEART_BASE + 0.5, 1.8, 0.6);
const WAVE_MID = buildWave(WAVE_MID_L, HEART_BASE + 2.2, 1.5, 3.9);
const WAVE_FRONT = buildWave(WAVE_FRONT_L, HEART_BASE + 4, 1.3, 2.3);
const WAVE_BACK_MS = 8000;
const WAVE_FRONT_MS = 5500;

// the pennant: ±4° on a 2s wrapped timing, read through the sine table so
// it eases into both ends and wraps at 0° where sin(0) = sin(2π)
const PENNANT_MS = 2000;
const PENNANT_DEG = 4;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** One lapping wave layer: the translation lives on an Animated.View (the
 *  only safe place for it), the svg inside paints band + crest + foam. */
function WaveLayer({
  shape,
  lambda,
  k,
  dir,
  fillOpacity,
  crestOpacity,
  crestWidth,
  foamOpacity,
  foamWidth,
  driver,
}: {
  shape: WaveShape;
  lambda: number;
  k: number;
  dir: 1 | -1;
  fillOpacity: number;
  crestOpacity: number;
  crestWidth: number;
  foamOpacity: number;
  foamWidth: number;
  driver: SharedValue<number>;
}) {
  const w = (100 + 2 * lambda) * k;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dir * lambda * k * driver.value }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: -lambda * k, top: 0, width: w, height: 100 * k },
        style,
      ]}
    >
      <Svg width={w} height={100 * k} viewBox={`${-lambda} 0 ${100 + 2 * lambda} 100`}>
        <Path d={shape.fill} fill={colors.blueSoft} opacity={fillOpacity} />
        <Path
          d={shape.crest}
          fill="none"
          stroke={colors.ink}
          strokeWidth={crestWidth}
          opacity={crestOpacity}
        />
        <Path
          d={shape.foam}
          fill="none"
          stroke={colors.silver}
          strokeWidth={foamWidth}
          strokeLinecap="round"
          opacity={foamOpacity}
        />
      </Svg>
    </Animated.View>
  );
}

/** My heart safe at anchor: a glass heart upright under a soft silver key
 *  light, three foam-capped wave layers lapping its base, a two-tone
 *  pennant fluttering on top, its anchor line dropping into the deep. */
export function CloseShip({ size }: SceneProps) {
  const reduced = useReducedMotion();
  const k = size / 100;
  const [ids] = useState(() => {
    const n = uid++;
    return {
      sea: `closeshipsea${n}`,
      glow: `closeshipglow${n}`,
      heart: `closeshipheart${n}`,
      sheen: `closeshipsheen${n}`,
      shade: `closeshipshade${n}`,
      clip: `closeshipclip${n}`,
    };
  });

  // the four loops' drivers (all park at 0 → a clean static frame)
  const waveBack = useSharedValue(0);
  const waveFront = useSharedValue(0);
  const pennant = useSharedValue(0);
  const glow = useSharedValue(0);

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
    pennant.value = withRepeat(
      withTiming(1, { duration: PENNANT_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    glow.value = withRepeat(
      withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(waveBack);
      cancelAnimation(waveFront);
      cancelAnimation(pennant);
      cancelAnimation(glow);
    };
  }, [reduced, waveBack, waveFront, pennant, glow]);

  // the flutter: rotation on a View style array, pivoting around the mast
  // base (the view is a square centered exactly on it), read through the
  // sine table so it eases into both ends instead of reversing linearly
  const pennantStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(pennant.value, SINE_T, SINE_Y) * PENNANT_DEG}deg` },
    ],
  }));

  // the silver halo breathes through the sine table — numeric svg prop only
  const glowProps = useAnimatedProps(() => ({
    opacity: 0.5 + 0.3 * ((interpolate(glow.value, SINE_T, SINE_Y) + 1) / 2),
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // the scene's own corner coincides with the dive stage's inner clip
      // (SeaCloseUp's MetallicFrame: radius.lg − its 2dp FRAME)
      style={{ width: size, height: size, borderRadius: radius.lg - 2, overflow: 'hidden' }}
    >
      {/* the base: depth gradient + the key light pooling from the top-left,
          the seeded specks, the anchor line, and the contact shadow */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={ids.sea} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.blueTint} />
          </LinearGradient>
          <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.silver} stopOpacity={0.3} />
            <Stop offset="0.55" stopColor={colors.silver} stopOpacity={0.1} />
            <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${ids.sea})`} />
        {/* the soft silver key light itself, washing in from the top-left */}
        <Ellipse cx={18} cy={10} rx={55} ry={40} fill={`url(#${ids.glow})`} opacity={0.6} />
        {/* the seeded motes on the water */}
        {SPECKS.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={colors.silver} opacity={s.o} />
        ))}
        {/* the anchor line, dropping from the heart's base into the deep —
            drawn before the heart so the join hides under its tip */}
        <Path
          d={ANCHOR_LINE}
          fill="none"
          stroke={colors.silver}
          strokeWidth={0.35}
          strokeLinecap="round"
          opacity={0.5}
        />
        {/* the contact shadow pools down-right of the base, away from the
            key light: a wide soft wash + a tight dark core */}
        <Ellipse
          cx={52.8}
          cy={HEART_BASE + 2}
          rx={HEART_W * 0.62}
          ry={2.8}
          fill={colors.bg}
          opacity={0.26}
        />
        <Ellipse
          cx={52}
          cy={HEART_BASE + 1.3}
          rx={HEART_W * 0.42}
          ry={1.6}
          fill={colors.bg}
          opacity={0.5}
        />
      </Svg>

      {/* the breathing silver halo behind the heart */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <AnimatedEllipse
          cx={50}
          cy={HEART_Y + HEART_H * 0.45}
          rx={30}
          ry={26}
          fill={`url(#${ids.glow})`}
          animatedProps={glowProps}
        />
      </Svg>

      {/* the glass heart itself: gradient body lit toward the key light,
          sheen + inner shadow clipped to the silhouette, specular crescent
          and dot on the upper-left lobe, faint bounce on the far rim */}
      <View
        style={{
          position: 'absolute',
          left: HEART_X * k,
          top: HEART_Y * k,
          width: HEART_W * k,
          height: HEART_H * k,
        }}
      >
        <Svg width={HEART_W * k} height={HEART_H * k} viewBox="0 0 12 11">
          <Defs>
            <LinearGradient
              id={ids.heart}
              x1={HEART_LIGHT.x1}
              y1={HEART_LIGHT.y1}
              x2={HEART_LIGHT.x2}
              y2={HEART_LIGHT.y2}
            >
              <Stop offset="0" stopColor={colors.blue} />
              <Stop offset="1" stopColor={colors.blueDeep} />
            </LinearGradient>
            {/* the sheen pours in from the key light and dies by mid-heart */}
            <LinearGradient id={ids.sheen} x1="0" y1="0" x2="0.6" y2="0.6">
              <Stop offset="0" stopColor={colors.silver} stopOpacity={0.34} />
              <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
            </LinearGradient>
            {/* the inner shadow climbs back from the far bottom-right corner */}
            <LinearGradient id={ids.shade} x1="1" y1="1" x2="0.42" y2="0.42">
              <Stop offset="0" stopColor={colors.bg} stopOpacity={0.36} />
              <Stop offset="1" stopColor={colors.bg} stopOpacity={0} />
            </LinearGradient>
            <ClipPath id={ids.clip}>
              <Path d={HEART_PATH} />
            </ClipPath>
          </Defs>
          <Path d={HEART_PATH} fill={`url(#${ids.heart})`} />
          <G clipPath={`url(#${ids.clip})`}>
            <Rect x={0} y={0} width={12} height={11} fill={`url(#${ids.sheen})`} />
            <Rect x={0} y={0} width={12} height={11} fill={`url(#${ids.shade})`} />
          </G>
          <Path
            d={BOUNCE_PATH}
            fill="none"
            stroke={colors.silver}
            strokeWidth={0.5}
            strokeLinecap="round"
            opacity={0.16}
          />
          <Path
            d={SPEC_PATH}
            fill="none"
            stroke={colors.silver}
            strokeWidth={0.9}
            strokeLinecap="round"
            opacity={0.7}
          />
          <Circle cx={4.2} cy={1.6} r={0.38} fill={colors.silver} opacity={0.9} />
        </Svg>
      </View>

      {/* the tiny pennant on top: mast + folded flag, fluttering ±4° around
          the mast base — rotation on an Animated.View, never an svg
          transform. The fold splits the flag along a crease from the mast
          to the tip: upper face catches the key light, lower face in shade */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (50 - 7) * k,
            top: (HEART_Y - 7) * k,
            width: 14 * k,
            height: 14 * k,
          },
          pennantStyle,
        ]}
      >
        <Svg width={14 * k} height={14 * k} viewBox="0 0 14 14">
          <Path
            d="M7 7 L7 0.8"
            stroke={colors.silver}
            strokeWidth={0.8}
            strokeLinecap="round"
          />
          <Path d="M7 1 L12.4 2.7 L7 2.3 Z" fill={colors.blue} opacity={0.95} />
          <Path d="M7 2.3 L12.4 2.7 L7 4.4 Z" fill={colors.blueDeep} opacity={0.95} />
        </Svg>
      </Animated.View>

      {/* the water lapping at the base: three counter-drifting mini-waves
          with foam caps, drawn OVER the heart's base so it sits in the sea
          (back + mid share one driver; front runs its own) */}
      <WaveLayer
        shape={WAVE_BACK}
        lambda={WAVE_BACK_L}
        k={k}
        dir={-1}
        fillOpacity={0.5}
        crestOpacity={0.12}
        crestWidth={0.5}
        foamOpacity={0.16}
        foamWidth={0.3}
        driver={waveBack}
      />
      <WaveLayer
        shape={WAVE_MID}
        lambda={WAVE_MID_L}
        k={k}
        dir={1}
        fillOpacity={0.42}
        crestOpacity={0.18}
        crestWidth={0.65}
        foamOpacity={0.28}
        foamWidth={0.35}
        driver={waveBack}
      />
      <WaveLayer
        shape={WAVE_FRONT}
        lambda={WAVE_FRONT_L}
        k={k}
        dir={1}
        fillOpacity={0.3}
        crestOpacity={0.24}
        crestWidth={0.8}
        foamOpacity={0.4}
        foamWidth={0.4}
        driver={waveFront}
      />
    </View>
  );
}
