// features/home/ui/DaysTogether.tsx — the day counter at the top of home.
// The screen's hero: Sora numerals at hero size, a hairline of the one blue,
// and the label pulled down to a quiet overline so the number carries it.
import { View } from 'react-native';
import { Text } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { daysTogether, daysLabel } from '../model';

export function DaysTogether({ anniversary }: { anniversary: string | null }) {
  const days = daysTogether(anniversary);
  const counted = days !== null;

  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.xl,
        gap: spacing.md,
      }}
    >
      {counted ? (
        <>
          <Text variant="hero" color={colors.ink} accessibilityRole="header">
            {days}
          </Text>
          <View style={{ width: spacing.xxl, height: 1, backgroundColor: colors.blue }} />
        </>
      ) : null}
      <Text
        variant={counted ? 'overline' : 'body'}
        color={colors.muted}
        style={[{ textAlign: 'center' }, counted && { textTransform: 'uppercase' }]}
      >
        {daysLabel(days)}
      </Text>
    </View>
  );
}
