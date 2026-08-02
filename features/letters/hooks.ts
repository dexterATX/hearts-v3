// features/letters/hooks.ts — sealed → unlock → wax-seal break → shelf.
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import { fetchLetters, fetchLetterBody, fetchMoodHistory, type LetterListRow } from './api';
import { isUnlocked } from './model';
import { newUuid } from '../../lib/id';
import type { LetterLockType } from '../../lib/db/database.types';

const KEY = ['letters'] as const;
// same key as the mood feature uses → one shared cache entry, zero imports (§2.1)
const MOOD_KEY = ['moods'] as const;

export function useLetters() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchLetters(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

/** Live wiring: fast path over the bus + postgres_changes catch-up. */
export function useLetterSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!coupleId) return;
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });

    const offNew = on('letter:new', invalidate);
    const offUnlock = on('letter:unlocked', invalidate);

    const channel = supabase
      .channel(`letters-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'letters', filter: `couple_id=eq.${coupleId}` },
        invalidate,
      )
      .subscribe();

    return () => {
      offNew();
      offUnlock();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}

export function useSendLetter() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();

  return async (input: {
    label: string;
    body: string;
    lockType: LetterLockType;
    unlockAt: string | null;
    unlockMood: string | null;
    audioStoragePath: string | null;
  }) => {
    if (!coupleId || !userId) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); // §5: medium on send

    // client-generated uuid, KEPT as the row's id: otherwise any update
    // (opened_at) queued before the server assigns its id is a silent no-op.
    // The body deliberately never enters the query cache — it goes straight to
    // the server and comes back only through letter_body() once unlocked (0008).
    const optimistic: LetterListRow = {
      id: newUuid(),
      couple_id: coupleId,
      author_id: userId,
      label: input.label,
      audio_url: input.audioStoragePath,
      lock_type: input.lockType,
      unlock_at: input.unlockAt,
      unlock_mood: input.unlockMood,
      opened_at: null,
      op_id: null,
      created_at: new Date().toISOString(),
    };
    queryClient.setQueryData<LetterListRow[]>([...KEY, coupleId], (old) => [optimistic, ...(old ?? [])]);

    const { op_id: _drop, ...row } = optimistic;
    await enqueue({ coupleId, kind: 'upsert', table: 'letters', payload: { ...row, body: input.body } });
    emit({ t: 'letter:new', letterId: optimistic.id });
  };
}

/** Break the seal: haptic success, mark opened (through the outbox so an
 *  offline open survives), tell his phone (§7.5). */
export function useOpenLetter() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();

  return async (letter: LetterListRow) => {
    if (!coupleId) return false;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // §5: success on unlock
    const openedAt = new Date().toISOString();
    queryClient.setQueryData<LetterListRow[]>([...KEY, coupleId], (old) =>
      (old ?? []).map((l) => (l.id === letter.id ? { ...l, opened_at: openedAt } : l)),
    );
    // outbox, not direct: an airplane-mode seal-break must not be lost.
    // ids are client-generated, so this update lands on the right row even
    // if the letter itself is still queued ahead of it (oldest-first flush)
    await enqueue({
      coupleId,
      kind: 'update',
      table: 'letters',
      payload: { id: letter.id, opened_at: openedAt },
    });
    emit({ t: 'letter:unlocked', letterId: letter.id });
    return true;
  };
}

/** The letter's text, fetched only when she opens it. The server decides
 *  whether to hand it over (0008) — before this, the plaintext of every sealed
 *  letter was already sitting on the recipient's phone. */
export function useLetterBody(letterId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['letter-body', letterId],
    queryFn: async () => {
      const res = await fetchLetterBody(letterId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!letterId && enabled,
    staleTime: Infinity, // once open, it does not change
  });
}

/** Resolve the live unlock state of one letter against moods + clock. */
export function useLetterUnlocked(letter: Pick<LetterListRow, 'lock_type' | 'unlock_at' | 'unlock_mood' | 'opened_at'>): boolean {
  const coupleId = useSession((s) => s.coupleId);
  const moods = useQuery({
    queryKey: [...MOOD_KEY, coupleId],
    queryFn: async () => {
      const res = await fetchMoodHistory(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
    staleTime: 30_000,
  });
  return isUnlocked(letter, moods.data ?? []);
}
