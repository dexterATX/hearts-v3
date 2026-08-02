// features/letters/ui/LetterCard.tsx — one card, two faces: sealed or shelf.
import { Pressable, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Card, Text, Icon, type IconName } from '../../../ui';
import { colors, spacing, motion } from '../../../theme/theme';
import { sealedReason } from '../model';
import type { LetterListRow } from '../api';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function LetterCard({
  letter,
  unlocked,
  mine,
  onPress,
}: {
  letter: LetterListRow;
  unlocked: boolean;
  /** Whose voice is in it — the card must say the same thing the open letter does. */
  mine: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const opened = !!letter.opened_at;

  // sealed letters are silver-and-glass objects; the one you can open now is
  // the only blue thing in the pile
  const status: { icon: IconName; tint: string; text: string } = opened
    ? { icon: 'book', tint: colors.muted, text: 'from the shelf' }
    : unlocked
      ? { icon: 'letter', tint: colors.blue, text: 'ready to open' }
      : { icon: 'lock', tint: colors.silver, text: 'sealed' };

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
      <Card variant="quiet" style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                marginBottom: spacing.sm,
              }}
            >
              <Icon name={status.icon} size={14} color={status.tint} />
              <Text variant="overline" color={status.tint} style={{ textTransform: 'uppercase' }}>
                {status.text}
              </Text>
            </View>
            <Text variant="heading">{letter.label}</Text>
            <Text variant="small" color={colors.muted} style={{ marginTop: spacing.xs }}>
              {opened
                ? `opened ${new Date(letter.opened_at as string).toLocaleDateString()}`
                : unlocked
                  ? 'tap to break the seal'
                  : sealedReason(letter)}
              {letter.audio_url ? (mine ? ' · has your voice in it' : ' · has a voice in it') : ''}
            </Text>
          </View>
          {unlocked ? (
            <View style={{ paddingLeft: spacing.md }}>
              <Icon name="chevronRight" size={18} color={colors.faint} />
            </View>
          ) : null}
        </View>
      </Card>
    </AnimatedPressable>
  );
}
