// features/games/battleship/sea3d/scenes/CloseMiss.tsx — the splash that
// already happened. Not a failure scene: the sea took the shot, threw up a
// ring of foam, and is now settling back down. The settle reads as a proper
// splash now: an outer foam ring spreading on a 3s eased loop while an inner
// ring rides the SAME driver a half period out of phase (the secondary wave
// a real strike throws as the first one dies), and a cluster of six foam
// caps — tiny circles seeded once via materials.seededRand — rides the outer
// ring's radius as it spreads, shrinking and fading before the wrap. A bright
// splash patch decays once on mount, and as the water calms a specular
// crescent toward the shared top-left key light (KEY_LIGHT) surfaces on the
// settled core — the gloss of flat water coming back. The two wide swells
// underneath keep breathing, but their amplitudes decay with the settle
// driver (two decaying amplitudes: a big swell and a small one), so the sea
// literally stills itself. SprayMist hangs over the strike; Droplets fall
// back through it. Gentle, quiet — a near thing, not a loss.
//
// The board is seen at a tilt, so every ring here is an ELLIPSE (ry ≈ 0.55·rx).
//
// HARD RULES honoured: svg attributes animate numerically only (rx/ry/cx/cy/
// r/opacity/strokeWidth — never a `transform` key through useAnimatedProps);
// every loop wraps while invisible (rings and caps sit at opacity 0 on their
// reset frames; the swells read a sine table whose ends meet); reduced motion
// holds a static mid-settle frame; all loops cancel on unmount.
// Loops owned here: 2 (foam, breathe) + the Droplets and SprayMist drivers =
// 4 of the close-up budget's 5.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
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
import { KEY_LIGHT, seededRand } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';
import { Droplets } from '../particles/Droplets';
import { SprayMist } from '../particles/SprayMist';

// scene space: 96×96. The strike sits just below centre, where a shell
// hitting the water would read from the camera's tilt
const BOX = 96;
const CX = 48;
const CY = 52;
const SQUASH = 0.55; // the 34° tilt: rings are ellipses, never circles

const FOAM_MS = 3000; // the settle loop — slow, one breath of the ring
const BREATHE_MS = 4200; // the underlying swell, slower still
const SETTLE_MS = 2800; // one-shot: the splash brightness calming down
const INNER_PHASE = 0.5; // the inner ring rides the same driver half a period off

// ring travel windows: the outer ring runs wide, the inner one tighter
const OUTER_FROM = 11;
const OUTER_TO = 34;
const INNER_FROM = 8;
const INNER_TO = 26;

// the only organic-motion curve: a sine lookup, so the swells slow into both
// ends like real water instead of reversing at constant speed
const SINE_T: number[] = [];
const SINE_Y: number[] = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16;
  SINE_T.push(t);
  SINE_Y.push(Math.sin(t * 2 * Math.PI));
}

// six foam caps riding the outer ring: evenly spread angles with a seeded
// jitter, per-cap ride offset, size and fade lag — deterministic on every
// render and both phones, computed once at module scope
type CapSpec = { angle: number; ride: number; r: number; lag: number };
const CAPS: CapSpec[] = (() => {
  const rand = seededRand('closemiss-caps');
  return Array.from({ length: 6 }, (_, i) => ({
    angle: (i / 6) * 2 * Math.PI + (rand() - 0.5) * 0.65,
    ride: 0.9 + rand() * 0.18, // sits just inside or outside the ring line
    r: 1.05 + rand() * 0.85,
    lag: rand() * 0.12, // tiny stagger in the fade-in window
  }));
})();

// the key light's signature on the settled splash core: a short crescent
// centred on the KEY_LIGHT direction, hugging the core's upper-left edge from
// just inside (r 5 vs the settled core's 5.5). It fades in with the settle —
// gloss is what flat, calm water does
const SPEC_R = 5;
const SPEC_SPAN = 1.15; // ~66° of arc
const SPEC_PATH = (() => {
  const a = Math.atan2(KEY_LIGHT.dy, KEY_LIGHT.dx);
  const x0 = CX + SPEC_R * Math.cos(a - SPEC_SPAN / 2);
  const y0 = CY + SPEC_R * Math.sin(a - SPEC_SPAN / 2);
  const x1 = CX + SPEC_R * Math.cos(a + SPEC_SPAN / 2);
  const y1 = CY + SPEC_R * Math.sin(a + SPEC_SPAN / 2);
  // svg y is down, so rising angle sweeps clockwise on screen → sweep flag 1
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${SPEC_R} ${SPEC_R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
})();

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** One foam cap riding the outer ring. All motion derives from the shared
 *  foam driver; nothing here starts its own animation. */
function FoamCap({ spec, foam }: { spec: CapSpec; foam: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    const rr = interpolate(foam.value, [0, 1], [OUTER_FROM, OUTER_TO]) * spec.ride;
    return {
      cx: CX + Math.cos(spec.angle) * rr,
      cy: CY + Math.sin(spec.angle) * rr * SQUASH,
      r: spec.r * (1 - 0.3 * foam.value),
      // fully faded at both ends of the cycle, so the wrap never shows
      opacity: interpolate(
        foam.value,
        [0, 0.12 + spec.lag, 0.55, 0.85],
        [0, 0.8, 0.38, 0],
        Extrapolation.CLAMP,
      ),
    };
  });
  return <AnimatedCircle cx={CX} cy={CY} r={spec.r} fill={colors.ink} animatedProps={props} />;
}

export function CloseMiss({ size }: SceneProps) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { water: `cmwater${n}`, splash: `cmsplash${n}` };
  });

  const foam = useSharedValue(0); // 0 → 1, wrapped: ring spreads, fades out
  const breathe = useSharedValue(0); // 0 → 1, wrapped: read through SINE_*
  const settle = useSharedValue(0); // 0 → 1 once: the water calming

  useEffect(() => {
    if (reduced) {
      settle.value = 1; // already calm — the static frame below paints it
      return;
    }
    settle.value = withTiming(1, { duration: SETTLE_MS, easing: Easing.out(Easing.quad) });
    foam.value = withRepeat(
      withTiming(1, { duration: FOAM_MS, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    breathe.value = withRepeat(
      withTiming(1, { duration: BREATHE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(foam);
      cancelAnimation(breathe);
      cancelAnimation(settle);
    };
  }, [reduced, foam, breathe, settle]);

  // the outer foam ring: decelerating spread (eased out, like real foam
  // running out of push), stroke thinning as it goes, gone before the wrap
  const ring1Props = useAnimatedProps(() => ({
    rx: interpolate(foam.value, [0, 1], [OUTER_FROM, OUTER_TO]),
    ry: interpolate(foam.value, [0, 1], [OUTER_FROM * SQUASH, OUTER_TO * SQUASH]),
    opacity: interpolate(foam.value, [0, 0.1, 0.7, 1], [0, 0.55, 0.22, 0], Extrapolation.CLAMP),
    strokeWidth: interpolate(foam.value, [0, 1], [2.4, 0.8]),
  }));
  // the inner ring: same driver half a period out of phase — the secondary
  // wave the strike throws up as the first one dies. Its own opacity is 0 at
  // both ends of ITS cycle, so the phase wrap is as invisible as the outer's
  const ring2Props = useAnimatedProps(() => {
    const t = (foam.value + INNER_PHASE) % 1;
    return {
      rx: interpolate(t, [0, 1], [INNER_FROM, INNER_TO]),
      ry: interpolate(t, [0, 1], [INNER_FROM * SQUASH, INNER_TO * SQUASH]),
      opacity: interpolate(t, [0, 0.12, 0.72, 1], [0, 0.32, 0.1, 0], Extrapolation.CLAMP),
      strokeWidth: interpolate(t, [0, 1], [1.5, 0.5]),
    };
  });

  // the calming: the splash patch shrinks and dims exactly once after mount
  const splashProps = useAnimatedProps(() => ({
    r: interpolate(settle.value, [0, 1], [17, 13]),
    opacity: interpolate(settle.value, [0, 1], [0.5, 0.18]),
  }));
  const coreProps = useAnimatedProps(() => ({
    r: interpolate(settle.value, [0, 1], [8, 5.5]),
    opacity: interpolate(settle.value, [0, 1], [0.65, 0.22]),
  }));
  // the gloss arriving: the key-light crescent surfaces only as the water calms
  const specProps = useAnimatedProps(() => ({
    opacity: interpolate(settle.value, [0, 1], [0, 0.42]),
  }));

  // the swells: wide, faint, phase-offset so they never lock — and each
  // amplitude DECAYS with the settle (two decay rates), so the sea stills
  // itself under the settling foam instead of heaving forever
  const swell1Props = useAnimatedProps(() => {
    const s = interpolate(breathe.value, SINE_T, SINE_Y);
    const amp = 2.2 * (1 - 0.62 * settle.value);
    return { rx: 40 + amp * s, ry: (40 + amp * s) * SQUASH, opacity: 0.1 + 0.05 * s };
  });
  const swell2Props = useAnimatedProps(() => {
    const s = interpolate((breathe.value + 0.5) % 1, SINE_T, SINE_Y);
    const amp = 1.6 * (1 - 0.5 * settle.value);
    return { rx: 30 + amp * s, ry: (30 + amp * s) * SQUASH, opacity: 0.08 + 0.04 * s };
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // the scene's own corner coincides with the dive stage's inner clip
      // (SeaCloseUp's MetallicFrame: radius.lg − its 2dp FRAME)
      style={{ width: size, height: size, borderRadius: radius.lg - 2, overflow: 'hidden' }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={ids.water} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.blueTint} />
          </LinearGradient>
          <RadialGradient id={ids.splash} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.ink} stopOpacity={0.85} />
            <Stop offset="0.55" stopColor={colors.silver} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={BOX} height={BOX} fill={`url(#${ids.water})`} />

        {/* the living water: two wide counter-phase swells, amplitudes
            decaying as the splash calms */}
        {!reduced ? (
          <>
            <AnimatedEllipse
              cx={CX}
              cy={CY}
              fill="none"
              stroke={colors.blue}
              strokeWidth={0.7}
              animatedProps={swell1Props}
            />
            <AnimatedEllipse
              cx={CX}
              cy={CY}
              fill="none"
              stroke={colors.blue}
              strokeWidth={0.6}
              animatedProps={swell2Props}
            />
          </>
        ) : (
          <>
            <Ellipse cx={CX} cy={CY} rx={40} ry={40 * SQUASH} fill="none" stroke={colors.blue} strokeWidth={0.7} opacity={0.1} />
            <Ellipse cx={CX} cy={CY} rx={30} ry={30 * SQUASH} fill="none" stroke={colors.blue} strokeWidth={0.6} opacity={0.08} />
          </>
        )}

        {/* the settling splash: bright patch calming once, then resting —
            the key-light crescent glosses the settled core */}
        {!reduced ? (
          <>
            <AnimatedCircle cx={CX} cy={CY} fill={`url(#${ids.splash})`} animatedProps={splashProps} />
            <AnimatedCircle cx={CX} cy={CY} fill={colors.ink} animatedProps={coreProps} />
            <AnimatedPath
              d={SPEC_PATH}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.1}
              strokeLinecap="round"
              animatedProps={specProps}
            />
          </>
        ) : (
          <>
            <Circle cx={CX} cy={CY} r={13} fill={`url(#${ids.splash})`} opacity={0.18} />
            <Circle cx={CX} cy={CY} r={5.5} fill={colors.ink} opacity={0.22} />
            <Path
              d={SPEC_PATH}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.1}
              strokeLinecap="round"
              opacity={0.42}
            />
          </>
        )}

        {/* the foam: outer ring + out-of-phase inner ring + the cap cluster
            riding the outer ring's spread, all gone at their wrap frames */}
        {!reduced ? (
          <>
            <AnimatedEllipse
              cx={CX}
              cy={CY}
              fill="none"
              stroke={colors.silver}
              animatedProps={ring2Props}
            />
            <AnimatedEllipse
              cx={CX}
              cy={CY}
              fill="none"
              stroke={colors.silver}
              animatedProps={ring1Props}
            />
            {CAPS.map((spec) => (
              <FoamCap key={spec.angle} spec={spec} foam={foam} />
            ))}
          </>
        ) : (
          <>
            <Ellipse cx={CX} cy={CY} rx={23} ry={23 * SQUASH} fill="none" stroke={colors.silver} strokeWidth={1.4} opacity={0.35} />
            <Ellipse cx={CX} cy={CY} rx={16} ry={16 * SQUASH} fill="none" stroke={colors.silver} strokeWidth={0.9} opacity={0.2} />
            {/* caps parked mid-settle on the static outer ring's radius */}
            <G opacity={0.45}>
              {CAPS.map((c) => (
                <Circle
                  key={c.angle}
                  cx={CX + Math.cos(c.angle) * 23 * c.ride}
                  cy={CY + Math.sin(c.angle) * 23 * c.ride * SQUASH}
                  r={c.r * 0.7}
                  fill={colors.ink}
                />
              ))}
            </G>
          </>
        )}
      </Svg>

      {/* sea spray hanging over the strike — its own loop, its own reduced
          frame */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SprayMist size={size} />
      </View>

      {/* the last droplets falling back — the particle owns its own loop and
          its own reduced-motion frame */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Droplets size={size} count={6} />
      </View>
    </View>
  );
}
