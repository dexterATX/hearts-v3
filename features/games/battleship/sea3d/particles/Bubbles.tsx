// features/games/battleship/sea3d/particles/Bubbles.tsx — a thin column of
// bubbles rising off a point on the seabed (bottom-center-left), for the
// sunken-wreck close-up. One shared wrapped driver; every bubble derives its
// own phase from it, so the whole column costs ONE loop.
//
// Motion: each bubble rides the driver at a staggered phase offset — it
// lifts from the seabed, wobbles more as it climbs (Math.sin on the UI
// thread), swells from 2dp to 5dp across, and pops by fading out just under
// the surface. The in-out easing means a bubble accelerates off the bottom
// and slows into its pop, and because opacity is 0 at both ends of a phase
// the wrap is invisible. Reduced motion holds a static scatter of bubbles
// mid-rise; the loop cancels on unmount.
import { useEffect } from 'react';
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
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// one slow breath of the whole column; every bubble's phase lives inside it
const RISE_MS = 3600;

// geometry in fractions of size: the vent sits bottom-center-left, the
// surface line just under the top edge
const VENT_X = 0.36;
const VENT_Y = 0.94;
const SURFACE_Y = 0.1;

// a bubble is born at 2dp across and pops at 5dp
const R_MIN = 1;
const R_MAX = 2.5;

// fade windows within one phase: in off the seabed, out just under the
// surface — both ends invisible, so the loop reset is never seen
const OPACITY_IN = [0, 0.12, 0.82, 0.96] as const;
const OPACITY_OUT = [0, 0.85, 0.85, 0] as const;

// deterministic per-bubble spread, so the column never phase-locks and never
// reshuffles between renders — no array indexing, no random state
function bubbleParams(i: number, count: number) {
  const n = Math.max(1, count);
  return {
    phase: (i / n + 0.13 * Math.sin(i * 2.7)) % 1,
    x0: VENT_X + 0.05 * Math.sin(i * 1.9),
    wobbleFreq: 1.5 + 0.5 * Math.sin(i * 3.1),
    wobbleAmp: 0.02 + 0.012 * ((i * 7) % 3),
    scale: 0.8 + 0.15 * ((i * 5) % 3),
  };
}

/** One bubble: position, swell and pop all derived from the shared driver at
 *  this bubble's phase. Numeric svg props only — cx/cy/r/opacity, never a
 *  transform key. */
function Bubble({
  size,
  rise,
  i,
  count,
}: {
  size: number;
  rise: SharedValue<number>;
  i: number;
  count: number;
}) {
  const p = bubbleParams(i, count);
  const props = useAnimatedProps(() => {
    const t = (rise.value + p.phase + 1) % 1;
    return {
      cx:
        (p.x0 +
          // the wobble opens up as the bubble climbs: held at the vent,
          // meandering near the surface
          p.wobbleAmp * t * Math.sin(t * Math.PI * 2 * p.wobbleFreq + p.phase * 6.28)) *
        size,
      cy: interpolate(t, [0, 1], [VENT_Y, SURFACE_Y]) * size,
      r: interpolate(t, [0, 1], [R_MIN, R_MAX]) * p.scale,
      opacity: interpolate(t, OPACITY_IN, OPACITY_OUT, Extrapolation.CLAMP),
    };
  });
  return (
    <AnimatedCircle
      cx={p.x0 * size}
      cy={VENT_Y * size}
      r={R_MIN}
      fill={colors.silverSoft}
      stroke={colors.silver}
      strokeWidth={0.6}
      opacity={0}
      animatedProps={props}
    />
  );
}

export function Bubbles({ size, count = 6 }: { size: number; count?: number }) {
  const reduced = useReducedMotion();
  const rise = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    rise.value = withRepeat(
      withTiming(1, { duration: RISE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rise);
    };
  }, [reduced, rise]);

  // static frame: the same column frozen mid-rise, each bubble parked at its
  // own phase with its mid-climb radius and a fixed quiet opacity
  if (reduced) {
    return (
      <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
        {Array.from({ length: count }, (_, i) => {
          const p = bubbleParams(i, count);
          const t = (p.phase + 0.35) % 1;
          return (
            <Circle
              key={i}
              cx={p.x0 * size}
              cy={interpolate(t, [0, 1], [VENT_Y, SURFACE_Y]) * size}
              r={interpolate(t, [0, 1], [R_MIN, R_MAX]) * p.scale}
              fill={colors.silverSoft}
              stroke={colors.silver}
              strokeWidth={0.6}
              opacity={0.55}
            />
          );
        })}
      </Svg>
    );
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <Bubble key={i} size={size} rise={rise} i={i} count={count} />
      ))}
    </Svg>
  );
}
