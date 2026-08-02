// features/home/ui/OutboxBanner.tsx — §2.3.6 made visible: pending ops and
// DEAD ops surface here, in my voice, with a real rollback (dismiss = drop
// the ghost row from the cache, then forget the op). Whisper-weight: a
// breathing dot for waiting, a hairline row for refusal, never an alarm.
import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
  withRepeat,
  cancelAnimation,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text, Icon, Reveal } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { useOnline } from '../../../lib/sync/online';
import {
  subscribeOutbox,
  acknowledgeDead,
  type OutboxStatus,
  type DeadOp,
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

// waiting is not failing: a small dot and a caption, centred. The dot turns
// blue and breathes only while a flush is actually in flight.
function SyncLine({
  flushing,
  online,
  pending,
}: {
  flushing: boolean;
  online: boolean;
  pending: number;
}) {
  const reduced = useReducedMotion();
  const breathe = useSharedValue(1);

  useEffect(() => {
    if (flushing && !reduced) {
      breathe.value = withRepeat(withSpring(0.35, motion.springSoft), -1, true);
    } else {
      cancelAnimation(breathe);
      breathe.value = withSpring(1, motion.springSoft);
    }
    return () => cancelAnimation(breathe);
  }, [flushing, reduced, breathe]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: breathe.value }));

  return (
    <View
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
        maxWidth: '90%',
      }}
    >
      <Animated.View
        style={[
          {
            width: 6,
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: flushing ? colors.blue : colors.faint,
          },
          dotStyle,
        ]}
      />
      <Text variant="caption" color={colors.muted} style={{ flexShrink: 1 }}>
        {flushing
          ? 'sending what you queued…'
          : online
            ? pending === 1
              ? 'one thing is waiting for signal — nothing is lost'
              : `${pending} things are waiting for signal — nothing is lost`
            : pending === 1
              ? 'one thing will send the moment signal returns — nothing is lost'
              : `${pending} things will send the moment signal returns — nothing is lost`}
      </Text>
    </View>
  );
}

// a refusal, whispered: plain hairline row (never a Card — Card's style-split
// would land our transforms on the frame instead of the row).
function DeadRow({ d, queryClient }: { d: DeadOp; queryClient: QueryClient }) {
  const gone = useSharedValue(0);
  const press = useSharedValue(1);

  // visible rollback: the ghost row leaves the screen, the op is
  // acknowledged, and the refetch restores the honest state
  const finalize = () => {
    const key = TABLE_TO_KEY[d.op.table];
    if (key) void queryClient.invalidateQueries({ queryKey: [key, d.op.coupleId] });
    acknowledgeDead(d.op.opId);
  };

  const exitStyle = useAnimatedStyle(() => ({
    opacity: 1 - gone.value,
    transform: [{ scale: press.value * (1 - gone.value * 0.03) }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={() => {
        press.value = withSpring(motion.pressScale, motion.spring);
      }}
      onPressOut={() => {
        press.value = withSpring(1, motion.spring);
      }}
      onPress={() => {
        // the fade owns the rollback: finalize runs only from the animation
        // callback, never synchronously here
        gone.value = withTiming(1, { duration: motion.fadeMs }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(finalize);
        });
      }}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.md,
            marginHorizontal: spacing.lg,
            padding: spacing.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
          },
          exitStyle,
        ]}
      >
        <Icon name="alert" size={16} color={colors.danger} />
        <Text variant="small" color={colors.muted} style={{ flex: 1 }}>
          {KIND_WORD[d.op.table] ?? 'something'} did not save — the server refused it, which
          usually means it is already there. tap to let it go and see the honest state.
        </Text>
        <Icon name="close" size={14} color={colors.faint} />
      </Animated.View>
    </Pressable>
  );
}

export function OutboxBanner() {
  const [status, setStatus] = useState<OutboxStatus>({ pending: 0, flushing: false, dead: [] });
  const queryClient = useQueryClient();
  const online = useOnline();

  useEffect(() => subscribeOutbox(setStatus), []);

  if (status.dead.length === 0 && status.pending === 0 && online) return null;

  return (
    <Reveal delay={0} dy={8}>
      <View style={{ gap: spacing.sm }}>
        {status.pending > 0 ? (
          <SyncLine flushing={status.flushing} online={online} pending={status.pending} />
        ) : null}

        {status.dead.map((d) => (
          <DeadRow key={d.op.opId} d={d} queryClient={queryClient} />
        ))}

        {status.pending === 0 && status.dead.length === 0 ? (
          // nothing queued, no signal: the app still works, so say so softly
          <Text
            variant="caption"
            color={colors.muted}
            style={{ alignSelf: 'center', paddingVertical: spacing.xs, maxWidth: '90%' }}
          >
            offline — everything here is from this phone
          </Text>
        ) : null}
      </View>
    </Reveal>
  );
}
