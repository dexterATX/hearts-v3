// features/mood/ui/MoodHistory.tsx — §7.3: history, grouped by day, both of us.
import { View } from 'react-native';
import { Text, Card } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { groupByDay, moodMeta } from '../model';
import type { MoodRow } from '../../../lib/db/database.types';

export function MoodHistory({
  rows,
  names,
  myId,
  limit = 3,
}: {
  rows: MoodRow[];
  names: { me: string; her: string };
  myId: string | null;
  limit?: number;
}) {
  const days = groupByDay(rows).slice(0, limit);
  if (days.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
      <Text variant="caption" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        lately
      </Text>
      {days.map((d) => (
        <Card key={d.day} style={{ marginBottom: spacing.sm, paddingVertical: spacing.md }}>
          <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.xs }}>
            {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </Text>
          {d.rows.map((r) => {
            const meta = moodMeta(r.mood);
            return (
              <Text key={r.id} variant="small" style={{ marginTop: spacing.xs }}>
                {meta.emoji} {r.author_id === myId ? names.me : names.her} felt {meta.label}
              </Text>
            );
          })}
        </Card>
      ))}
    </View>
  );
}
