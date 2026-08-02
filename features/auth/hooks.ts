// features/auth/hooks.ts — React bindings over api.ts + model.ts (§2.2).
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/db/client';
import { useSession } from '../../lib/session/store';
import { initBus, closeBus } from '../../lib/sync/bus';
import { pauseOutbox, resumeOutbox } from '../../lib/sync/outbox';
import { initPresenceRecovery } from '../../lib/sync/presence';
import { signIn, signOut, createCouple, joinCouple, loadProfiles, touchLastSeen } from './api';
import type { Result } from '../../lib/result';

/** Watches supabase auth; hydrates session store; brings the bus up/down. */
export function useAuthBootstrap(): void {
  const setAuth = useSession((s) => s.setAuth);
  const setCouple = useSession((s) => s.setCouple);
  const setProfiles = useSession((s) => s.setProfiles);
  const setHydrated = useSession((s) => s.setHydrated);
  const reset = useSession((s) => s.reset);

  useEffect(() => {
    let cancelled = false;

    async function hydrate(userId: string | null) {
      if (!userId) {
        // stop the queue BEFORE clearing identity — a timer that fires after
        // sign-out sends with the anon key and the 42501 destroys the op
        pauseOutbox();
        reset();
        setHydrated(true);
        return;
      }
      setAuth(userId);
      resumeOutbox();
      const meRes = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (cancelled) return;
      if (meRes.error) {
        // Offline cold start: keep the PERSISTED session (couple, profiles)
        // rather than dumping a paired user on the pairing screen — the next
        // reconnect rehydrates. BUT only for TRANSIENT failures. A definitive
        // answer (PGRST116 = no such row, 42501 = RLS denies it) means the
        // server does not agree we are paired; keeping the persisted couple
        // then produced a phantom couple whose every write failed 42501 while
        // the UI insisted it was paired.
        const code = meRes.error.code;
        if (code === 'PGRST116' || code === '42501') {
          setCouple(null);
          setProfiles(null, null);
        } else {
          const persistedCouple = useSession.getState().coupleId;
          if (persistedCouple) {
            initBus(persistedCouple);
            initPresenceRecovery();
          }
        }
        setHydrated(true);
        return;
      }
      const coupleId = meRes.data?.couple_id ?? null;
      setCouple(coupleId);
      const profiles = await loadProfiles(userId, coupleId);
      if (cancelled) return;
      if (profiles.ok) setProfiles(profiles.data.me, profiles.data.partner);
      if (coupleId) {
        initBus(coupleId);
        initPresenceRecovery();
      }
      setHydrated(true);
      void touchLastSeen(userId);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrate(session?.user.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setHydrated(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      closeBus();
    };
  }, [setAuth, setCouple, setProfiles, setHydrated, reset]);

  // Pairing heal: I created the couple and am staring at the code — when SHE
  // joins, her profile row gains my couple_id. Watch for it, pull her in.
  const userId = useSession((s) => s.userId);
  const coupleId = useSession((s) => s.coupleId);
  const partner = useSession((s) => s.partner);
  useEffect(() => {
    if (!userId || !coupleId || partner) return;
    const channel = supabase
      .channel(`pairing-watch:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `couple_id=eq.${coupleId}` },
        () => {
          void loadProfiles(userId, coupleId).then((res) => {
            if (res.ok) setProfiles(res.data.me, res.data.partner);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, coupleId, partner, setProfiles]);
}

export function useSignIn(): {
  submit: (email: string, password: string) => Promise<Result<string>>;
  busy: boolean;
} {
  const [busy, setBusy] = useState(false);
  const submit = useCallback(async (email: string, password: string) => {
    setBusy(true);
    try {
      return await signIn(email.trim().toLowerCase(), password);
    } finally {
      setBusy(false);
    }
  }, []);
  return { submit, busy };
}

export function usePairing(): {
  create: (displayName: string) => Promise<Result<{ coupleId: string; code: string }>>;
  join: (code: string) => Promise<Result<string>>;
  leave: () => Promise<Result<null>>;
  busy: boolean;
} {
  const [busy, setBusy] = useState(false);
  const setCouple = useSession((s) => s.setCouple);

  const create = useCallback(
    async (displayName: string) => {
      setBusy(true);
      try {
        const res = await createCouple(displayName);
        if (res.ok) {
          setCouple(res.data.coupleId);
          initBus(res.data.coupleId);
        }
        return res;
      } finally {
        setBusy(false);
      }
    },
    [setCouple],
  );

  const join = useCallback(
    async (code: string) => {
      setBusy(true);
      try {
        const res = await joinCouple(code);
        if (res.ok) {
          setCouple(res.data);
          initBus(res.data);
        }
        return res;
      } finally {
        setBusy(false);
      }
    },
    [setCouple],
  );

  const leave = useCallback(async () => {
    pauseOutbox(); // before signOut: queued ops must not flush unauthenticated
    const res = await signOut();
    if (res.ok) {
      closeBus();
      useSession.getState().reset();
    } else {
      resumeOutbox(); // sign-out failed, we are still authenticated
    }
    return res;
  }, []);

  return { create, join, leave, busy };
}
