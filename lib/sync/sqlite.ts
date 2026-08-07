// lib/sync/sqlite.ts — durable outbox storage (expo-sqlite 57 async API).
// WAL mode, migrations via PRAGMA user_version.
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'hearts.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS outbox (
          op_id TEXT PRIMARY KEY,
          couple_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          table_name TEXT NOT NULL,
          payload TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
      // Migration v1 → v2: add a durable `dead` flag so a permanently-failed op
      // is never destroyed from SQLite before the user acknowledges the rollback
      // (the old behaviour DELETED it, silently losing data on restart). Dead
      // rows are excluded from the live drain but retained for acknowledgeDead.
      const ver = (await db.getFirstAsync<{ uv: number }>(`PRAGMA user_version`))?.uv ?? 1;
      if (ver < 2) {
        await db.execAsync(
          `ALTER TABLE outbox ADD COLUMN dead INTEGER NOT NULL DEFAULT 0; PRAGMA user_version = 2;`,
        );
      }
      return db;
    })();
  }
  return dbPromise;
}

export type StoredOp = {
  op_id: string;
  couple_id: string;
  kind: string;
  table_name: string;
  payload: string; // JSON
  attempts: number;
  last_error: string | null;
  created_at: string;
  /** Durable dead flag (1 = permanently-failed, awaiting acknowledge). Present
   *  only on rows read back from the DB; never supplied on insert (defaults 0). */
  dead?: number;
};

export async function insertOp(op: StoredOp): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO outbox
       (op_id, couple_id, kind, table_name, payload, attempts, last_error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    op.op_id,
    op.couple_id,
    op.kind,
    op.table_name,
    op.payload,
    op.attempts,
    op.last_error,
    op.created_at,
  );
}

/** Live (not yet dead) ops, oldest first — dead ops never block the head. */
export async function pendingOps(): Promise<StoredOp[]> {
  const db = await getDb();
  return db.getAllAsync<StoredOp>(
    `SELECT * FROM outbox WHERE dead = 0 ORDER BY created_at ASC, rowid ASC`,
  );
}

/** Permanently-failed ops still held durably (awaiting user acknowledge). */
export async function deadOps(): Promise<StoredOp[]> {
  const db = await getDb();
  return db.getAllAsync<StoredOp>(
    `SELECT * FROM outbox WHERE dead = 1 ORDER BY created_at ASC, rowid ASC`,
  );
}

export async function removeOp(opId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM outbox WHERE op_id = ?`, opId);
}

/** Mark an op as permanently-failed WITHOUT deleting it — data is retained
 *  until the user acknowledges the rollback. */
export async function markDead(opId: string, error: SendErrorJson): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET dead = 1, last_error = ? WHERE op_id = ?`,
    JSON.stringify(error),
    opId,
  );
}

type SendErrorJson = { status?: number; code?: string; message?: string };

export async function markAttempt(
  opId: string,
  attempts: number,
  error: { message: string; status?: number; code?: string },
): Promise<void> {
  const db = await getDb();
  // stored as JSON so a restart keeps the status/code — a persisted 4xx must
  // still die on the next flush instead of getting one wasteful re-send
  await db.runAsync(
    `UPDATE outbox SET attempts = ?, last_error = ? WHERE op_id = ?`,
    attempts,
    JSON.stringify(error),
    opId,
  );
}

/** Count of live (not dead) pending ops. */
export async function countPending(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE dead = 0`);
  return row?.n ?? 0;
}
