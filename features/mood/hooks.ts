// features/mood/hooks.ts — chip tap → her phone buzzes instantly (§7.3).
// Path: optimistic setQueryData → durable outbox op → bus broadcast (fast path).
// Offline catch-up: the outbox flushes when connectivity returns; reconcile
// refetches; her phone patches its cache from the postgres_changes catch-up.
import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import { fetchMoods } from './api';
import type { MoodRow } from '../../lib/db/database.types';
import type { MoodKey } from './model';

const KEY = ['moods'] as const;

export function useMoods() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchMoods(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
    staleTime: 30_000,
  });
}

/** Realtime wiring: fast path (bus) + catch-up path (postgres_changes). */
export function useMoodSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!coupleId) return;

    const offBus = on('mood:ping', (ev) => {
      // partner's live ping → patch the cache without a round trip.
      // Skip MY OWN ping: emit() applies locally, and my optimistic row is
      // already in the cache — without this guard every chip lands twice.
      if (ev.by === useSession.getState().userId) return;
      queryClient.setQueryData<MoodRow[]>([...KEY, coupleId], (old) => {
        if (!old) return old;
        const ghost: MoodRow = {
          id: `live-${Date.now()}`,
          couple_id: coupleId,
          author_id: ev.by,
          mood: ev.mood,
          op_id: null,
          created_at: new Date().toISOString(),
        };
        return [ghost, ...old];
      });
    });

    // catch-up: any missed mood (sent while this phone was dark) self-heals
    const channel = supabase
      .channel(`moods-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'moods', filter: `couple_id=eq.${coupleId}` },
        () => void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] }),
      )
      .subscribe();

    return () => {
      offBus();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}

export function useSendMood() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();

  // stable identity — a fresh closure every render rebuilt the whole home
  // header (and the deck) on every presence tick
  return useCallback(
    async (mood: MoodKey) => {
      if (!coupleId || !userId) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // §5: heavy on mood ping — fire-and-forget, never gate the optimistic write on a haptic promise

      // 1. optimistic: my chip lands on my screen NOW
      const optimistic: MoodRow = {
        id: `optimistic-${Date.now()}`,
        couple_id: coupleId,
        author_id: userId,
        mood,
        op_id: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<MoodRow[]>([...KEY, coupleId], (old) => [optimistic, ...(old ?? [])]);

      // 2. durable: queued in sqlite, survives airplane mode + app death
      await enqueue({
        coupleId,
        kind: 'upsert',
        table: 'moods',
        payload: { couple_id: coupleId, author_id: userId, mood },
      });

      // 3. fast path: her phone buzzes this second
      emit({ t: 'mood:ping', mood, by: userId });
    },
    [coupleId, userId, queryClient],
  );
}
