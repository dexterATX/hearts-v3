// features/letters/ui/WaxSeal.tsx — the seal break moment (§7.5):
// unfold + wax crack + success haptic. Springs only, never linear.
//
// The one place in the app where a little drama is correct: a silver seal on
// blue-black glass, lit from behind, that cracks and throws the letter open.
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
import { Text, Button, Card } from '../../../ui';
import { colors, spacing, radius, motion, elevation } from '../../../theme/theme';

const SEAL = spacing.huge * 2; // 96 — the disc, sized off the spacing ramp
const HALO = SEAL + spacing.xl; // the light behind it

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
      <View style={{ alignItems: 'center', paddingVertical: spacing.huge, paddingHorizontal: spacing.xl }}>
        <Animated.View style={sealStyle}>
          <View
            style={{
              width: HALO,
              height: HALO,
              borderRadius: radius.pill,
              backgroundColor: colors.blueSoft,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.xxl,
            }}
          >
            <View
              style={[
                {
                  width: SEAL,
                  height: SEAL,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 3,
                  borderColor: colors.silver,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                elevation.card,
              ]}
            >
              {/* the struck ring inside the wax */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: spacing.sm,
                  left: spacing.sm,
                  right: spacing.sm,
                  bottom: spacing.sm,
                  borderRadius: radius.pill,
                  borderWidth: 3,
                  borderColor: colors.lineBright,
                }}
              />
              <Text variant="display" color={colors.silver}>
                ♥
              </Text>
            </View>
          </View>
        </Animated.View>
        <Text variant="title" style={{ marginBottom: spacing.md, textAlign: 'center' }}>
          {label}
        </Text>
        <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.xl, textAlign: 'center' }}>
          this one is for you. break the seal when you are ready.
        </Text>
        <Button
          label="break the seal"
          tone="primary"
          size="lg"
          haptic="success"
          onPress={() => void breakSeal()}
        />
      </View>
    );
  }

  return (
    <Animated.View style={letterStyle}>
      <Card variant="raised" style={{ padding: spacing.xl, margin: spacing.lg }}>
        {children}
      </Card>
    </Animated.View>
  );
}
