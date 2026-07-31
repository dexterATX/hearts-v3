// features/journal/hooks.ts — shared + private, mood tag, photo, calendar.
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import { fetchEntries } from './api';
import { newUuid } from '../../lib/id';
import type { JournalEntryRow, JournalVisibility } from '../../lib/db/database.types';

const KEY = ['journal'] as const;

export function useJournal() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchEntries(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

export function useJournalSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!coupleId) return;
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
    const off = on('journal:new', invalidate);
    const channel = supabase
      .channel(`journal-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'journal_entries', filter: `couple_id=eq.${coupleId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      off();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}

export function useAddEntry() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();

  return useCallback(
    async (input: { body: string; mood: string | null; visibility: JournalVisibility; photoId: string | null }) => {
      if (!coupleId || !userId || !input.body.trim()) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const optimistic: JournalEntryRow = {
        id: newUuid(), // kept as the row id so delete/update ops find it offline
        couple_id: coupleId,
        author_id: userId,
        body: input.body.trim(),
        mood: input.mood,
        visibility: input.visibility,
        photo_id: input.photoId,
        op_id: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<JournalEntryRow[]>([...KEY, coupleId], (old) => [optimistic, ...(old ?? [])]);

      const { op_id: _drop, ...row } = optimistic;
      await enqueue({ coupleId, kind: 'upsert', table: 'journal_entries', payload: row });
      if (input.visibility === 'shared') emit({ t: 'journal:new', entryId: optimistic.id });
      // private entries stay quiet — that's the point of private
    },
    [coupleId, userId, queryClient],
  );
}

/** Destructive = two taps (§6): first tap arms, second tap deletes. */
export function useDeleteEntry() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  return useCallback(
    async (entryId: string) => {
      if (!coupleId) return;
      queryClient.setQueryData<JournalEntryRow[]>([...KEY, coupleId], (old) =>
        (old ?? []).filter((e) => e.id !== entryId),
      );
      await enqueue({ coupleId, kind: 'delete', table: 'journal_entries', payload: { id: entryId } });
    },
    [coupleId, queryClient],
  );
}
