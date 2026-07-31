// features/auth/hooks.ts — React bindings over api.ts + model.ts (§2.2).
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/db/client';
import { useSession } from '../../lib/session/store';
import { initBus, closeBus } from '../../lib/sync/bus';
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
        reset();
        setHydrated(true);
        return;
      }
      setAuth(userId);
      const meRes = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (cancelled) return;
      if (meRes.error) {
        // offline cold start: keep the PERSISTED session (couple, profiles)
        // instead of wiping it to null and dumping a paired user on the
        // pairing screen. The next reconnect/reconcile rehydrates.
        setHydrated(true);
        const persistedCouple = useSession.getState().coupleId;
        if (persistedCouple) {
          initBus(persistedCouple);
          initPresenceRecovery();
        }
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
    const res = await signOut();
    if (res.ok) {
      closeBus();
      useSession.getState().reset();
    }
    return res;
  }, []);

  return { create, join, leave, busy };
}
