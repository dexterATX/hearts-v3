// features/journal/ui/JournalList.tsx — shared + private entries, calendar days.
import { useState } from 'react';
import { View, Pressable, TextInput, ScrollView } from 'react-native';
import { Text, Card, Button, Skeleton } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { MOODS, moodMeta } from '../../../lib/moods';
import { useJournal, useAddEntry, useDeleteEntry } from '../hooks';
import { groupByDay, excerpt } from '../model';
import { useSession } from '../../../lib/session/store';
import type { JournalEntryRow } from '../../../lib/db/database.types';

function EntryCard({ entry, myId }: { entry: JournalEntryRow; myId: string }) {
  const del = useDeleteEntry();
  const [armed, setArmed] = useState(false); // two-tap destructive (§6)
  const meta = entry.mood ? moodMeta(entry.mood) : null;

  return (
    <Card style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <Text variant="caption" color={entry.visibility === 'private' ? colors.gold : colors.muted}>
          {entry.visibility === 'private' ? '🔒 only you' : ''} {meta ? `${meta.emoji} ${meta.label}` : ''}
        </Text>
        {entry.author_id === myId ? (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              if (!armed) {
                setArmed(true);
                setTimeout(() => setArmed(false), 3000);
                return;
              }
              await del(entry.id);
            }}
          >
            <Text variant="caption" color={armed ? colors.rose : colors.muted}>
              {armed ? 'tap again to let it go' : 'let go'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text variant="small">{entry.body}</Text>
    </Card>
  );
}

function NewEntryCard() {
  const add = useAddEntry();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [priv, setPriv] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    await add({ body, mood, visibility: priv ? 'private' : 'shared', photoId: null });
    setBody('');
    setMood(null);
    setPriv(false);
    setOpen(false);
  };

  if (!open) {
    return <Button label="write in our journal" tone="ghost" onPress={() => setOpen(true)} />;
  }

  return (
    <Card>
      <TextInput
        placeholder="today with you…"
        placeholderTextColor={colors.muted}
        value={body}
        onChangeText={setBody}
        multiline
        autoFocus
        style={{
          color: colors.ink,
          fontSize: 15,
          minHeight: 90,
          textAlignVertical: 'top',
          marginBottom: spacing.md,
        }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md }}>
        {MOODS.map((m) => (
          <Pressable key={m.key} onPress={() => setMood(mood === m.key ? null : m.key)} style={{ margin: spacing.xs }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: mood === m.key ? colors.rose : colors.line,
                borderRadius: radius.lg,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.sm,
              }}
            >
              <Text variant="caption" color={mood === m.key ? colors.rose : colors.muted}>
                {m.emoji} {m.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => setPriv(!priv)} style={{ marginBottom: spacing.md }}>
        <Text variant="small" color={priv ? colors.gold : colors.muted}>
          {priv ? '🔒 private — only your eyes' : '👀 shared — both of you can read this'}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="keep it" haptic="medium" onPress={() => void submit()} style={{ flex: 1 }} />
        <Button label="never mind" tone="ghost" onPress={() => setOpen(false)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

export function JournalList() {
  const journal = useJournal();
  const myId = useSession((s) => s.userId) ?? '';

  if (journal.isLoading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={90} style={{ marginBottom: spacing.sm }} />
        <Skeleton height={90} />
      </View>
    );
  }

  if (journal.error && !journal.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card>
          <Text variant="small" color={colors.rose}>
            the journal would not open — pull down to try again
          </Text>
        </Card>
      </View>
    );
  }

  const days = groupByDay(journal.data ?? []);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ marginBottom: spacing.lg }}>
        <NewEntryCard />
      </View>
      {days.length === 0 ? (
        <Card>
          <Text variant="small" color={colors.muted}>
            the journal is blank — write the first line of it together.
          </Text>
        </Card>
      ) : (
        days.map((d) => (
          <View key={d.day} style={{ marginBottom: spacing.lg }}>
            <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.sm }}>
              {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            {d.rows.map((e) => (
              <EntryCard key={e.id} entry={e} myId={myId} />
            ))}
          </View>
        ))
      )}
      <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.md }}>
        {excerpt('private entries never leave your phone unlocked — they are yours alone', 200)}
      </Text>
    </ScrollView>
  );
}
