// features/settings/hooks.ts — nicknames, anniversary, toggles, lock, export.
// Research §lock: biometric via expo-local-authentication with own PIN
// fallback (salted hash in SecureStore + attempt lockout); lock on
// backgrounding via AppState; opaque overlay while locked.
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/session/store';
import { newUuid } from '../../lib/id';
import {
  updateProfile,
  updateAnniversary,
  fetchPrefs,
  savePrefs,
  exportAllData,
} from './api';
import { withPref, hashPin, LOCKOUT_AFTER, LOCKOUT_COOLDOWN_MS, exportFileName, type PrefKey } from './model';
import type { NotificationPrefsRow } from '../../lib/db/database.types';

const PREFS_KEY = ['notification-prefs'] as const;
const PIN_SALT_KEY = 'hearts.lock.salt';
const PIN_HASH_KEY = 'hearts.lock.hash';
const PIN_FAILS_KEY = 'hearts.lock.fails';

export function usePrefs() {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: [...PREFS_KEY, userId],
    queryFn: async () => {
      const res = await fetchPrefs(userId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!userId,
  });
}

export function useTogglePref() {
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();
  return useCallback(
    async (key: PrefKey, on: boolean) => {
      if (!userId) return;
      const current = queryClient.getQueryData<NotificationPrefsRow | null>([...PREFS_KEY, userId]) ?? null;
      const prefs = withPref(current, key, on);
      queryClient.setQueryData<NotificationPrefsRow | null>([...PREFS_KEY, userId], {
        profile_id: userId,
        prefs,
      });
      await savePrefs(userId, prefs);
    },
    [userId, queryClient],
  );
}

export function useSaveProfile() {
  const userId = useSession((s) => s.userId);
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();

  const saveNames = useCallback(
    async (displayName: string, nickname: string) => {
      if (!userId) return false;
      const res = await updateProfile(userId, { display_name: displayName.trim(), nickname: nickname.trim() });
      if (res.ok) {
        const me = useSession.getState().me;
        if (me) useSession.getState().setProfiles({ ...me, display_name: displayName.trim(), nickname: nickname.trim() }, useSession.getState().partner);
      }
      return res.ok;
    },
    [userId],
  );

  const saveAnniversary = useCallback(
    async (date: string) => {
      if (!coupleId) return false;
      const res = await updateAnniversary(coupleId, date);
      if (res.ok) void queryClient.invalidateQueries({ queryKey: ['couple', coupleId] });
      return res.ok;
    },
    [coupleId, queryClient],
  );

  return { saveNames, saveAnniversary };
}

// ── app lock (PIN + biometric) ──────────────────────────────────────────

export type LockStatus = {
  configured: boolean; // a PIN exists
  locked: boolean;
  biometricsAvailable: boolean;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  fails: number;
  lockedOut: boolean; // hard lockout (biometrics exist as another way in)
  cooldownUntil: number | null; // PIN-only cooldown — try again after this ts
};

export function useAppLock(): LockStatus {
  const locked = useSession((s) => s.appLocked);
  const setLocked = useSession((s) => s.setAppLocked);
  const [configured, setConfigured] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [fails, setFails] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const lockoutUntilRef = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      const [hash, hasHardware, enrolled, storedFails] = await Promise.all([
        SecureStore.getItemAsync(PIN_HASH_KEY),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        SecureStore.getItemAsync(PIN_FAILS_KEY),
      ]);
      setConfigured(!!hash);
      setBiometricsAvailable(hasHardware && enrolled);
      setFails(Number(storedFails ?? 0));
      // if a lock is configured, the app starts locked
      if (hash) setLocked(true);
    })();
  }, [setLocked]);

  // lock on backgrounding (research: AppState pattern)
  useEffect(() => {
    if (!configured) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') setLocked(true);
    });
    return () => sub.remove();
  }, [configured, setLocked]);

  const clearLock = useCallback(async () => {
    setFails(0);
    await SecureStore.setItemAsync(PIN_FAILS_KEY, '0');
    setLocked(false);
  }, [setLocked]);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'open hearts',
      cancelLabel: 'use PIN',
      disableDeviceFallback: true, // PIN is OURS, not the phone's
      biometricsSecurityLevel: 'strong',
    });
    if (res.success) {
      await clearLock();
      return true;
    }
    return false;
  }, [clearLock]);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const [salt, hash] = await Promise.all([
        SecureStore.getItemAsync(PIN_SALT_KEY),
        SecureStore.getItemAsync(PIN_HASH_KEY),
      ]);
      if (!salt || !hash) return false;
      if (hashPin(pin, salt) === hash) {
        await clearLock();
        return true;
      }
      const next = fails + 1;
      setFails(next);
      await SecureStore.setItemAsync(PIN_FAILS_KEY, String(next));
      if (next >= LOCKOUT_AFTER && !biometricsAvailable) {
        // PIN-only phones cool down instead of dead-ending (see model.ts).
        // Phones WITH biometrics hard-lock instead: fails stays at LOCKOUT,
        // the PIN form hides, and face/fingerprint is the way back in.
        const until = Date.now() + LOCKOUT_COOLDOWN_MS;
        lockoutUntilRef.current = until;
        setLockoutUntil(until);
        // lift the cooldown on schedule — the LockScreen only re-renders on
        // state change, so without this the PIN form would never come back
        setTimeout(() => {
          if (lockoutUntilRef.current === until) {
            lockoutUntilRef.current = null;
            setLockoutUntil(null);
          }
        }, LOCKOUT_COOLDOWN_MS);
        setFails(0);
        await SecureStore.setItemAsync(PIN_FAILS_KEY, '0');
      }
      return false;
    },
    [fails, clearLock],
  );

  const setPin = useCallback(async (pin: string) => {
    const salt = newUuid();
    await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
    await SecureStore.setItemAsync(PIN_HASH_KEY, hashPin(pin, salt));
    setConfigured(true);
  }, []);

  const hardLockedOut = biometricsAvailable && fails >= LOCKOUT_AFTER;
  const coolingDown = lockoutUntil !== null && Date.now() < lockoutUntil;

  return {
    configured,
    locked,
    biometricsAvailable,
    unlockWithBiometrics,
    unlockWithPin,
    setPin,
    fails,
    lockedOut: hardLockedOut,
    cooldownUntil: coolingDown ? lockoutUntil : null,
  };
}

/** Export: fetch everything, write it where SHE chooses via SAF (research:
 *  StorageAccessFramework from expo-file-system/legacy is the proven write
 *  path; the user picks a folder once and gets a persistable URI). */
export function useExport() {
  const coupleId = useSession((s) => s.coupleId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const run = useCallback(async (): Promise<boolean> => {
    if (!coupleId) return false;
    setBusy(true);
    setError(null);
    setSavedTo(null);
    try {
      const res = await exportAllData(coupleId);
      if (!res.ok) {
        setError(res.error.message);
        return false;
      }
      const SAF = await import('expo-file-system/legacy').then((m) => m.StorageAccessFramework);
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        setError('you chose not to pick a folder — nothing was written');
        return false;
      }
      const name = exportFileName();
      const fileUri = await SAF.createFileAsync(perm.directoryUri, name, 'application/json');
      await SAF.writeAsStringAsync(fileUri, JSON.stringify(res.data, null, 2));
      setSavedTo(name);
      return true;
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'the export failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, [coupleId]);

  return { run, busy, error, savedTo };
}
