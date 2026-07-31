// features/mood/ui/MoodCard.tsx — her live mood on my home screen (§7.2).
import { Card, Text } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { moodMeta, latestPerAuthor } from '../model';
import type { MoodRow } from '../../../lib/db/database.types';

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function MoodCard({
  rows,
  partnerId,
  partnerName,
}: {
  rows: MoodRow[];
  partnerId: string | null;
  partnerName: string;
}) {
  if (!partnerId) return null;
  const latest = latestPerAuthor(rows).get(partnerId);
  if (!latest) {
    return (
      <Card>
        <Text variant="small" color={colors.muted}>
          {partnerName} has not sent a mood yet — hers will land here the moment she taps one.
        </Text>
      </Card>
    );
  }
  const meta = moodMeta(latest.mood);
  return (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
      <Text variant="display" style={{ marginBottom: spacing.sm }}>
        {meta.emoji}
      </Text>
      <Text variant="title" color={colors.rose}>
        {partnerName} feels {meta.label}
      </Text>
      <Text variant="caption" color={colors.muted} style={{ marginTop: spacing.xs }}>
        {timeAgo(latest.created_at)}
      </Text>
    </Card>
  );
}
