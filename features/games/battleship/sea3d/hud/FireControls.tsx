// features/games/battleship/sea3d/hud/FireControls.tsx — the close-up's action
// row: a big primary 'fire ♥' next to a ghost 'back to the sea'. Rises and
// fades in when the close-up mounts; one-shot entrance, no loops, so there is
// nothing to cancel. Haptics come from the ui Button itself (§6).
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '../../../../../ui';
import { motion, spacing } from '../../../../../theme/theme';

export function FireControls({
  disabled,
  onFire,
  onClose,
}: {
  disabled: boolean;
  onFire: () => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  // reduced motion: render settled, no entrance travel
  const rise = useSharedValue(reduced ? 0 : 14);
  const fade = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    rise.value = withSpring(0, motion.springSoft);
    fade.value = withTiming(1, { duration: motion.screenMs });
  }, [reduced, rise, fade]);

  const entrance = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: rise.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        entrance,
      ]}
    >
      <Button label="back to the sea" tone="ghost" onPress={onClose} />
      <Button
        label="fire ♥"
        accessibilityLabel="fire"
        tone="primary"
        size="lg"
        haptic="medium"
        disabled={disabled}
        onPress={onFire}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}
