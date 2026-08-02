// features/mood/ui/MoodChips.tsx — tap a chip → his phone buzzes instantly.
// These have to feel physical: press spring plus a blue halo that fades in
// under the finger, so the tap reads as pressure rather than as a colour swap.
import { View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { MOODS, type MoodKey } from '../model';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Chip({ mood, onPick }: { mood: (typeof MOODS)[number]; onPick: (k: MoodKey) => void }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`mood ${mood.label}`}
      onPressIn={() => {
        scale.value = withSpring(motion.pressScale, motion.spring);
        glow.value = withTiming(1, { duration: motion.fadeMs });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
        glow.value = withTiming(0, { duration: motion.fadeMs });
      }}
      onPress={() => onPick(mood.key)}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderWidth: 3,
          borderColor: colors.line,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.blueGlow },
          haloStyle,
        ]}
      />
      {/* the mood emoji IS the content — chrome emoji went, these stay */}
      <Text variant="body">{mood.emoji}</Text>
      <Text variant="small" weight="medium" color={colors.ink}>
        {mood.label}
      </Text>
    </AnimatedPressable>
  );
}

export function MoodChips({ onPick }: { onPick: (k: MoodKey) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      {MOODS.map((m) => (
        <Chip key={m.key} mood={m} onPick={onPick} />
      ))}
    </View>
  );
}
