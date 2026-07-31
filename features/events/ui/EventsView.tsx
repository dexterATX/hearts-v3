// features/events/ui/EventsView.tsx — countdowns to everything that matters.
import { useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { Text, Card, Button, Skeleton } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { useEvents, useEventActions, useUpcoming } from '../hooks';
import { countdownLabel } from '../model';

function AddEventCard() {
  const { add } = useEventActions();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('the date looks off — use YYYY-MM-DD');
      return;
    }
    const okAdd = await add({ title, date, recurring, remindDaysBefore: 1 });
    if (okAdd) {
      setTitle('');
      setDate('');
    }
  };

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <TextInput
        placeholder="her birthday, our trip, the day we met…"
        placeholderTextColor={colors.muted}
        value={title}
        onChangeText={setTitle}
        style={{
          color: colors.ink,
          fontSize: 15,
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
        }}
      />
      <TextInput
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.muted}
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
        style={{
          color: colors.ink,
          fontSize: 15,
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
        }}
      />
      <Pressable onPress={() => setRecurring(!recurring)} style={{ marginBottom: spacing.md }}>
        <Text variant="small" color={recurring ? colors.rose : colors.muted}>
          {recurring ? '🔁 every year' : '1️⃣ just once'}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.sm }}>
          {error}
        </Text>
      ) : null}
      <Button label="add the day" haptic="medium" disabled={!title.trim() || !date} onPress={() => void submit()} />
    </Card>
  );
}

export function EventsView() {
  const events = useEvents();
  const { remove } = useEventActions();
  const upcomingList = useUpcoming();
  const [armedId, setArmedId] = useState<string | null>(null);

  if (events.isLoading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={80} style={{ marginBottom: spacing.sm }} />
        <Skeleton height={80} />
      </View>
    );
  }

  if (events.error && !events.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card>
          <Text variant="small" color={colors.rose}>
            the calendar would not load — pull down to try again
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <AddEventCard />
      {upcomingList.length === 0 ? (
        <Card>
          <Text variant="small" color={colors.muted}>
            no days on the calendar yet — add the one you never want to forget.
          </Text>
        </Card>
      ) : (
        upcomingList.map(({ event, days }) => (
          <Card key={event.id} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{event.title}</Text>
                <Text variant="caption" color={colors.muted}>
                  {new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                  })}
                  {event.recurring ? ' · every year' : ''}
                </Text>
              </View>
              <Text variant="title" color={days <= 7 ? colors.rose : colors.gold}>
                {countdownLabel(days)}
              </Text>
              <Pressable
                onPress={() => {
                  if (armedId !== event.id) {
                    setArmedId(event.id);
                    setTimeout(() => setArmedId(null), 3000);
                    return;
                  }
                  setArmedId(null);
                  void remove(event.id);
                }}
                style={{ padding: spacing.sm }}
              >
                <Text variant="caption" color={armedId === event.id ? colors.rose : colors.muted}>
                  {armedId === event.id ? 'sure?' : '✕'}
                </Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
