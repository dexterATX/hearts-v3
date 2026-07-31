// features/settings/model.ts — pure settings logic. No RN imports.
import type { NotificationPrefsRow } from '../../lib/db/database.types';

/** Per-feature push toggles (§7.17). Keyed by table name — the notify edge
 *  function reads exactly these keys; missing key = ON. */
export const PREF_KEYS = [
  { key: 'moods', label: 'mood pings' },
  { key: 'letters', label: 'new letters' },
  { key: 'voice_notes', label: 'voice notes' },
  { key: 'photos', label: 'new photos' },
  { key: 'game_moves', label: 'game turns' },
] as const;

export type PrefKey = (typeof PREF_KEYS)[number]['key'];

export function prefEnabled(row: NotificationPrefsRow | null, key: PrefKey): boolean {
  const prefs = (row?.prefs ?? {}) as Record<string, boolean>;
  return prefs[key] !== false;
}

export function withPref(row: NotificationPrefsRow | null, key: PrefKey, on: boolean): Record<string, boolean> {
  const prefs = { ...((row?.prefs ?? {}) as Record<string, boolean>) };
  prefs[key] = on;
  return prefs;
}

export function validAnniversary(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d <= new Date();
}

/** PIN: store only a salted hash, never the PIN (research §lock). */
export function hashPin(pin: string, salt: string): string {
  // djb2-based stretch — a phone-grade lock, not a password vault; SecureStore
  // + attempt lockout carry the real weight here
  let h = 5381;
  const s = `${salt}:${pin}:${salt}`;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i) + round) | 0;
  }
  return `h${(h >>> 0).toString(16)}`;
}

export const LOCKOUT_AFTER = 5;
/** Hard lockout is only safe when biometrics offer another way in — without
 *  them, a PIN-only phone would be locked out forever (found in review).
 *  PIN-only devices get a 30s cooldown instead of a dead end. */
export const LOCKOUT_COOLDOWN_MS = 30_000;

export function exportFileName(now = new Date()): string {
  return `hearts-export-${now.toISOString().slice(0, 10)}.json`;
}
