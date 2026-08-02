// features/mood/ui/MoodCard.tsx — her live mood on my home screen (§7.2).
// The one highlighted thing on the page, so it takes the accent surface.
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
        <Text variant="body" color={colors.muted}>
          {partnerName} has not sent a mood yet — the first one lands here the moment they tap it.
        </Text>
      </Card>
    );
  }
  const meta = moodMeta(latest.mood);
  return (
    <Card variant="accent" style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
      {/* the mood emoji IS the content here — it stays */}
      <Text variant="display">{meta.emoji}</Text>
      <Text variant="title" color={colors.ink} style={{ textAlign: 'center' }}>
        {partnerName} feels {meta.label}
      </Text>
      <Text variant="overline" color={colors.muted} style={{ textTransform: 'uppercase' }}>
        {timeAgo(latest.created_at)}
      </Text>
    </Card>
  );
}
