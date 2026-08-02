// features/presence/ui/PresenceChip.tsx — who's in the app, which screen (§7.4).
// A live status, so: pill, hairline, one small blue dot. Never shouty.
import { View, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Text } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { usePartnerPresence, usePoke } from '../hooks';
import { describePresence } from '../model';
import { usePartnerName } from '../../../lib/session/store';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PresenceChip() {
  const partner = usePartnerPresence();
  const partnerName = usePartnerName();
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
          gap: spacing.sm,
          maxWidth: '90%',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderWidth: 3,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {/* the live dot: blue core, soft halo — reads as a signal, not a badge */}
      <View
        style={{
          width: spacing.lg,
          height: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: colors.blueSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: spacing.sm,
            height: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.blue,
          }}
        />
      </View>
      <Text variant="caption" color={colors.muted} style={{ flexShrink: 1 }}>
        <Text variant="caption" color={colors.silver}>
          {partnerName}
        </Text>
        {' is '}
        {describePresence(partner)} — tap to say thinking of you
      </Text>
    </AnimatedPressable>
  );
}
