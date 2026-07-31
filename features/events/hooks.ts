// features/events/hooks.ts — anniversary, birthdays, countdowns, reminders (§7.15).
// Reminders are LOCAL notifications scheduled from the events cache — they
// must work with the server down, and they are per-phone anyway.
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import { fetchEvents } from './api';
import { upcoming, nextOccurrence } from './model';
import { newUuid } from '../../lib/id';
import { CHANNEL_ID } from '../../lib/notify/register';
import type { EventRow } from '../../lib/db/database.types';

const KEY = ['events'] as const;

export function useEvents() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchEvents(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

export function useEventSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!coupleId) return;
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
    const off = on('event:changed', invalidate);
    const channel = supabase
      .channel(`events-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      off();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}

export function useEventActions() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();

  const add = useCallback(
    async (input: { title: string; date: string; recurring: boolean; remindDaysBefore: number }) => {
      if (!coupleId || !input.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return false;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const optimistic: EventRow = {
        id: newUuid(), // kept as the row id so remove finds it offline
        couple_id: coupleId,
        title: input.title.trim(),
        date: input.date,
        recurring: input.recurring,
        remind_days_before: input.remindDaysBefore,
        op_id: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<EventRow[]>([...KEY, coupleId], (old) => [...(old ?? []), optimistic]);
      const { op_id: _drop, ...row } = optimistic;
      await enqueue({ coupleId, kind: 'upsert', table: 'events', payload: row });
      emit({ t: 'event:changed', eventId: optimistic.id });
      return true;
    },
    [coupleId, queryClient],
  );

  const remove = useCallback(
    async (eventId: string) => {
      if (!coupleId) return;
      queryClient.setQueryData<EventRow[]>([...KEY, coupleId], (old) =>
        (old ?? []).filter((e) => e.id !== eventId),
      );
      await enqueue({ coupleId, kind: 'delete', table: 'events', payload: { id: eventId } });
    },
    [coupleId, queryClient],
  );

  return { add, remove };
}

/** Re-arm all local reminders whenever the events list changes. Local, not
 *  push: they must fire in airplane mode, and there is no "send" to fail. */
export function useEventReminders() {
  const events = useEvents();
  useEffect(() => {
    if (!events.data) return;
    let cancelled = false;
    void (async () => {
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const event of events.data) {
        const next = nextOccurrence(event);
        if (!next) continue;
        const fire = new Date(next);
        fire.setDate(fire.getDate() - event.remind_days_before);
        fire.setHours(9, 0, 0, 0); // 9am, gently
        if (fire.getTime() <= Date.now()) continue;
        if (cancelled) return;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: event.title,
            body:
              event.remind_days_before === 0
                ? 'today is the day ♥'
                : `${event.remind_days_before} day${event.remind_days_before > 1 ? 's' : ''} to go`,
            data: { path: '/(tabs)/us' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire, channelId: CHANNEL_ID },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [events.data]);
}

export function useUpcoming() {
  const events = useEvents();
  return upcoming(events.data ?? []);
}
