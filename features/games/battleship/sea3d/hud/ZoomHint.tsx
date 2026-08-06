// features/games/battleship/sea3d/hud/ZoomHint.tsx — the whisper caption under
// the board. It appears once: fades in a beat after the board first shows, and
// fades out for good the moment `visible` flips false (the first dive). It
// never comes back — the sea has been understood.
// Reduced motion: no delay, no fades — the caption is simply there or not.
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, type } from '../../../../../theme/theme';

const APPEAR_AFTER_MS = 1000;
const FADE_IN_MS = 900;
const FADE_OUT_MS = 400;

export function ZoomHint({ visible }: { visible: boolean }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  // latches on the first dismissal — the hint is a one-time whisper
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!visible) {
      setGone(true);
      cancelAnimation(opacity);
      opacity.value = reduced ? 0 : withTiming(0, { duration: FADE_OUT_MS });
      return;
    }
    if (gone) return;
    opacity.value = reduced
      ? 1
      : withDelay(APPEAR_AFTER_MS, withTiming(1, { duration: FADE_IN_MS }));
  }, [visible, gone, reduced, opacity]);

  useEffect(() => () => cancelAnimation(opacity), [opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, fade]}>
      <Text style={styles.text}>pinch or tap a square to dive in</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.md,
  },
  text: {
    ...type.caption,
    color: colors.faint,
    textAlign: 'center',
  },
});
