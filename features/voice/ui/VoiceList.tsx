// features/voice/ui/VoiceList.tsx — record, waveform, speed, unheard badge.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming } from 'react-native-reanimated';
import { Text, Card, Skeleton } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { useVoiceNotes, useRecorder, useVoicePlayer } from '../hooks';
import { formatDuration, unheardFor, waveBars, nextSpeed } from '../model';
import type { VoiceNoteRow } from '../../../lib/db/database.types';
import { useSession } from '../../../lib/session/store';

function Waveform({ seed, playing }: { seed: string; playing: boolean }) {
  const bars = waveBars(seed);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 28, marginHorizontal: spacing.sm }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: h * 24,
            borderRadius: 2,
            marginHorizontal: 1,
            backgroundColor: playing ? colors.rose : colors.muted,
          }}
        />
      ))}
    </View>
  );
}

function NoteRow({ note, myId }: { note: VoiceNoteRow; myId: string }) {
  const player = useVoicePlayer(note);
  const [speed, setSpeed] = useState(1);
  const unheard = note.author_id !== myId && !note.heard_at;

  return (
    <Card style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={player.playing ? 'pause' : 'play'}
        disabled={!player.ready}
        onPress={player.toggle}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: unheard ? colors.roseDeep : colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="body">{player.playing ? '⏸' : '▶️'}</Text>
        </View>
      </Pressable>
      <Waveform seed={note.id} playing={player.playing} />
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="caption" color={colors.muted}>
          {formatDuration(note.duration_ms)}
        </Text>
        <Pressable
          onPress={() => {
            const next = nextSpeed(speed);
            setSpeed(next);
            player.setSpeed(next);
          }}
        >
          <Text variant="caption" color={colors.gold}>
            {speed}×
          </Text>
        </Pressable>
        {unheard ? (
          <Text variant="caption" color={colors.rose}>
            new ♥
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export function VoiceList() {
  const notes = useVoiceNotes();
  const recorder = useRecorder();
  const myId = useSession((s) => s.userId) ?? '';
  const pulse = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (recorder.recording) {
    pulse.value = withRepeat(withTiming(1.15, { duration: 500 }), -1, true);
  } else {
    pulse.value = withSpring(1, motion.spring);
  }

  if (notes.isLoading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={64} style={{ marginBottom: spacing.sm }} />
        <Skeleton height={64} />
      </View>
    );
  }

  if (notes.error && !notes.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card>
          <Text variant="small" color={colors.rose}>
            the voice notes would not load — pull down to try again
          </Text>
        </Card>
      </View>
    );
  }

  const rows = notes.data ?? [];
  const unheard = unheardFor(rows, myId);

  return (
    <View style={{ flex: 1 }}>
      {unheard.length > 0 ? (
        <Text variant="caption" color={colors.rose} style={{ textAlign: 'center', marginBottom: spacing.md, marginTop: spacing.lg }}>
          {unheard.length === 1 ? 'one voice note you haven’t heard' : `${unheard.length} voice notes you haven’t heard`}
        </Text>
      ) : null}

      {/* the list scrolls (P1 fix) — the record heart stays pinned below */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        {rows.length === 0 ? (
          <Card style={{ marginBottom: spacing.xl }}>
            <Text variant="small" color={colors.muted}>
              no voice notes yet — hold the heart and tell her something only her ears get.
            </Text>
          </Card>
        ) : (
          rows.map((n) => <NoteRow key={n.id} note={n} myId={myId} />)
        )}
      </ScrollView>

      <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
        <Animated.View style={pulseStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recorder.recording ? 'stop and send' : 'record a voice note'}
            onPressIn={() => void recorder.start()}
            onPressOut={() => void recorder.stopAndSend()}
            disabled={recorder.busy}
          >
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: recorder.recording ? colors.roseDeep : colors.surfaceAlt,
                borderWidth: 2,
                borderColor: colors.rose,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="display">{recorder.recording ? '♥️' : '🎙️'}</Text>
            </View>
          </Pressable>
        </Animated.View>
        <Text variant="caption" color={colors.muted} style={{ marginTop: spacing.sm }}>
          {recorder.recording ? 'let go to send it to her' : recorder.busy ? 'sending…' : 'hold to talk'}
        </Text>
        {recorder.error ? (
          <Text variant="caption" color={colors.rose} style={{ marginTop: spacing.xs, textAlign: 'center' }}>
            {recorder.error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
