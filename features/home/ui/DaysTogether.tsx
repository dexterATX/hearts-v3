// features/home/ui/DaysTogether.tsx — the day counter at the top of home.
import { View } from 'react-native';
import { Text } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { daysTogether, daysLabel } from '../model';

export function DaysTogether({ anniversary }: { anniversary: string | null }) {
  const days = daysTogether(anniversary);
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
      {days !== null ? (
        <Text variant="display" color={colors.rose} style={{ fontWeight: '700' }}>
          {days}
        </Text>
      ) : null}
      <Text variant="body" color={colors.muted}>
        {daysLabel(days)}
      </Text>
    </View>
  );
}
