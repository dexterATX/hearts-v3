// features/letters/ui/LetterCard.tsx — one card, two faces: sealed or shelf.
import { Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Card, Text } from '../../../ui';
import { colors, spacing, motion } from '../../../theme/theme';
import { sealedReason } from '../model';
import type { LetterRow } from '../../../lib/db/database.types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function LetterCard({
  letter,
  unlocked,
  onPress,
}: {
  letter: LetterRow;
  unlocked: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const opened = !!letter.opened_at;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => {
        scale.value = withSpring(motion.pressScale, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={onPress}
      style={style}
    >
      <Card style={{ marginBottom: spacing.md }}>
        <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.xs }}>
          {opened ? 'from the shelf' : unlocked ? '💌 ready to open' : '🔏 sealed'}
        </Text>
        <Text variant="body" style={{ fontWeight: '600' }}>
          {letter.label}
        </Text>
        <Text variant="small" color={colors.muted} style={{ marginTop: spacing.xs }}>
          {opened
            ? `opened ${new Date(letter.opened_at as string).toLocaleDateString()}`
            : unlocked
              ? 'tap to break the seal'
              : sealedReason(letter)}
          {letter.audio_url ? ' · has your voice in it' : ''}
        </Text>
      </Card>
    </AnimatedPressable>
  );
}
