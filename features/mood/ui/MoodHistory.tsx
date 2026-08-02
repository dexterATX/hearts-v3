// features/mood/ui/MoodHistory.tsx — §7.3: history, grouped by day, both of us.
import { View } from 'react-native';
import { Text, Card } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { groupByDay, moodMeta } from '../model';
import type { MoodRow } from '../../../lib/db/database.types';

export function MoodHistory({
  rows,
  partnerName,
  myId,
  limit = 3,
}: {
  rows: MoodRow[];
  partnerName: string;
  myId: string | null;
  limit?: number;
}) {
  const days = groupByDay(rows).slice(0, limit);
  if (days.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
      <Text
        variant="overline"
        color={colors.muted}
        style={{ textTransform: 'uppercase', marginBottom: spacing.xs }}
      >
        lately
      </Text>
      {days.map((d) => (
        <Card key={d.day} variant="quiet" style={{ gap: spacing.xs }}>
          <Text variant="overline" color={colors.silver} style={{ textTransform: 'uppercase' }}>
            {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </Text>
          {d.rows.map((r) => {
            const meta = moodMeta(r.mood);
            return (
              <Text key={r.id} variant="small" color={colors.ink}>
                {meta.emoji} {r.author_id === myId ? 'you' : partnerName} felt {meta.label}
              </Text>
            );
          })}
        </Card>
      ))}
    </View>
  );
}
