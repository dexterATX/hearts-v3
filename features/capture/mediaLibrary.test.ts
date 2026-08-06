// features/capture/mediaLibrary.test.ts — pure-logic tests for the hidden photo
// enumerator: permission gating, newest-first pagination with cursor cutoff,
// dedupe, and safe degradation. Mocked against expo-media-library (the only way
// to exercise the pagination/dedupe logic without a device).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPerm = vi.fn<() => Promise<{ granted: boolean }>>();
const requestPerm = vi.fn<() => Promise<{ granted: boolean }>>();
const getAssets = vi.fn<(opts: unknown) => Promise<unknown>>();

vi.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: () => getPerm(),
  requestPermissionsAsync: () => requestPerm(),
  getAssetsAsync: (opts: unknown) => getAssets(opts),
  MediaType: { photo: 'photo' },
  SortBy: { creationTime: 'creationTime' },
}));

import {
  hasMediaPermission,
  requestMediaPermission,
  scanSince,
  photoContentType,
} from './mediaLibrary';

type Asset = { id: string; uri: string; creationTime: number; modificationTime: number; filename: string | null; width: number; height: number };
type AssetResult = { assets: Asset[]; hasNextPage: boolean; endCursor: string | null };
function page(rows: Asset[], hasNextPage = false, endCursor: string | null = null): AssetResult {
  return { assets: rows, hasNextPage, endCursor };
}

beforeEach(() => {
  getPerm.mockReset();
  requestPerm.mockReset();
  getAssets.mockReset();
  getPerm.mockResolvedValue({ granted: true });
});

describe('hasMediaPermission / requestMediaPermission', () => {
  it('reports current grant status', async () => {
    getPerm.mockResolvedValue({ granted: true });
    expect(await hasMediaPermission()).toBe(true);
    getPerm.mockResolvedValue({ granted: false });
    expect(await hasMediaPermission()).toBe(false);
  });

  it('never throws on a request failure', async () => {
    requestPerm.mockRejectedValue(new Error('binder'));
    expect(await requestMediaPermission()).toBe(false);
  });
});

describe('scanSince', () => {
  it('scans newest-first by modificationTime and stops strictly below the cursor (boundary is inclusive)', async () => {
    // newest-first: modificationTime descending (the scan's real sort/gate key).
    // modificationTime is MS in this SDK.
    const CURSOR = 1_700_000_000_000; // ms
    getAssets.mockResolvedValueOnce(page([
      { id: 'm', uri: 'file:///m.jpg', creationTime: CURSOR + 500, modificationTime: CURSOR + 1000, filename: 'm.jpg', width: 1, height: 1 },
      { id: 'n', uri: 'file:///n.jpg', creationTime: 0, modificationTime: CURSOR, filename: 'n.jpg', width: 1, height: 1 },
      { id: 'o', uri: 'file:///o.jpg', creationTime: CURSOR - 1000, modificationTime: CURSOR - 1000, filename: 'o.jpg', width: 1, height: 1 },
    ]));
    // cutoff is INCLUSIVE on the boundary: assets at modificationTime == CURSOR
    // are still emitted; only strictly-below assets (o) cut the walk.
    const res = await scanSince(CURSOR);
    expect(res.ok).toBe(true);
    expect(res.assets.map((a) => a.assetId)).toEqual(['m', 'n']);
    expect(getAssets).toHaveBeenCalledTimes(1); // stopped at the cursor, no 2nd page
  });

  it('never permanently skips a photo modified at/after the cursor boundary', async () => {
    // Regression: previously the `<=` cutoff dropped the boundary, so a NEW
    // photo sharing the cursor's modification time was silently skipped forever.
    // The inclusive boundary keeps it eligible (asset-id idempotency dedupes any
    // re-scan of already-drained boundary assets).
    const CURSOR = 1_700_000_000_000; // ms
    // pass 1: everything newest-first, includable
    getAssets.mockResolvedValueOnce(page([
      { id: 'old', uri: 'file:///old.jpg', creationTime: 0, modificationTime: CURSOR, filename: 'old.jpg', width: 1, height: 1 },
    ]));
    const pass1 = await scanSince(CURSOR - 1);
    expect(pass1.assets.map((a) => a.assetId)).toEqual(['old']);

    // pass 2: a NEW photo modified at the same timestamp as the drained 'old'.
    // It must still be emitted (not cut by `<`), because it is strictly >= cursor.
    getAssets.mockResolvedValueOnce(page([
      { id: 'new', uri: 'file:///new.jpg', creationTime: CURSOR, modificationTime: CURSOR, filename: 'new.jpg', width: 1, height: 1 },
      { id: 'old', uri: 'file:///old.jpg', creationTime: 0, modificationTime: CURSOR, filename: 'old.jpg', width: 1, height: 1 },
    ]));
    const pass2 = await scanSince(CURSOR);
    expect(pass2.assets.map((a) => a.assetId)).toContain('new');
  });

  it('pages through a large result set via endCursor until drained', async () => {
    getAssets
      .mockResolvedValueOnce(page([{ id: 'a', uri: 'f', creationTime: 3000, modificationTime: 3000, filename: null, width: 1, height: 1 }], true, 'c1'))
      .mockResolvedValueOnce(page([{ id: 'b', uri: 'f', creationTime: 2000, modificationTime: 2000, filename: 'b', width: 1, height: 1 }], false, null));
    const res = await scanSince(0);
    expect(res.ok).toBe(true);
    expect(res.assets.map((a) => a.assetId)).toEqual(['a', 'b']);
    expect(getAssets).toHaveBeenCalledTimes(2);
    // the second request carried `after: 'c1'`
    const second = getAssets.mock.calls[1]![0] as { after?: string };
    expect(second.after).toBe('c1');
  });

  it('dedupes by asset id across pages', async () => {
    getAssets
      .mockResolvedValueOnce(page([{ id: 'a', uri: 'f', creationTime: 3000, modificationTime: 3000, filename: null, width: 1, height: 1 }], true, 'c1'))
      .mockResolvedValueOnce(page([{ id: 'a', uri: 'f', creationTime: 3000, modificationTime: 3000, filename: null, width: 1, height: 1 }], false, null));
    const res = await scanSince(0);
    expect(res.assets).toHaveLength(1); // deduped
  });

  it('degrades to permission-degraded when READ_MEDIA_IMAGES is missing', async () => {
    getPerm.mockResolvedValue({ granted: false });
    const res = await scanSince(0);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('permission');
    expect(getAssets).not.toHaveBeenCalled();
  });

  it('never throws on a media-store scan error', async () => {
    getAssets.mockRejectedValue(new Error('media store busy'));
    const res = await scanSince(0);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('error');
  });
});

describe('photoContentType — mime derivation from filename', () => {
  it('maps known image extensions to their real mime type', () => {
    expect(photoContentType('a.JPEG')).toBe('image/jpeg');
    expect(photoContentType('a.jpg')).toBe('image/jpeg');
    expect(photoContentType('a.png')).toBe('image/png');
    expect(photoContentType('a.heic')).toBe('image/heic');
    // HEIF files are served as image/heic in this derivation.
    expect(photoContentType('a.heif')).toBe('image/heic');
    expect(photoContentType('a.webp')).toBe('image/webp');
    expect(photoContentType('a.gif')).toBe('image/gif');
    expect(photoContentType('a.bmp')).toBe('image/bmp');
    expect(photoContentType('a.BMP')).toBe('image/bmp');
    expect(photoContentType('a.tiff')).toBe('image/tiff');
    expect(photoContentType('a.tif')).toBe('image/tiff');
  });

  it('returns null for unknown / missing extensions (never mislabels)', () => {
    expect(photoContentType('noext')).toBeNull();
    expect(photoContentType('a.avif')).toBeNull();
    expect(photoContentType(null)).toBeNull();
  });
});
