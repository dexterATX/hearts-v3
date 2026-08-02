// features/voice/ui/VoiceList.tsx — record, waveform, speed, unheard badge.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming } from 'react-native-reanimated';
import { Text, Card, Skeleton, SkeletonCard, Icon } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { useVoiceNotes, useRecorder, useVoicePlayer } from '../hooks';
import { formatDuration, unheardFor, waveBars, nextSpeed } from '../model';
import type { VoiceNoteRow } from '../../../lib/db/database.types';
import { useSession, usePartnerName } from '../../../lib/session/store';

// the hold-to-talk target: big enough to find without looking
const RECORD_SIZE = spacing.huge * 2;
const TRANSPORT_SIZE = spacing.huge;

function Waveform({ seed, playing }: { seed: string; playing: boolean }) {
  const bars = waveBars(seed);
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: spacing.xxl,
        gap: spacing.xs / 2,
      }}
    >
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(spacing.xs / 2, h * spacing.xl),
            borderRadius: radius.pill,
            backgroundColor: playing ? colors.blue : colors.faint,
          }}
        />
      ))}
    </View>
  );
}

/** Transport glyph drawn from primitives — emoji ▶️/⏸ ignored the palette. */
function Transport({ playing, color }: { playing: boolean; color: string }) {
  if (playing) {
    return (
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <View style={{ width: spacing.xs, height: spacing.lg, borderRadius: radius.pill, backgroundColor: color }} />
        <View style={{ width: spacing.xs, height: spacing.lg, borderRadius: radius.pill, backgroundColor: color }} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: spacing.xs / 2,
        borderTopWidth: spacing.sm,
        borderBottomWidth: spacing.sm,
        borderLeftWidth: spacing.md,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

function NoteRow({ note, myId }: { note: VoiceNoteRow; myId: string }) {
  const player = useVoicePlayer(note);
  const [speed, setSpeed] = useState(1);
  const unheard = note.author_id !== myId && !note.heard_at;

  return (
    <Card
      variant={unheard ? 'accent' : 'quiet'}
      style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={player.playing ? 'pause' : 'play'}
        disabled={!player.ready}
        onPress={player.toggle}
      >
        <View
          style={{
            width: TRANSPORT_SIZE,
            height: TRANSPORT_SIZE,
            borderRadius: radius.pill,
            backgroundColor: unheard ? colors.blueDeep : colors.surfaceAlt,
            borderWidth: 3,
            borderColor: unheard ? colors.blue : colors.line,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: player.ready ? 1 : 0.5,
          }}
        >
          <Transport playing={player.playing} color={unheard ? colors.onBlue : colors.ink} />
        </View>
      </Pressable>

      <Waveform seed={note.id} playing={player.playing} />

      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
        <Text variant="caption" color={colors.muted}>
          {formatDuration(note.duration_ms)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="playback speed"
          onPress={() => {
            const next = nextSpeed(speed);
            setSpeed(next);
            player.setSpeed(next);
          }}
        >
          <View
            style={{
              borderWidth: 3,
              borderColor: colors.line,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs / 2,
            }}
          >
            <Text variant="caption" color={colors.silver}>
              {speed}×
            </Text>
          </View>
        </Pressable>
        {unheard ? (
          <Text variant="overline" color={colors.blue} style={{ textTransform: 'uppercase' }}>
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
  const partnerName = usePartnerName();
  const pulse = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (recorder.recording) {
    pulse.value = withRepeat(withTiming(1.15, { duration: 500 }), -1, true);
  } else {
    pulse.value = withSpring(1, motion.spring);
  }

  if (notes.isLoading) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
        <Skeleton width="45%" height={spacing.md} style={{ alignSelf: 'center', marginTop: spacing.xl }} />
      </View>
    );
  }

  if (notes.error && !notes.data) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Card variant="danger" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Icon name="alert" size={spacing.xl} color={colors.danger} />
          <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
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
        <Text
          variant="overline"
          color={colors.blue}
          style={{ textAlign: 'center', textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.md }}
        >
          {unheard.length === 1 ? 'one voice note you haven’t heard' : `${unheard.length} voice notes you haven’t heard`}
        </Text>
      ) : null}

      {/* the list scrolls (P1 fix) — the record heart stays pinned below */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        {rows.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
            <Icon name="mic" size={spacing.xxl} color={colors.faint} />
            <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
              no voice notes yet — hold the heart and tell {partnerName} something only their ears get.
            </Text>
          </Card>
        ) : (
          rows.map((n) => <NoteRow key={n.id} note={n} myId={myId} />)
        )}
      </ScrollView>

      <View
        style={{
          alignItems: 'center',
          gap: spacing.md,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xl,
          paddingHorizontal: spacing.lg,
          borderTopWidth: 3,
          borderTopColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
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
                width: RECORD_SIZE,
                height: RECORD_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* the halo only exists while recording — impossible to miss */}
              {recorder.recording ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    borderRadius: radius.pill,
                    backgroundColor: colors.blueGlow,
                  }}
                />
              ) : null}
              <View
                style={{
                  width: RECORD_SIZE - spacing.md,
                  height: RECORD_SIZE - spacing.md,
                  borderRadius: radius.pill,
                  backgroundColor: recorder.recording ? colors.blueDeep : colors.surfaceAlt,
                  borderWidth: 3,
                  borderColor: recorder.recording ? colors.blue : colors.lineBright,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: recorder.busy ? 0.5 : 1,
                }}
              >
                <Icon name="mic" size={spacing.xxl} color={recorder.recording ? colors.onBlue : colors.blue} />
              </View>
            </View>
          </Pressable>
        </Animated.View>

        <Text
          variant="caption"
          weight={recorder.recording ? 'semibold' : 'medium'}
          color={recorder.recording ? colors.blue : colors.muted}
          style={{ textAlign: 'center' }}
        >
          {recorder.recording ? `let go to send it to ${partnerName}` : recorder.busy ? 'sending…' : 'hold to talk'}
        </Text>

        {recorder.error ? (
          <Text variant="caption" color={colors.danger} style={{ textAlign: 'center' }}>
            {recorder.error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
