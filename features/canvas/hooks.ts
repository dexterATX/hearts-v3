// features/canvas/hooks.ts — both draw at once; strokes stream live (§7.6).
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import { fetchStrokes, clearCanvas } from './api';
import { orderForReplay, nextStrokeSeq, type Stroke, type Point } from './model';
import type { CanvasStrokeRow } from '../../lib/db/database.types';

const KEY = ['canvas'] as const;

function rowToStroke(r: CanvasStrokeRow): Stroke {
  return {
    id: r.id,
    authorId: r.author_id,
    seq: r.seq,
    points: (r.points as { x: number; y: number }[]).map((p) => ({ x: p.x, y: p.y })),
    color: r.color,
    width: r.width,
    at: r.created_at,
  };
}

export function useCanvas() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();
  const [liveStrokes, setLiveStrokes] = useState<Stroke[]>([]);
  const clearedAt = useRef<string | null>(null);

  const query = useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchStrokes(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data.map(rowToStroke);
    },
    enabled: !!coupleId,
    staleTime: 60_000,
  });

  // fast path: her strokes appear mid-draw; clears wipe instantly
  useEffect(() => {
    if (!coupleId) return;
    const offStroke = on('canvas:stroke', (ev) => {
      setLiveStrokes((prev) => {
        const s = ev.stroke as Stroke;
        if (prev.some((p) => p.id === s.id)) return prev;
        return [...prev, s];
      });
    });
    const offClear = on('canvas:clear', () => {
      clearedAt.current = new Date().toISOString();
      setLiveStrokes([]);
      void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
    });
    // catch-up: strokes that arrived while this phone was dark
    const channel = supabase
      .channel(`canvas-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'canvas_strokes', filter: `couple_id=eq.${coupleId}` },
        () => void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] }),
      )
      .subscribe();
    return () => {
      offStroke();
      offClear();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);

  // persisted ∪ live, in deterministic replay order. Dedup key is
  // author+seq (per-author monotonic), NOT id: the local stroke id and the
  // server-generated row id never match, so id-keyed dedup double-renders
  // every committed stroke after the catch-up refetch.
  const strokes = useMemo(() => {
    const map = new Map<string, Stroke>();
    for (const s of query.data ?? []) map.set(`${s.authorId}:${s.seq}`, s);
    for (const s of liveStrokes) map.set(`${s.authorId}:${s.seq}`, s);
    return orderForReplay([...map.values()]);
  }, [query.data, liveStrokes]);

  const mySeq = useMemo(
    () => nextStrokeSeq(strokes.filter((s) => s.authorId === userId)),
    [strokes, userId],
  );

  /** Stroke finished: show it, persist it (durable outbox), stream it (bus). */
  const commitStroke = useCallback(
    async (points: Point[], color: string, width: number) => {
      if (!coupleId || !userId || points.length === 0) return;
      const stroke: Stroke = {
        id: `stroke-${userId.slice(0, 8)}-${Date.now()}`,
        authorId: userId,
        seq: mySeq,
        points,
        color,
        width,
        at: new Date().toISOString(),
      };
      setLiveStrokes((prev) => [...prev, stroke]);
      await enqueue({
        coupleId,
        kind: 'upsert',
        table: 'canvas_strokes',
        payload: {
          couple_id: coupleId,
          author_id: userId,
          seq: stroke.seq,
          points: stroke.points,
          color: stroke.color,
          width: stroke.width,
        },
      });
      emit({ t: 'canvas:stroke', stroke, seq: stroke.seq, by: userId });
    },
    [coupleId, userId, mySeq],
  );

  const clear = useCallback(async () => {
    if (!coupleId || !userId) return;
    setLiveStrokes([]);
    queryClient.setQueryData<Stroke[]>([...KEY, coupleId], []);
    emit({ t: 'canvas:clear', by: userId });
    const res = await clearCanvas(coupleId);
    if (!res.ok) void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
  }, [coupleId, userId, queryClient]);

  return { strokes, commitStroke, clear, loading: query.isLoading, error: query.error };
}

/** Replay: strokes re-appear one at a time in replay order (§7.6). */
export function useReplay(strokes: Stroke[], speedMs = 120) {
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);

  const play = useCallback(() => {
    setCount(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (count >= strokes.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), speedMs);
    return () => clearTimeout(t);
  }, [playing, count, strokes.length, speedMs]);

  return { visible: playing ? strokes.slice(0, count) : strokes, playing, play };
}
