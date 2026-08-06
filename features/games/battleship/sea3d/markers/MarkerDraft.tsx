// features/games/battleship/sea3d/markers/MarkerDraft.tsx — far-view glyph
// for a draft placement: the heart you are still deciding on.
//
// The heart wears the same silver-blue gradient body as MarkerShip (lit
// toward the one key light) but held at 0.7 opacity — not yet committed, so
// not yet solid — wrapped in a solid soft-glow stroke (never dashed) and a
// quiet specular crescent. Around it the sonar ring breathes outward — scale
// 1 → 1.6 while it fades to nothing, 1.8s around. This is the ONE loop the
// LOD budget allows among the far-view markers, because placement needs a
// visible "here" under the finger. It cancels on unmount; reduced motion
// gets a static ring (the heart is a still frame either way).
//
// The ring animates NUMERICALLY (r / opacity / strokeWidth through
// useAnimatedProps) — never a `transform` key, the SeaArt production-crash
// rule. The loop wraps while invisible: the ring is fully faded before the
// progress jumps 1 → 0, so the reset is never seen.
import { useEffect, useState } from 'react';
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
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';
import { KEY_LIGHT } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';

// the arcade's one key light, top-left; the fill gradient runs toward it —
// same axis and stops as MarkerShip's body, so draft reads as the same heart
// not yet locked in (slices stay in sync by hand, they never import each other)
const HEART_LIGHT = {
  x1: 0.5 + KEY_LIGHT.dx * 0.75,
  y1: 0.5 + KEY_LIGHT.dy * 0.75,
  x2: 0.5 - KEY_LIGHT.dx * 0.75,
  y2: 0.5 - KEY_LIGHT.dy * 0.75,
};

// the arcade's 12×11 bezier heart, ×0.875 (10.5 wide) and centred at
// (12, 11.7) in the 24 box — precomputed so the whole glyph is one flat svg,
// same trick as MarkerShip's ×1.35 path
const HEART_PATH =
  'M12 16.51 C8.94 13.45 6.75 11.79 6.75 9.69 C6.75 7.94 8.15 6.89 9.55 6.89 ' +
  'C10.6 6.89 11.48 7.5 12 8.46 C12.53 7.5 13.4 6.89 14.45 6.89 ' +
  'C15.85 6.89 17.25 7.94 17.25 9.69 C17.25 11.79 15.06 13.45 12 16.51 Z';
// a quiet specular crescent on the upper-left lobe, toward the key light
const SPEC_PATH = 'M8.59 10.13 C8.76 9.08 9.55 8.29 10.51 8.2';

// geometry inside a 24×24 box. The heart rides a hair high (optical centre —
// the point pulls the eye down); the ring is centred on it and even fully
// spread (r × 1.6) plus its stroke stays inside the box
const HEART_CX = 12;
const HEART_CY = 11.7;
const RING_R0 = 6.6;
const RING_R1 = RING_R0 * 1.6; // the contract's scale 1 → 1.6, animated as radius
const PULSE_MS = 1800;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function MarkerDraft({ size }: SceneProps) {
  const reduced = useReducedMotion();
  // 0 → 1 progress of one breath of the ring
  const pulse = useSharedValue(0);
  const [ids] = useState(() => ({ fill: `mdraft${uid++}` }));

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  // spread, fade, thinning stroke — numeric svg props only, so the svg layer
  // never sees a transform. Opacity is 0 from 70% on, so the 1 → 0 wrap
  // happens while nothing is on screen
  const ringProps = useAnimatedProps(() => ({
    r: interpolate(pulse.value, [0, 1], [RING_R0, RING_R1], Extrapolation.CLAMP),
    opacity: interpolate(pulse.value, [0, 0.7, 1], [0.55, 0, 0], Extrapolation.CLAMP),
    strokeWidth: interpolate(pulse.value, [0, 1], [1.4, 0.5], Extrapolation.CLAMP),
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient
          id={ids.fill}
          x1={HEART_LIGHT.x1}
          y1={HEART_LIGHT.y1}
          x2={HEART_LIGHT.x2}
          y2={HEART_LIGHT.y2}
        >
          <Stop offset="0" stopColor={colors.silver} />
          <Stop offset="0.55" stopColor={colors.blue} />
          <Stop offset="1" stopColor={colors.blueDeep} />
        </LinearGradient>
      </Defs>

      {/* the breathing ring — a held question: here? */}
      {reduced ? (
        <Circle
          cx={HEART_CX}
          cy={HEART_CY}
          r={RING_R0}
          fill="none"
          stroke={colors.blue}
          strokeWidth={1.2}
          opacity={0.35}
        />
      ) : (
        <AnimatedCircle
          cx={HEART_CX}
          cy={HEART_CY}
          r={RING_R0}
          fill="none"
          stroke={colors.blue}
          animatedProps={ringProps}
        />
      )}

      {/* the soft glow stroke: solid, never dashed — the uncommitted halo the
          translucent fill then settles over */}
      <Path
        d={HEART_PATH}
        fill="none"
        stroke={colors.blue}
        strokeWidth={1.6}
        strokeLinejoin="round"
        opacity={0.3}
      />
      {/* the heart itself: the ship's silver-blue body at 0.7 — decided on,
          not yet committed */}
      <Path d={HEART_PATH} fill={`url(#${ids.fill})`} opacity={0.7} />
      <Path
        d={SPEC_PATH}
        fill="none"
        stroke={colors.ink}
        strokeWidth={0.7}
        strokeLinecap="round"
        opacity={0.45}
      />
    </Svg>
  );
}
