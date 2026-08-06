// features/games/battleship/sea3d/particles/SplashRing.tsx — one ring breathed
// off the water: the droplet-strike ripple the close-up scenes layer under
// misses and wrecks.
//
// The ring expands 0.2 → 1 of its resting radius while fading out, then sits
// gone for the last stretch of the 2.6s cycle so the loop wraps unseen
// (opacity is 0 at both ends of the drive). One timing drive, no spring —
// this is an ambient loop, not a response. Numeric svg props only
// (r / opacity / strokeWidth), never a `transform` through useAnimatedProps —
// the arcade's production-crash lesson. Starts after `delay`, cancels on
// unmount; reduced motion holds a single faint static ring.
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// the loop: the ring lives in the first 72% of the cycle, then rests
// invisible until the wrap. The out-quad drive decelerates the spread like a
// real splash losing energy, and parks the invisible tail near standstill
const LOOP_MS = 2600;
const LIVE_T = 0.72;
const BOX = 24; // viewBox square — scales to `size`
const C = BOX / 2;
const R = 10; // resting radius: BOX/2 minus stroke room

export function SplashRing({
  size,
  tint = colors.blueSoft,
  delay = 0,
}: {
  size: number;
  tint?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.out(Easing.quad) }), -1, false),
    );
    return () => cancelAnimation(p);
  }, [reduced, delay, p]);

  // one expanding ring: the strike decays its stroke as it spreads, the same
  // grammar as the arcade sea's sonar ping
  const ringProps = useAnimatedProps(() => ({
    r: interpolate(p.value, [0, LIVE_T], [0.2 * R, R], Extrapolation.CLAMP),
    opacity: interpolate(p.value, [0, 0.1, LIVE_T], [0, 0.9, 0], Extrapolation.CLAMP),
    strokeWidth: interpolate(p.value, [0, LIVE_T], [1.4, 0.5], Extrapolation.CLAMP),
  }));

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {reduced ? (
        <Circle
          cx={C}
          cy={C}
          r={R * 0.55}
          fill="none"
          stroke={tint}
          strokeWidth={0.8}
          opacity={0.5}
        />
      ) : (
        <AnimatedCircle
          cx={C}
          cy={C}
          r={0.2 * R}
          fill="none"
          stroke={tint}
          animatedProps={ringProps}
        />
      )}
    </Svg>
  );
}
