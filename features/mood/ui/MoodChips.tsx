// features/mood/ui/MoodChips.tsx — tap a chip → his phone buzzes instantly.
import { View, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Text } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { MOODS, type MoodKey } from '../model';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Chip({ mood, onPick }: { mood: (typeof MOODS)[number]; onPick: (k: MoodKey) => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`mood ${mood.label}`}
      onPressIn={() => {
        scale.value = withSpring(motion.pressScale, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={() => onPick(mood.key)}
      style={[
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.lg,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          margin: spacing.xs,
          borderWidth: 1,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      <Text variant="body">
        {mood.emoji} {mood.label}
      </Text>
    </AnimatedPressable>
  );
}

export function MoodChips({ onPick }: { onPick: (k: MoodKey) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      {MOODS.map((m) => (
        <Chip key={m.key} mood={m} onPick={onPick} />
      ))}
    </View>
  );
}
