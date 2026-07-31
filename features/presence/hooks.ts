// features/presence/hooks.ts — React bindings over lib/sync/presence + bus.
import { useEffect, useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../lib/session/store';
import {
  setPresence,
  subscribePresence,
  type PresenceState,
} from '../../lib/sync/presence';
import { emit, on } from '../../lib/sync/bus';

/** Publish my screen (call from each route on focus). */
export function usePublishPresence(screen: string, typingIn: string | null = null): void {
  const userId = useSession((s) => s.userId);
  const coupleId = useSession((s) => s.coupleId);
  useEffect(() => {
    if (userId && coupleId) setPresence(userId, screen, typingIn);
  }, [userId, coupleId, screen, typingIn]);
}

/** Who else is here — live. Presence membership IS the liveness: if she's in
 *  the channel's presence state, she's connected right now (the socket drops
 *  her on disconnect). A timestamp-based staleness check would hide her after
 *  90s of simply sitting on one screen (round-3 finding). */
export function usePartnerPresence(): PresenceState | null {
  const [others, setOthers] = useState<PresenceState[]>([]);
  useEffect(() => subscribePresence(setOthers), []);
  return others[0] ?? null;
}

/** One-tap "thinking of you" (§7.4). Fast path only — presence implies online. */
export function usePoke(): { poke: () => void; received: number } {
  const [received, setReceived] = useState(0);
  useEffect(
    () =>
      on('poke', () => {
        setReceived((n) => n + 1);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }),
    [],
  );
  const poke = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    emit({ t: 'poke' });
  }, []);
  return { poke, received };
}
