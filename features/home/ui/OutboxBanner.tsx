// features/home/ui/OutboxBanner.tsx — §2.3.6 made visible: pending ops and
// DEAD ops surface here, in my voice, with a real rollback (dismiss = drop
// the ghost row from the cache, then forget the op).
import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text, Card, Icon } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import {
  subscribeOutbox,
  acknowledgeDead,
  type OutboxStatus,
} from '../../../lib/sync/outbox';

// server table → the TanStack query key holding its optimistic ghost.
// plain strings, not imports — features never reach into each other (§2.1).
const TABLE_TO_KEY: Record<string, string> = {
  moods: 'moods',
  letters: 'letters',
  albums: 'albums',
  photos: 'photos',
  voice_notes: 'voice',
  canvas_strokes: 'canvas',
  quiz_questions: 'quiz-questions',
  bucket_list: 'bucket',
  events: 'events',
  journal_entries: 'journal',
};

const KIND_WORD: Record<string, string> = {
  moods: 'a mood',
  letters: 'a letter',
  albums: 'an album',
  photos: 'a photo',
  voice_notes: 'a voice note',
  canvas_strokes: 'a brushstroke',
  quiz_questions: 'a quiz question',
  bucket_list: 'a dream for the list',
  events: 'a day on the calendar',
  journal_entries: 'a journal entry',
};

export function OutboxBanner() {
  const [status, setStatus] = useState<OutboxStatus>({ pending: 0, flushing: false, dead: [] });
  const queryClient = useQueryClient();

  useEffect(() => subscribeOutbox(setStatus), []);

  if (status.dead.length === 0 && status.pending === 0) return null;

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
      {status.pending > 0 ? (
        // waiting is not failing: quiet surface, no alarm colour
        <Card variant="quiet">
          <Text variant="small" color={colors.muted}>
            {status.flushing
              ? 'sending what you queued…'
              : status.pending === 1
                ? 'one thing is waiting for signal — nothing is lost'
                : `${status.pending} things are waiting for signal — nothing is lost`}
          </Text>
        </Card>
      ) : null}

      {status.dead.map((d) => (
        <Pressable
          key={d.op.opId}
          accessibilityRole="button"
          onPress={() => {
            // visible rollback: the ghost row leaves the screen, the op is
            // acknowledged, and the refetch restores the honest state
            const key = TABLE_TO_KEY[d.op.table];
            if (key) void queryClient.invalidateQueries({ queryKey: [key, d.op.coupleId] });
            acknowledgeDead(d.op.opId);
          }}
        >
          <Card variant="danger" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <Icon name="alert" size={18} color={colors.danger} />
            <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
              {KIND_WORD[d.op.table] ?? 'something'} did not save — the server refused it, which
              usually means it is already there. tap to let it go and see the honest state.
            </Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
