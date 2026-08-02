// features/journal/ui/JournalList.tsx — shared + private entries, calendar days.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Card, Button, Input, Icon, MoodBunny, SkeletonCard } from '../../../ui';
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
  const isPrivate = entry.visibility === 'private';

  return (
    <Card variant="quiet" style={{ marginBottom: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {isPrivate ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Icon name="lock" size={spacing.md} color={colors.silver} />
              <Text variant="overline" color={colors.silver} style={{ textTransform: 'uppercase' }}>
                only you
              </Text>
            </View>
          ) : null}
          {meta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <MoodBunny mood={entry.mood as string} size={16} />
              <Text variant="caption" color={colors.muted}>
                {meta.label}
              </Text>
            </View>
          ) : null}
        </View>
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
            <Text variant="caption" color={armed ? colors.danger : colors.muted}>
              {armed ? 'tap again to let it go' : 'let go'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text variant="body">{entry.body}</Text>
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
    return <Button label="write in our journal" tone="ghost" icon="book" onPress={() => setOpen(true)} />;
  }

  return (
    <Card style={{ gap: spacing.lg }}>
      <Input
        placeholder="today with you…"
        value={body}
        onChangeText={setBody}
        multiline
        autoFocus
        style={{ minHeight: spacing.huge * 2, textAlignVertical: 'top' }}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {MOODS.map((m) => {
          const active = mood === m.key;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setMood(active ? null : m.key)}
            >
              <View
                style={{
                  borderWidth: 3,
                  borderColor: active ? colors.blue : colors.line,
                  backgroundColor: active ? colors.blueSoft : 'transparent',
                  borderRadius: radius.pill,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                }}
              >
                <MoodBunny mood={m.key} size={16} />
                <Text variant="caption" color={active ? colors.blue : colors.muted}>
                  {m.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: priv }}
        onPress={() => setPriv(!priv)}
        style={{ alignSelf: 'flex-start' }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            borderWidth: 3,
            borderColor: priv ? colors.silver : colors.line,
            backgroundColor: priv ? colors.silverSoft : 'transparent',
            borderRadius: radius.pill,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
          }}
        >
          <Icon name={priv ? 'lock' : 'book'} size={spacing.lg} color={priv ? colors.silver : colors.muted} />
          <Text variant="caption" color={priv ? colors.silver : colors.muted} style={{ flexShrink: 1 }}>
            {priv ? 'private — only your eyes' : 'shared — both of you can read this'}
          </Text>
        </View>
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
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </View>
    );
  }

  if (journal.error && !journal.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card variant="danger" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="alert" size={spacing.xl} color={colors.danger} />
          <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
            the journal would not open — pull down to try again
          </Text>
        </Card>
      </View>
    );
  }

  const days = groupByDay(journal.data ?? []);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <View style={{ marginBottom: spacing.xl }}>
        <NewEntryCard />
      </View>

      {days.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <Icon name="book" size={spacing.xxl} color={colors.muted} />
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
            the journal is blank — write the first line of it together.
          </Text>
        </Card>
      ) : (
        days.map((d) => (
          <View key={d.day} style={{ marginBottom: spacing.xl }}>
            <Text
              variant="overline"
              color={colors.muted}
              style={{ marginBottom: spacing.md, textTransform: 'uppercase' }}
            >
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

      <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.xl }}>
        {excerpt('private entries never leave your phone unlocked — they are yours alone', 200)}
      </Text>
    </ScrollView>
  );
}
