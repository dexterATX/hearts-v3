// features/presence/ui/PresenceChip.tsx — who's in the app, which screen (§7.4).
import { View, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Text } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { usePartnerPresence, usePoke } from '../hooks';
import { describePresence } from '../model';
import { useSession } from '../../../lib/session/store';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PresenceChip() {
  const partner = usePartnerPresence();
  const partnerName = useSession((s) => s.partner?.nickname || s.partner?.display_name || 'her');
  const { poke } = usePoke();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!partner) return null;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${partnerName} is ${describePresence(partner)}. Tap to say thinking of you.`}
      onPressIn={() => {
        scale.value = withSpring(motion.pressScale, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={poke}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'center',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.lg,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          borderWidth: 1,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.rose,
          marginRight: spacing.sm,
        }}
      />
      <Text variant="caption" color={colors.muted}>
        {partnerName} is {describePresence(partner)} — tap to say thinking of you
      </Text>
    </AnimatedPressable>
  );
}
