// features/letters/ui/WaxSeal.tsx — the seal break moment (§7.5):
// unfold + wax crack + success haptic. Springs only, never linear.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Text, Button } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';

export function WaxSeal({
  label,
  onBreak,
  children,
}: {
  label: string;
  onBreak: () => Promise<boolean>;
  children: React.ReactNode; // the letter body, revealed under the seal
}) {
  const [broken, setBroken] = useState(false);
  const crack = useSharedValue(0); // 0 intact → 1 broken
  const unfold = useSharedValue(0); // 0 folded → 1 open

  const sealStyle = useAnimatedStyle(() => ({
    opacity: interpolate(crack.value, [0, 0.7], [1, 0]),
    transform: [
      { scale: interpolate(crack.value, [0, 0.5, 1], [1, 1.15, 1.6]) },
      { rotate: `${interpolate(crack.value, [0, 1], [0, 24])}deg` },
    ],
  }));

  const letterStyle = useAnimatedStyle(() => ({
    opacity: interpolate(unfold.value, [0, 1], [0, 1]),
    transform: [{ translateY: interpolate(unfold.value, [0, 1], [24, 0]) }],
  }));

  useEffect(() => {
    if (broken) {
      crack.value = withTiming(1, { duration: motion.screenMs });
      unfold.value = withSequence(
        withTiming(0, { duration: motion.screenMs / 2 }),
        withSpring(1, motion.spring),
      );
    }
  }, [broken, crack, unfold]);

  const breakSeal = async () => {
    const okOpen = await onBreak();
    if (okOpen) setBroken(true);
  };

  if (!broken) {
    return (
      <View style={{ alignItems: 'center', padding: spacing.huge }}>
        <Animated.View style={sealStyle}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: colors.roseDeep,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 3,
              borderColor: colors.rose,
              marginBottom: spacing.xl,
            }}
          >
            <Text variant="display" color={colors.ink}>
              ♥
            </Text>
          </View>
        </Animated.View>
        <Text variant="title" style={{ marginBottom: spacing.sm, textAlign: 'center' }}>
          {label}
        </Text>
        <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.xl, textAlign: 'center' }}>
          this one is for you. break the seal when you are ready.
        </Text>
        <Button label="break the seal" haptic="success" onPress={() => void breakSeal()} />
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.xl,
          margin: spacing.lg,
        },
        letterStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}
