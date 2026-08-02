// lib/session/store.ts — Zustand owns ONLY: session, couple, presence,
// outbox status, ephemeral UI (spec §2.4). Server data never lives here.
//
// Persisted to expo-secure-store: an OFFLINE cold start must still know who
// we are and which couple we belong to — otherwise a signal-less app open
// dumps a paired user onto the pairing screen (round-5 finding).
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { ProfileRow } from '../db/database.types';

const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

type SessionState = {
  userId: string | null;
  coupleId: string | null;
  me: ProfileRow | null;
  partner: ProfileRow | null;
  hydrated: boolean; // auth + profiles loaded at least once
  appLocked: boolean; // PIN/biometric lock (feature 17)
  setAuth: (userId: string | null) => void;
  setCouple: (coupleId: string | null) => void;
  setProfiles: (me: ProfileRow | null, partner: ProfileRow | null) => void;
  setHydrated: (v: boolean) => void;
  setAppLocked: (v: boolean) => void;
  reset: () => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      coupleId: null,
      me: null,
      partner: null,
      hydrated: false,
      appLocked: false,
      setAuth: (userId) => set({ userId }),
      setCouple: (coupleId) => set({ coupleId }),
      setProfiles: (me, partner) => set({ me, partner }),
      setHydrated: (hydrated) => set({ hydrated }),
      setAppLocked: (appLocked) => set({ appLocked }),
      reset: () =>
        set({ userId: null, coupleId: null, me: null, partner: null, hydrated: false, appLocked: false }),
    }),
    {
      name: 'hearts-session',
      storage: createJSONStorage(() => secureStorage),
      // identity persists; UI flags never do (a locked app stays locked
      // through the lock hook's own logic, not a stale flag)
      partialize: (s) => ({ userId: s.userId, coupleId: s.coupleId, me: s.me, partner: s.partner }),
    },
  ),
);

/**
 * What to call the other person, from the reader's side.
 *
 * Every screen renders for whoever is holding the phone, so no copy may say
 * "her" or "him" — it says this name. The fallback has to stay grammatical in
 * subject, possessive AND object position, because it lands in all three
 * ("your person feels tender", "your person's sea", "leave your person a note").
 * That is why it is not "them": "them's sea" and "them gets a daisy" are what
 * the first pass shipped.
 */
export function usePartnerName(): string {
  return useSession((s) => s.partner?.nickname || s.partner?.display_name || 'your person');
}
