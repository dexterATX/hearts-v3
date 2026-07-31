// lib/sync/bus.ts — ONE channel per couple, typed events, every feature
// multiplexes over it (spec §2.5). No slice ever touches the raw channel.
//
// Research notes applied (supabase-js 2.111 realtime):
// - broadcast with { self: false } — emit() applies locally AND sends,
//   so the sender never double-applies.
// - Realtime is a FAST PATH, never truth: every event is also derivable
//   from Postgres; reconcile.ts heals anything missed while disconnected.
// - heartbeat keeps the socket alive; reconnectAfterMs default backoff.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../db/client';
import { flush } from './outbox';

export type UserId = string;
export type Id = string;

export type Mood = string;

export type Ev =
  | { t: 'mood:ping'; mood: Mood; by: UserId }
  | { t: 'game:move'; sessionId: Id; move: unknown; seq: number; by: UserId }
  | { t: 'canvas:stroke'; stroke: unknown; seq: number; by: UserId }
  | { t: 'canvas:clear'; by: UserId }
  | { t: 'letter:unlocked'; letterId: Id }
  | { t: 'letter:new'; letterId: Id }
  | { t: 'voice:new'; voiceNoteId: Id }
  | { t: 'photo:new'; photoId: Id; albumId: Id | null }
  | { t: 'journal:new'; entryId: Id }
  | { t: 'bucket:changed'; itemId: Id }
  | { t: 'event:changed'; eventId: Id }
  | { t: 'poke' };

type EvType = Ev['t'];
type Handler<T extends EvType> = (ev: Extract<Ev, { t: T }>) => void;

let channel: RealtimeChannel | null = null;
let currentCoupleId: string | null = null;
const handlers = new Map<EvType, Set<(ev: Ev) => void>>();
const statusListeners = new Set<(s: 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT') => void>();

function getChannel(): RealtimeChannel {
  if (!channel || !currentCoupleId) {
    throw new Error('bus not initialised — call initBus(coupleId) after pairing');
  }
  return channel;
}

/** Call once after auth+pairing. Idempotent: re-calling re-subscribes. */
export function initBus(coupleId: string): RealtimeChannel {
  if (channel && currentCoupleId === coupleId) return channel;
  closeBus();
  currentCoupleId = coupleId;
  const ch = supabase.channel(`couple:${coupleId}`, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: undefined }, // presence.ts sets its own key via track
    },
  });
  ch.on('broadcast', { event: 'hearts' }, ({ payload }) => {
    const ev = payload as Ev;
    handlers.get(ev.t)?.forEach((fn) => fn(ev));
  });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // socket healed — drain anything queued while we were dark (§2.3)
      void flush();
    }
    statusListeners.forEach((fn) => fn(status));
  });
  channel = ch;
  return ch;
}

/** The raw channel, exposed ONLY to presence.ts within lib/sync. */
export function busChannel(): RealtimeChannel {
  return getChannel();
}

export function onBusStatus(
  fn: (s: 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT') => void,
): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/** Broadcast + local apply (spec §2.5). Local listeners fire synchronously.
 *  Tolerant of an uninitialised bus (offline cold start): the local half
 *  still runs, the wire half is skipped — the outbox + catch-up channels
 *  carry the event to her phone when connectivity returns. */
export function emit(ev: Ev): void {
  handlers.get(ev.t)?.forEach((fn) => fn(ev));
  if (!channel) return;
  void channel.send({ type: 'broadcast', event: 'hearts', payload: ev });
}

export function on<T extends EvType>(type: T, fn: Handler<T>): () => void {
  let set = handlers.get(type);
  if (!set) {
    set = new Set();
    handlers.set(type, set);
  }
  const wrapped = fn as (ev: Ev) => void;
  set.add(wrapped);
  return () => set.delete(wrapped);
}

export function closeBus(): void {
  if (channel) {
    void channel.unsubscribe();
    supabase.removeChannel(channel);
    channel = null;
    currentCoupleId = null;
  }
}
