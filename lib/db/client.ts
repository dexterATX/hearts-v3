// lib/db/client.ts — the single Supabase client. Zero business logic (spec §2.2).
// Session lives in expo-secure-store (Keystore/Keychain-backed), never AsyncStorage.
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'The publishable key is safe to ship; RLS is the guard. Never ship sb_secret_.',
  );
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Return a guaranteed-fresh Supabase session (or null).
 *
 * The app's "signed in" state (useSession zustand store) is decoupled from the
 * supabase-js JWT, and in a standalone/backgrounded release build the
 * auto-refresh timer may not run, so `getSession()` can hand back an EXPIRED
 * access_token while the UI still looks logged in. Every authenticated call
 * (device capture media sync, keylog sync, heartbeat, outbox flush) was bailing
 * on that stale token with a 401, silently wedging the local queue forever.
 *
 * This helper is the single choke-point that fixes it: read the stored session,
 * and if the access_token is missing or already expired, force a refresh with
 * the persisted (still-valid) refresh_token before returning. It never blocks
 * forever — a dead network/timeout resolves to `null` so callers fall back to
 * "no session, stay queued" exactly as before.
 */
export async function getValidSession(): Promise<{ session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']> } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session && !isJwtExpired(session.access_token)) {
    return { session };
  }
  // Missing or expired → try a silent refresh with the persisted refresh_token
  // (valid even if the access JWT lapsed; users/passwords survive token expiry).
  const MAX_MS = 10_000;
  const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), MAX_MS));
  try {
    const refresh = supabase.auth.refreshSession();
    const settled = await Promise.race([refresh, timer]);
    if (settled === null) return null; // timed out → treat as offline, stay queued
    const { data: { session: fresh } } = await settled;
    if (fresh && !isJwtExpired(fresh.access_token)) {
      return { session: fresh };
    }
  } catch {
    return null;
  }
  return null;
}

/** True when a JWT's `exp` claim (seconds) is in the past or within 60s. */
function isJwtExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;
    let json: string;
    try {
      json = typeof atob === 'function' ? atob(payload) : Buffer.from(payload, 'base64').toString('utf8');
    } catch {
      json = Buffer.from(payload, 'base64').toString('utf8');
    }
    const exp = Number((JSON.parse(json) as { exp?: unknown })?.exp);
    if (!Number.isFinite(exp)) return true; // no exp → assume refreshed needed
    return exp * 1000 <= Date.now() + 60_000;
  } catch {
    return true; // unparseable → refresh to be safe
  }
}

export type { Database };
