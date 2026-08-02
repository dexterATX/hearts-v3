// ui/Reveal.tsx — mount entrance: fade + rise, one spring, reduced-motion aware.
import { useEffect, type ReactNode } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { motion } from '../theme/theme';

export function Reveal({
  delay = 0,
  dy = 12,
  scale = false,
  soft = false,
  children,
}: {
  /** ms before the entrance starts — stagger siblings with it. */
  delay?: number;
  /** how far below its resting spot the child starts. */
  dy?: number;
  /** also settle from 0.97 → 1. Off by default; use sparingly. */
  scale?: boolean;
  /** the gentler spring (motion.springSoft) for large or distant surfaces. */
  soft?: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const o = useSharedValue(reduced ? 1 : 0);
  const y = useSharedValue(reduced ? 0 : dy);
  const s = useSharedValue(scale && !reduced ? 0.97 : 1);

  useEffect(() => {
    if (reduced) {
      o.value = 1;
      y.value = 0;
      s.value = 1;
      return;
    }
    const spring = soft ? motion.springSoft : motion.spring;
    o.value = withDelay(delay, withSpring(1, spring));
    y.value = withDelay(delay, withSpring(0, spring));
    s.value = withDelay(delay, withSpring(1, spring));
  }, [reduced, delay, dy, scale, soft, o, y, s]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }, { scale: s.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
