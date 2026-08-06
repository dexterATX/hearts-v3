// features/events/ui/EventsView.tsx — countdowns to everything that matters.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Card, Button, Input, Icon, SkeletonCard } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { usePartnerName } from '../../../lib/session/store';
import { useEvents, useEventActions, useUpcoming } from '../hooks';
import { countdownLabel } from '../model';

function AddEventCard() {
  const { add } = useEventActions();
  const partnerName = usePartnerName();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('the date looks off. use YYYY-MM-DD');
      return;
    }
    const okAdd = await add({ title, date, recurring, remindDaysBefore: 1 });
    if (okAdd) {
      setTitle('');
      setDate('');
    }
  };

  return (
    <Card style={{ marginBottom: spacing.xl, gap: spacing.md }}>
      <Input
        placeholder={`${partnerName}’s birthday, our trip, the day we met…`}
        value={title}
        onChangeText={setTitle}
      />
      <Input
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
        error={error}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: recurring }}
        onPress={() => setRecurring(!recurring)}
        style={{ alignSelf: 'flex-start' }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            borderWidth: 3,
            borderColor: recurring ? colors.blue : colors.line,
            backgroundColor: recurring ? colors.blueSoft : 'transparent',
            borderRadius: radius.pill,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
          }}
        >
          <Icon name="calendar" size={spacing.lg} color={recurring ? colors.blue : colors.muted} />
          <Text variant="caption" color={recurring ? colors.blue : colors.muted}>
            {recurring ? 'every year' : 'just once'}
          </Text>
        </View>
      </Pressable>
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
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </View>
    );
  }

  if (events.error && !events.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card variant="danger" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="alert" size={spacing.xl} color={colors.danger} />
          <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
            the calendar would not load, pull down to try again
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <AddEventCard />
      {upcomingList.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <Icon name="calendar" size={spacing.xxl} color={colors.faint} />
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
            no days on the calendar yet. add the one you never want to forget.
          </Text>
        </Card>
      ) : (
        upcomingList.map(({ event, days }) => (
          <Card key={event.id} variant="quiet" style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text variant="heading">{event.title}</Text>
                <Text variant="caption" color={colors.muted}>
                  {new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                  })}
                  {event.recurring ? ' · every year' : ''}
                </Text>
              </View>
              <Text
                variant="title"
                color={days <= 7 ? colors.blue : colors.silver}
                style={{ textAlign: 'right' }}
              >
                {countdownLabel(days)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="remove this day"
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
                {armedId === event.id ? (
                  <Text variant="caption" color={colors.danger}>
                    sure?
                  </Text>
                ) : (
                  <Icon name="close" size={spacing.lg} color={colors.muted} />
                )}
              </Pressable>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
