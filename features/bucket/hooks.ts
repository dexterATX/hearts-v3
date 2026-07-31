// features/bucket/hooks.ts — ideas, vote, done-with-photo, random picker.
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import { fetchBucketList, bucketVote } from './api';
import { withVote } from './model';
import { newUuid } from '../../lib/id';
import type { BucketItemRow } from '../../lib/db/database.types';

const KEY = ['bucket'] as const;

export function useBucketList() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchBucketList(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

export function useBucketSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!coupleId) return;
    const invalidate = () => void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
    const off = on('bucket:changed', invalidate);
    const channel = supabase
      .channel(`bucket-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bucket_list', filter: `couple_id=eq.${coupleId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      off();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}

export function useBucketActions() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();

  const patch = useCallback(
    (itemId: string, fn: (old: BucketItemRow[]) => BucketItemRow[]) => {
      queryClient.setQueryData<BucketItemRow[]>([...KEY, coupleId], (old) => fn(old ?? []));
    },
    [coupleId, queryClient],
  );

  const add = useCallback(
    async (title: string, category: string) => {
      if (!coupleId || !title.trim()) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const optimistic: BucketItemRow = {
        id: newUuid(), // kept as the row id so vote/done/remove find it offline
        couple_id: coupleId,
        title: title.trim(),
        category,
        done_at: null,
        done_photo_id: null,
        votes: {},
        op_id: null,
        created_at: new Date().toISOString(),
      };
      patch(optimistic.id, (old) => [optimistic, ...old]);
      const { op_id: _drop, ...row } = optimistic;
      await enqueue({ coupleId, kind: 'upsert', table: 'bucket_list', payload: row });
      emit({ t: 'bucket:changed', itemId: optimistic.id });
    },
    [coupleId, patch],
  );

  const vote = useCallback(
    async (item: BucketItemRow, onVote: boolean) => {
      if (!coupleId || !userId) return;
      await Haptics.selectionAsync();
      const next = withVote(item, userId, onVote);
      patch(item.id, (old) => old.map((r) => (r.id === item.id ? next : r)));
      // votes go through the merge RPC, NOT the outbox: an outbox update
      // REPLACES the whole votes object — two phones voting at once would
      // lose one vote to last-write-wins (P1). The RPC merges with jsonb ||.
      const res = await bucketVote(item.id, onVote);
      if (!res.ok) {
        // visible rollback + honest retry path on next sync
        patch(item.id, (old) => old.map((r) => (r.id === item.id ? item : r)));
        void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
        return false;
      }
      emit({ t: 'bucket:changed', itemId: item.id });
      return true;
    },
    [coupleId, userId, patch, queryClient],
  );

  /** Done-with-photo (§7.14): the photo id rides the update. */
  const markDone = useCallback(
    async (item: BucketItemRow, photoId: string | null) => {
      if (!coupleId) return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const doneAt = new Date().toISOString();
      patch(item.id, (old) => old.map((r) => (r.id === item.id ? { ...r, done_at: doneAt, done_photo_id: photoId } : r)));
      await enqueue({
        coupleId,
        kind: 'update',
        table: 'bucket_list',
        payload: { id: item.id, done_at: doneAt, done_photo_id: photoId },
      });
      emit({ t: 'bucket:changed', itemId: item.id });
    },
    [coupleId, patch],
  );

  const remove = useCallback(
    async (item: BucketItemRow) => {
      if (!coupleId) return;
      patch(item.id, (old) => old.filter((r) => r.id !== item.id));
      await enqueue({ coupleId, kind: 'delete', table: 'bucket_list', payload: { id: item.id } });
    },
    [coupleId, patch],
  );

  return { add, vote, markDone, remove };
}
