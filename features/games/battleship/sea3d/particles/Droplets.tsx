// features/games/battleship/sea3d/particles/Droplets.tsx — spray droplets
// arcing up from the bottom-center of a close-up scene and falling back.
//
// ONE driver clock (2.8s wrapped 0 → 1, in-out quad) feeds every droplet;
// each droplet reads it at a staggered phase offset, so the whole spray costs
// a single loop no matter the count. Paths are deterministic — seeded hashes
// of the droplet index, computed in JS and closed over by the worklets — so
// the burst looks organic but is identical every render. Height comes from a
// parabola lookup (interpolate over wrapped timings, never linear easing);
// the phase wrap is seamless because (clock + phase) % 1 is continuous, and
// each droplet is fully faded at both ends of its own cycle anyway. Svg
// props animate numerically (cx/cy/r/opacity) — no transform anywhere near
// useAnimatedProps. Reduced motion holds static dots at each arc's apex;
// the clock cancels on unmount.
import { useEffect, useMemo } from 'react';
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
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CYCLE_MS = 2800;

// the projectile shape: 4t(1−t), apex 1 at t = 0.5 — fast off the water,
// hanging at the top, fast on the way back down. Read through interpolate
// like every other organic curve in this app
const PARA_T: number[] = [];
const PARA_Y: number[] = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16;
  PARA_T.push(t);
  PARA_Y.push(4 * t * (1 - t));
}

// deterministic hash — same spray every render, no Math.random anywhere
const seed = (i: number, k: number) => {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

type DropletSpec = {
  phase: number; // stagger offset into the shared cycle
  x0: number; // launch x, hugging bottom-center
  dx: number; // lateral lean over the flight
  height: number; // apex lift above the base line
  r: number; // resting radius
};

/** One droplet. All motion derives from the shared clock; nothing here
 *  starts its own animation. */
function Droplet({
  size,
  spec,
  clock,
}: {
  size: number;
  spec: DropletSpec;
  clock: SharedValue<number>;
}) {
  const baseY = size * 0.9;
  const props = useAnimatedProps(() => {
    const t = (clock.value + spec.phase) % 1;
    const lift = interpolate(t, PARA_T, PARA_Y);
    return {
      cx: spec.x0 + spec.dx * t,
      cy: baseY - spec.height * lift,
      r: spec.r * (1 - 0.35 * t),
      // invisible at both ends of the cycle, so the phase wrap never shows
      opacity: interpolate(t, [0, 0.12, 0.86, 1], [0, 0.9, 0.9, 0], Extrapolation.CLAMP),
    };
  });
  return (
    <AnimatedCircle
      cx={spec.x0}
      cy={baseY}
      r={spec.r}
      fill={colors.silver}
      animatedProps={props}
    />
  );
}

export function Droplets({ size, count = 6 }: { size: number; count?: number }) {
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);

  const specs = useMemo<DropletSpec[]>(
    () =>
      Array.from({ length: Math.max(1, Math.round(count)) }, (_, i) => ({
        phase: (i / Math.max(1, Math.round(count)) + 0.35 * seed(i, 1)) % 1,
        x0: size / 2 + (seed(i, 2) - 0.5) * size * 0.12,
        dx: (seed(i, 3) - 0.5) * size * 0.5,
        height: size * (0.3 + 0.42 * seed(i, 4)),
        r: size * (0.018 + 0.014 * seed(i, 5)),
      })),
    [size, count],
  );

  useEffect(() => {
    if (reduced) return;
    clock.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [reduced, clock]);

  const baseY = size * 0.9;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill}>
        {specs.map((spec, i) =>
          reduced ? (
            // static frame: one dot parked at each arc's apex
            <Circle
              key={i}
              cx={spec.x0 + spec.dx * 0.5}
              cy={baseY - spec.height}
              r={spec.r}
              fill={colors.silver}
              opacity={0.5}
            />
          ) : (
            <Droplet key={i} size={size} spec={spec} clock={clock} />
          ),
        )}
      </Svg>
    </View>
  );
}
