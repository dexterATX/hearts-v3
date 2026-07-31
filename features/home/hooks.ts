// features/home/hooks.ts — days-together + feed + badges, live.
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/session/store';
import { supabase } from '../../lib/db/client';
import { on } from '../../lib/sync/bus';
import { fetchCouple, fetchFeedRows } from './api';
import { buildFeed, badgeCounts, isLetterOpenable, type FeedItem } from './model';

const COUPLE_KEY = ['couple'] as const;
const FEED_KEY = ['home-feed'] as const;

export function useCouple() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...COUPLE_KEY, coupleId],
    queryFn: async () => {
      const res = await fetchCouple(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
    staleTime: 60_000,
  });
}

export function useFeed() {
  const coupleId = useSession((s) => s.coupleId);
  const query = useQuery({
    queryKey: [...FEED_KEY, coupleId],
    queryFn: async () => {
      const res = await fetchFeedRows(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });

  const items: FeedItem[] = useMemo(() => {
    if (!query.data) return [];
    return buildFeed([
      ...query.data.moods.map((m): FeedItem => ({ kind: 'mood', id: m.id, at: m.created_at, authorId: m.author_id, mood: m.mood })),
      ...query.data.letters.map((l): FeedItem => ({ kind: 'letter', id: l.id, at: l.created_at, authorId: l.author_id, label: l.label, opened: !!l.opened_at })),
      ...query.data.voice.map((v): FeedItem => ({ kind: 'voice', id: v.id, at: v.created_at, authorId: v.author_id, heard: !!v.heard_at })),
      ...query.data.photos.map((p): FeedItem => ({ kind: 'photo', id: p.id, at: p.created_at, authorId: p.author_id, caption: p.caption })),
    ]);
  }, [query.data]);

  return { ...query, items };
}

/** Badges: unheard voice notes + letters she can open right now. */
export function useBadges(): { voice: number; letters: number } {
  const myId = useSession((s) => s.userId);
  const { data } = useFeed();
  return useMemo(() => {
    if (!data || !myId) return { voice: 0, letters: 0 };
    const unlockable = new Set(
      data.letters.filter((l) => isLetterOpenable(l, data.moods)).map((l) => l.id),
    );
    return badgeCounts({
      myId,
      voiceNotes: data.voice,
      letters: data.letters,
      unlockableLetterIds: unlockable,
    });
  }, [data, myId]);
}

/** Live wiring: any shared-row change rebuilds the feed (catch-up path). */
export function useHomeSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!coupleId) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: [...FEED_KEY, coupleId] });
    };

    const offs = [
      on('mood:ping', invalidate),
      on('letter:new', invalidate),
      on('letter:unlocked', invalidate),
      on('voice:new', invalidate),
      on('photo:new', invalidate),
    ];

    const channel = supabase
      .channel(`home-catchup:${coupleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: `couple_id=eq.${coupleId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'letters', filter: `couple_id=eq.${coupleId}` }, invalidate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_notes', filter: `couple_id=eq.${coupleId}` }, invalidate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: `couple_id=eq.${coupleId}` }, invalidate)
      .subscribe();

    return () => {
      offs.forEach((off) => off());
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}
