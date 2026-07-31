// lib/sync/presence.ts — who's in the app, which screen, typing (feature 4).
// Presence rides the SAME couple channel as the bus (research: one WebSocket
// per client; presence calls limited to 5 per client per 30s — we throttle).
import { busChannel, onBusStatus, type UserId } from './bus';

export type PresenceState = {
  user_id: UserId;
  screen: string;
  typing_in: string | null;
  at: number;
};

type Listener = (others: PresenceState[]) => void;

const listeners = new Set<Listener>();
let me: PresenceState | null = null;
let others: PresenceState[] = [];
let wired = false;
let lastTrackAt = 0;
let pendingTrack: ReturnType<typeof setTimeout> | null = null;
const TRACK_MIN_INTERVAL_MS = 6_000; // stay well under the 5-per-30s limit

function snapshot(): void {
  const state = busChannel().presenceState<PresenceState>();
  // RealtimePresenceState flattens to per-key arrays; the generic keeps the
  // row typed, but Object.values loses it — re-assert the shape we track.
  others = (Object.values(state).flat() as PresenceState[]).filter(
    (p) => p.user_id !== me?.user_id,
  );
  listeners.forEach((fn) => fn(others));
}

function wirePresence(): void {
  const ch = busChannel();
  ch.on('presence', { event: 'sync' }, snapshot);
  ch.on('presence', { event: 'join' }, snapshot);
  ch.on('presence', { event: 'leave' }, snapshot);
  wired = true;
}

async function doTrack(): Promise<void> {
  if (!me) return;
  lastTrackAt = Date.now();
  await busChannel().track(me);
}

/** Throttled track — presence is a hint, never worth a rate-limit ban. */
function scheduleTrack(): void {
  const elapsed = Date.now() - lastTrackAt;
  if (elapsed >= TRACK_MIN_INTERVAL_MS) {
    void doTrack();
    return;
  }
  if (pendingTrack) return;
  pendingTrack = setTimeout(() => {
    pendingTrack = null;
    void doTrack();
  }, TRACK_MIN_INTERVAL_MS - elapsed);
}

/** Start publishing my presence. Call again on every screen change. */
export function setPresence(userId: UserId, screen: string, typingIn: string | null = null): void {
  me = { user_id: userId, screen, typing_in: typingIn, at: Date.now() };
  if (!wired) {
    try {
      wirePresence();
    } catch {
      return; // bus not initialised yet — auth flow will call us again
    }
  }
  scheduleTrack();
}

export function subscribePresence(fn: Listener): () => void {
  listeners.add(fn);
  fn(others);
  return () => listeners.delete(fn);
}

let recoveryWired = false;

/** Re-track after every reconnect so the partner sees us come back.
 *  Also: when the bus is torn down (sign-out, re-pair), mark unwired so the
 *  next setPresence re-attaches presence handlers to the NEW channel —
 *  otherwise presence silently dies after every re-init.
 *  Idempotent: hydrate() calls this on EVERY auth event (incl. hourly token
 *  refreshes) — without a guard, listeners and track() calls accumulate. */
export function initPresenceRecovery(): void {
  if (recoveryWired) return;
  recoveryWired = true;
  onBusStatus((s) => {
    if (s === 'SUBSCRIBED' && me) {
      lastTrackAt = 0;
      void doTrack();
    }
    if (s === 'CLOSED') {
      wired = false; // the channel our handlers lived on is gone
    }
  });
}
