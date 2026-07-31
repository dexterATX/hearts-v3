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

export async function pendingOps(): Promise<StoredOp[]> {
  const db = await getDb();
  return db.getAllAsync<StoredOp>(
    `SELECT * FROM outbox ORDER BY created_at ASC, rowid ASC`,
  );
}

export async function removeOp(opId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM outbox WHERE op_id = ?`, opId);
}

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

export async function countPending(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox`);
  return row?.n ?? 0;
}
