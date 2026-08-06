// features/games/ui/art/SeaArt.tsx — battleship as a quiet, listening sea.
//
// REALISM pass: the water is built from light and parallax, not detail. A
// bg→blueTint depth gradient grounds the box; the 4×4 grid is demoted to
// faint depth markers (0.25) UNDER the surface; two translucent sine-wave
// layers (blueSoft 0.5 / 0.28) counter-drift on 7s / 11s wrapped timings.
// Each wave path runs one wavelength past the box on both sides and its loop
// translates by exactly λ, so the wrap is invisible in position AND velocity
// (in-out easing parks the drift at ~0 speed right where the offset resets).
// A thin crest highlight rides each wave — the top-left key light catching
// the water. The sonar ping keeps its wandering-cell walk but fires like a
// droplet strike: an 80ms white-blue flash dot at the origin, then a ring
// whose stroke decays 2 → 0.5 as it spreads, then a fainter lagged echo.
// Three bezier hearts float on top: blue→blueDeep fill lit from the key
// light, an ink specular crescent on the upper-left lobe, a breathing radial
// glow, ±2dp sine bob + ±1.5dp sine drift + a 3° swing lagging a quarter
// period behind the lift (follow-through), and a 1dp ripple ellipse beneath
// that spreads as the heart dips. Reduced motion holds a static composed
// sea; every loop cancels on unmount.
//
// HARD RULE (learned from a production crash): NEVER pass a `transform` key
// through useAnimatedProps — Reanimated processes `transform` as an RN-style
// array and a string value kills the UI runtime. Svg attributes animate
// numerically (cx/r/opacity/strokeWidth); anything that MOVES is an
// Animated.View with a real transform array.
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
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors } from '../../../../theme/theme';
import { KEY_LIGHT } from './materials';

// the arcade's one key light lives in ./materials, shared by every scene:
// top-left. The heart fill's gradient axis runs toward it and back; the 0.75
// reach keeps the blue→blueDeep transition as soft as it ever was (|Δ| ≈ 1.08)
const HEART_LIGHT = {
  x1: 0.5 + KEY_LIGHT.dx * 0.75,
  y1: 0.5 + KEY_LIGHT.dy * 0.75,
  x2: 0.5 - KEY_LIGHT.dx * 0.75,
  y2: 0.5 - KEY_LIGHT.dy * 0.75,
};

// grid geometry inside the 56×56 box
const PAD = 5;
const GAP = 2;
const CELL = (56 - PAD * 2 - GAP * 3) / 4; // 10
const cellCenter = (i: number) => PAD + i * (CELL + GAP) + CELL / 2;

// the only organic-motion curve in the scene: a sine lookup. Wrapped timings
// run 0 → 1 and the styles read motion through these tables, so bobbing
// slows into both ends like real water instead of reversing at constant
// speed (no linear reverse anywhere)
const SINE_T: number[] = [];
const SINE_Y: number[] = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16;
  SINE_T.push(t);
  SINE_Y.push(Math.sin(t * 2 * Math.PI));
}

type WaveShape = { fill: string; crest: string };

// a sine band one wavelength wider than the box on BOTH sides; the drift
// loop translates by exactly λ, so the reset frame is pixel-identical
const buildWave = (lambda: number, baseY: number, amp: number, phase: number): WaveShape => {
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

// two depths of water: the dense far layer drifts left on 7s, the thin near
// layer slides right on 11s. Counter-drift reads as cross-swell, and the
// differing wavelengths keep the layers from ever phase-locking
const WAVE_BACK_L = 28;
const WAVE_FRONT_L = 56 / 3;
const WAVE_BACK = buildWave(WAVE_BACK_L, 29.5, 2.6, 0.6);
const WAVE_FRONT = buildWave(WAVE_FRONT_L, 37, 1.8, 2.3);
const WAVE_BACK_MS = 7000;
const WAVE_FRONT_MS = 11000;

// the ping wanders: a fixed scattered path through the 16 cells, so the sea
// feels like it is searching, not scanning in rows
const PING_SEQ = [5, 14, 2, 9, 12, 7, 0, 10];
const PING_EVERY_MS = 2800;
const PING_MS = 900;
const FLASH_T = 80 / PING_MS; // the droplet-strike flash: 80ms before the ring
const ECHO_T = FLASH_T + 0.16; // the echo ring, lagging and fainter
const FLASH_R = 2; // a 4dp strike dot
const RING_R = 10.5;

// three hearts, out of phase: period and delay differ per heart; the lateral
// drift runs 1.5× the bob period so x and y never move in lockstep
const HEARTS = [
  { x: 13, y: 15, s: 6.4, opacity: 0.9, period: 2800, delay: 0 },
  { x: 41, y: 11, s: 5.2, opacity: 0.65, period: 3400, delay: 500 },
  { x: 31, y: 40, s: 5.8, opacity: 0.78, period: 4100, delay: 1100 },
];
const BOB_AMP = 2;
const DRIFT_AMP = 1.5;
const SWING_DEG = 3;

// a real heart: two arcs meeting at the cleft, bezier-pulled lobes (12×11)
const HEART_PATH =
  'M6 11 C2.5 7.5 0 5.6 0 3.2 C0 1.2 1.6 0 3.2 0 C4.4 0 5.4 0.7 6 1.8 C6.6 0.7 7.6 0 8.8 0 C10.4 0 12 1.2 12 3.2 C12 5.6 9.5 7.5 6 11 Z';
// the specular crescent on the upper-left lobe — the key light's signature
const SPEC_PATH = 'M2.1 3.7 C2.3 2.5 3.2 1.6 4.3 1.5';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** One drifting wave layer: the translation lives on an Animated.View (the
 *  only safe place for it), the svg inside just paints the band. */
function WaveLayer({
  shape,
  lambda,
  k,
  fillOpacity,
  crestOpacity,
  crestWidth,
  driver,
}: {
  shape: WaveShape;
  lambda: number;
  k: number;
  fillOpacity: number;
  crestOpacity: number;
  crestWidth: number;
  driver: SharedValue<number>;
}) {
  const w = (56 + 2 * lambda) * k;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -lambda * k * driver.value }],
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
          stroke={colors.ink}
          strokeWidth={crestWidth}
          opacity={crestOpacity}
        />
      </Svg>
    </Animated.View>
  );
}

/** One heart's motion, shared by its body and its ripple: bob + drift read
 *  wrapped timings through the sine table — slow into both ends, no
 *  constant-velocity reversing. Called exactly HEARTS.length times, in
 *  module-constant order. */
function useHeartMotion(period: number, delay: number) {
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    bob.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.quad) }), -1, false),
    );
    drift.value = withDelay(
      delay + 400,
      withRepeat(
        withTiming(1, { duration: Math.round(period * 1.5), easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(bob);
      cancelAnimation(drift);
    };
  }, [reduced, period, delay, bob, drift]);

  return { bob, drift };
}

/** The ripple ellipse: spreads and brightens as the heart dips into the
 *  water, tightens and fades as it lifts away. Numeric svg props only. */
function SeaHeartRipple({
  x,
  y,
  s,
  k: _k,
  bob,
  drift,
}: {
  x: number;
  y: number;
  s: number;
  k: number;
  bob: SharedValue<number>;
  drift: SharedValue<number>;
}) {
  const hh = (s * 11) / 12;
  const rippleProps = useAnimatedProps(() => {
    const lift = (interpolate(bob.value, SINE_T, SINE_Y) + 1) / 2;
    return {
      cx: x + s / 2 + DRIFT_AMP * interpolate(drift.value, SINE_T, SINE_Y),
      rx: s * 0.72 * (1.25 - 0.45 * lift),
      opacity: 0.32 - 0.2 * lift,
    };
  });

  return (
    <AnimatedEllipse
      cx={x + s / 2}
      cy={y + hh + 2.2}
      rx={s * 0.72}
      ry={1.1}
      fill="none"
      stroke={colors.blue}
      strokeWidth={0.8}
      opacity={0.22}
      animatedProps={rippleProps}
    />
  );
}

/** The heart itself, as an Animated.View carrying a tiny svg — translation,
 *  rotation and swing are RN transform arrays, never svg transform strings.
 *  The swing trails the lift by a quarter period: follow-through, like a
 *  real floating thing righting itself after the wave has already passed. */
function SeaHeartBody({
  x,
  y,
  s,
  opacity,
  k,
  bob,
  drift,
  gradId,
  glowId,
}: {
  x: number;
  y: number;
  s: number;
  opacity: number;
  k: number;
  bob: SharedValue<number>;
  drift: SharedValue<number>;
  gradId: string;
  glowId: string;
}) {
  const hh = (s * 11) / 12;

  const bodyStyle = useAnimatedStyle(() => {
    const lift = interpolate(bob.value, SINE_T, SINE_Y);
    return {
      transform: [
        { translateX: DRIFT_AMP * interpolate(drift.value, SINE_T, SINE_Y) * k },
        { translateY: -BOB_AMP * lift * k },
        { rotate: `${SWING_DEG * interpolate((bob.value + 0.25) % 1, SINE_T, SINE_Y)}deg` },
      ],
    };
  });
  // the halo breathes with the bob — brighter as the heart rides high
  const glowProps = useAnimatedProps(() => ({
    opacity: 0.65 + 0.35 * ((interpolate(bob.value, SINE_T, SINE_Y) + 1) / 2),
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: x * k, top: y * k, width: s * k, height: hh * k },
        bodyStyle,
      ]}
    >
      <Svg width={s * k} height={hh * k} viewBox="0 0 12 11">
        <AnimatedEllipse
          cx={6}
          cy={5.5}
          rx={8.5}
          ry={7.5}
          fill={`url(#${glowId})`}
          animatedProps={glowProps}
        />
        <Path d={HEART_PATH} fill={`url(#${gradId})`} opacity={opacity} />
        <Path
          d={SPEC_PATH}
          fill="none"
          stroke={colors.ink}
          strokeWidth={0.9}
          strokeLinecap="round"
          opacity={0.5}
        />
      </Svg>
    </Animated.View>
  );
}

export function SeaArt({ size = 56 }: { size?: number }) {
  const reduced = useReducedMotion();
  const k = size / 56;
  const [ids] = useState(() => {
    const n = uid++;
    return { sea: `sea${n}`, heart: `seaheart${n}`, glow: `seaglow${n}` };
  });

  // the ping: 0 → 1 over 900ms, restarted per cell by the JS timer below
  const ping = useSharedValue(1); // starts finished — nothing shows until the first fire
  const [cell, setCell] = useState<number>(PING_SEQ[0] as number);

  // the two wave drifts: wrapped 0 → 1, translated by exactly one wavelength
  const waveBack = useSharedValue(0);
  const waveFront = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const fire = (n: number) => {
      if (!alive) return;
      setCell(PING_SEQ[n % PING_SEQ.length] as number);
      ping.value = 0;
      ping.value = withTiming(1, { duration: PING_MS, easing: Easing.out(Easing.quad) });
      timer = setTimeout(() => fire(n + 1), PING_EVERY_MS);
    };
    timer = setTimeout(() => fire(0), 700); // the sea settles before it speaks
    return () => {
      alive = false;
      clearTimeout(timer);
      cancelAnimation(ping);
    };
  }, [reduced, ping]);

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
    return () => {
      cancelAnimation(waveBack);
      cancelAnimation(waveFront);
    };
  }, [reduced, waveBack, waveFront]);

  // the strike: an 80ms white-blue flash dot at the origin BEFORE the ring —
  // then the ring spreads on a decaying stroke (2 → 0.5), the echo lagging
  const flashProps = useAnimatedProps(() => ({
    r: interpolate(ping.value, [0, FLASH_T], [0.5, FLASH_R], Extrapolation.CLAMP),
    opacity: interpolate(
      ping.value,
      [0, 0.02, FLASH_T, FLASH_T + 0.01],
      [0, 0.95, 0, 0],
      Extrapolation.CLAMP,
    ),
  }));
  const ringProps = useAnimatedProps(() => ({
    r: interpolate(ping.value, [FLASH_T, 1], [1.8, RING_R], Extrapolation.CLAMP),
    opacity: interpolate(ping.value, [FLASH_T, FLASH_T + 0.06, 1], [0, 0.6, 0], Extrapolation.CLAMP),
    strokeWidth: interpolate(ping.value, [FLASH_T, 1], [2, 0.5], Extrapolation.CLAMP),
  }));
  const ring2Props = useAnimatedProps(() => ({
    r: interpolate(ping.value, [ECHO_T, 1], [1.4, RING_R - 2], Extrapolation.CLAMP),
    opacity: interpolate(ping.value, [ECHO_T, ECHO_T + 0.06, 1], [0, 0.3, 0], Extrapolation.CLAMP),
    strokeWidth: interpolate(ping.value, [ECHO_T, 1], [1.2, 0.4], Extrapolation.CLAMP),
  }));

  const ringCx = cellCenter(cell % 4);
  const ringCy = cellCenter(Math.floor(cell / 4));

  // one motion driver per heart, shared by body and ripple so they never
  // drift out of sync (HEARTS is a module constant — order is stable)
  const m0 = useHeartMotion((HEARTS[0] as (typeof HEARTS)[number]).period, (HEARTS[0] as (typeof HEARTS)[number]).delay);
  const m1 = useHeartMotion((HEARTS[1] as (typeof HEARTS)[number]).period, (HEARTS[1] as (typeof HEARTS)[number]).delay);
  const m2 = useHeartMotion((HEARTS[2] as (typeof HEARTS)[number]).period, (HEARTS[2] as (typeof HEARTS)[number]).delay);
  const heartMotion = [m0, m1, m2];

  return (
    <View
      style={{ width: size, height: size, borderRadius: 10 * k, overflow: 'hidden' }}
    >
      {/* the base: depth gradient + faint grid markers */}
      <Svg width={size} height={size} viewBox="0 0 56 56" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={ids.sea} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.blueTint} />
          </LinearGradient>
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
          <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={0.38} />
            <Stop offset="0.6" stopColor={colors.blue} stopOpacity={0.14} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={56} height={56} fill={`url(#${ids.sea})`} />
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <Rect
              key={`${row}-${col}`}
              x={PAD + col * (CELL + GAP)}
              y={PAD + row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2.5}
              fill={colors.blueSoft}
              opacity={0.25}
            />
          )),
        )}
      </Svg>

      {/* the water: two counter-drifting wave layers, moved as VIEWS */}
      <WaveLayer
        shape={WAVE_BACK}
        lambda={WAVE_BACK_L}
        k={k}
        fillOpacity={0.5}
        crestOpacity={0.1}
        crestWidth={0.5}
        driver={waveBack}
      />
      <WaveLayer
        shape={WAVE_FRONT}
        lambda={WAVE_FRONT_L}
        k={k}
        fillOpacity={0.28}
        crestOpacity={0.22}
        crestWidth={0.8}
        driver={waveFront}
      />

      {/* ping + ripples overlay: numeric svg props only, never transform */}
      <Svg width={size} height={size} viewBox="0 0 56 56" style={StyleSheet.absoluteFill}>
        {HEARTS.map((h, i) => (
          <SeaHeartRipple
            key={`${h.x}-${h.y}`}
            x={h.x}
            y={h.y}
            s={h.s}
            k={k}
            bob={(heartMotion[i] as (typeof heartMotion)[number]).bob}
            drift={(heartMotion[i] as (typeof heartMotion)[number]).drift}
          />
        ))}
        {!reduced ? (
          <>
            <AnimatedCircle
              cx={ringCx}
              cy={ringCy}
              r={0}
              fill={colors.ink}
              animatedProps={flashProps}
            />
            <AnimatedCircle
              cx={ringCx}
              cy={ringCy}
              r={0}
              fill="none"
              stroke={colors.blue}
              animatedProps={ringProps}
            />
            <AnimatedCircle
              cx={ringCx}
              cy={ringCy}
              r={0}
              fill="none"
              stroke={colors.blue}
              animatedProps={ring2Props}
            />
          </>
        ) : null}
      </Svg>

      {/* the hearts themselves: Animated.Views, each carrying its tiny svg */}
      {HEARTS.map((h, i) => (
        <SeaHeartBody
          key={`body-${h.x}-${h.y}`}
          x={h.x}
          y={h.y}
          s={h.s}
          opacity={h.opacity}
          k={k}
          bob={(heartMotion[i] as (typeof heartMotion)[number]).bob}
          drift={(heartMotion[i] as (typeof heartMotion)[number]).drift}
          gradId={ids.heart}
          glowId={ids.glow}
        />
      ))}
    </View>
  );
}
