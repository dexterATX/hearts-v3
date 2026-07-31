// features/voice/hooks.ts — record, play, speed, unheard badge (§7.12).
// expo-audio (expo-av is dead — research): useAudioRecorder + useAudioPlayer.
import { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import { fetchVoiceNotes, uploadAudio, signedAudioUrl } from './api';
import { storagePathFor } from './model';
import { newUuid } from '../../lib/id';
import type { VoiceNoteRow } from '../../lib/db/database.types';

const KEY = ['voice'] as const;

export function useVoiceNotes() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchVoiceNotes(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

export function useVoiceSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!coupleId) return;
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
    const off = on('voice:new', invalidate);
    const channel = supabase
      .channel(`voice-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_notes', filter: `couple_id=eq.${coupleId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      off();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}

/** Record → upload → row (outbox) → bus. Medium haptic on send (§5). */
export function useRecorder() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0); // wall-clock duration — recorder-state fields vary

  const start = useCallback(async () => {
    setError(null);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('the microphone is off — hearts needs it for voice notes');
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    startedAt.current = Date.now();
    recorder.record();
  }, [recorder]);

  const stopAndSend = useCallback(async (): Promise<boolean> => {
    if (!coupleId || !userId) return false;
    setBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) {
        setError('that was too quick — hold the heart a little longer');
        return false;
      }
      const durationMs = Math.max(1, Date.now() - startedAt.current);
      const noteId = newUuid();
      const storagePath = storagePathFor(coupleId, noteId);

      const uploaded = await uploadAudio(storagePath, uri);
      if (!uploaded.ok) {
        setError('your voice note did not reach her — try again on wifi');
        return false;
      }

      const optimistic: VoiceNoteRow = {
        id: noteId,
        couple_id: coupleId,
        author_id: userId,
        storage_path: storagePath,
        duration_ms: durationMs,
        heard_at: null,
        op_id: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<VoiceNoteRow[]>([...KEY, coupleId], (old) => [optimistic, ...(old ?? [])]);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await enqueue({
        coupleId,
        kind: 'upsert',
        table: 'voice_notes',
        payload: {
          id: noteId,
          couple_id: coupleId,
          author_id: userId,
          storage_path: storagePath,
          duration_ms: durationMs,
          created_at: optimistic.created_at,
        },
      });
      emit({ t: 'voice:new', voiceNoteId: noteId });
      return true;
    } finally {
      setBusy(false);
    }
  }, [recorder, coupleId, userId, queryClient]);

  return { start, stopAndSend, recording: state.isRecording, busy, error };
}

/** Playback with speed control; marks heard once played through. */
export function useVoicePlayer(note: VoiceNoteRow) {
  const [source, setSource] = useState<string | null>(null);
  const player = useAudioPlayer(source ? { uri: source } : null);
  const status = useAudioPlayerStatus(player);
  const queryClient = useQueryClient();
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);

  useEffect(() => {
    let alive = true;
    void signedAudioUrl(note.storage_path).then((res) => {
      if (alive && res.ok) setSource(res.data);
    });
    return () => {
      alive = false;
    };
  }, [note.storage_path]);

  const toggle = useCallback(() => {
    if (!source) return;
    if (status.playing) {
      player.pause();
    } else {
      player.play();
      // her note, first listen → mark heard (through the outbox so an
      // airplane-mode listen still clears the badge on both phones)
      if (note.author_id !== userId && !note.heard_at && coupleId) {
        const heardAt = new Date().toISOString();
        queryClient.setQueryData<VoiceNoteRow[]>([...KEY, coupleId], (old) =>
          (old ?? []).map((n) => (n.id === note.id ? { ...n, heard_at: heardAt } : n)),
        );
        void enqueue({
          coupleId,
          kind: 'update',
          table: 'voice_notes',
          payload: { id: note.id, heard_at: heardAt },
        });
      }
    }
  }, [source, status.playing, player, note, userId, coupleId, queryClient]);

  const setSpeed = useCallback(
    (rate: number) => {
      player.setPlaybackRate(rate, 'high');
    },
    [player],
  );

  return {
    ready: !!source,
    playing: status.playing,
    position: status.currentTime,
    duration: status.duration,
    toggle,
    setSpeed,
  };
}
