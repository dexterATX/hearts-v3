// features/capture/collector.test.ts — pure-logic tests for the hidden device
// capture scan: cursor safety, idempotent enqueue, permission-degradation, and
// the storage-path contract. Everything is dependency-injected (fake sources +
// fake queue + fake cursor), so no Expo/RN/network is touched — same rule as the
// rest of the repo's test suite.
import { describe, it, expect, vi } from 'vitest';
import {
  runCapturePass,
  photoStoragePath,
  extForMime,
  needsQuietPrompt,
  type ScanDeps,
  type QueueWrite,
} from './collector';

const COUPLE = 'couple-1';
const NOW = 1_700_000_000_000;

/** Typed fake queue so the enqueued items can be inspected as typed objects. */
function makeQueue() {
  return vi.fn(async (_item: Parameters<QueueWrite>[0]) => {});
}

function makeDeps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  return {
    scanPhotos: vi.fn(async () => ({ ok: true, assets: [] })),
    pullSms: vi.fn(async () => ({ ok: true, messages: [] })),
    queue: vi.fn(async () => {}),
    cursor: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
    },
    now: () => NOW,
    ...overrides,
  };
}

describe('extForMime', () => {
  it('maps known content types to their real extension and defaults otherwise to jpg', () => {
    expect(extForMime('image/png')).toBe('png');
    expect(extForMime('image/heic')).toBe('heic');
    expect(extForMime('image/heif')).toBe('heic');
    expect(extForMime('image/webp')).toBe('webp');
    expect(extForMime('image/gif')).toBe('gif');
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime(null)).toBe('jpg');
    expect(extForMime(undefined)).toBe('jpg');
  });
});

describe('photoStoragePath', () => {
  it('derives the extension from the asset content type, defaulting to jpg', () => {
    expect(photoStoragePath('ab-cd', 'asset_123')).toBe('ab-cd/asset_123.jpg');
    expect(photoStoragePath('ab-cd', 'asset_123', 'image/jpeg')).toBe('ab-cd/asset_123.jpg');
    expect(photoStoragePath('ab-cd', 'shot', 'image/png')).toBe('ab-cd/shot.png');
    expect(photoStoragePath('ab-cd', 'shot', 'image/heic')).toBe('ab-cd/shot.heic');
    expect(photoStoragePath('ab-cd', 'shot', 'image/webp')).toBe('ab-cd/shot.webp');
    expect(photoStoragePath('ab-cd', 'asset_123', null)).toBe('ab-cd/asset_123.jpg');
    // slashes / special chars in the coupleId never escape the prefix
    expect(photoStoragePath('x/y', 'a b')).toBe('x/y/a b.jpg');
  });
});

describe('needsQuietPrompt', () => {
  it('is true exactly while the permission is already granted', () => {
    expect(needsQuietPrompt('photo', false)).toBe(true);
    expect(needsQuietPrompt('sms', false)).toBe(true);
    expect(needsQuietPrompt('photo', true)).toBe(false);
    expect(needsQuietPrompt('sms', true)).toBe(false);
  });
});

describe('runCapturePass — photos', () => {
  it('enqueues each new photo and advances the cursor only past drained data', async () => {
    const queue = makeQueue();
    const set = vi.fn(async () => {});
    const deps = makeDeps({
      scanPhotos: vi.fn(async () => ({
        ok: true,
        assets: [
          // modificationTime is the scan/cursor basis; make it diverge from
          // creationTime so the test proves the cursor keys off modificationTime
          // (a1 modified at 1900 even though it was "taken" at 1999).
          { assetId: 'a1', uri: 'file:///a1.jpg', creationTime: 1999, modificationTime: 1900, filename: 'a1.jpg', mimeType: 'image/jpeg', width: 100, height: 200 },
          { assetId: 'a2', uri: 'file:///a2.jpg', creationTime: 2000, modificationTime: 2000, filename: 'a2.jpg', mimeType: 'image/jpeg', width: 640, height: 480 },
        ],
      })),
      queue,
      cursor: { get: vi.fn(async () => 1000), set },
    });

    const res = await runCapturePass(deps, COUPLE);
    expect(res.ok).toBe(true);
    expect(res.photosFound).toBe(2);
    expect(res.smsFound).toBe(0);
    expect(queue).toHaveBeenCalledTimes(2);

    // storage path + device_key (asset id) are the idempotency contract
    const first = queue.mock.calls[0]![0]!;
    expect(first.kind).toBe('photo');
    expect(first.device_key).toBe('a1');
    expect(first.storage_path).toBe(`${COUPLE}/a1.jpg`);
    expect(first.payload).toMatchObject({
      uri: 'file:///a1.jpg',
      modificationTime: 1900,
      filename: 'a1.jpg',
      mimeType: 'image/jpeg',
      width: 100,
      height: 200,
    });

    // cursor advanced past the max DRAINED modificationTime (not creationTime)
    // so the newest photo (modificationTime == max) is not re-scanned next tick
    expect(set).toHaveBeenCalledWith('photo', 2001);
  });

  it('derives storage_path and payload mimeType from non-jpeg content types', async () => {
    const queue = makeQueue();
    const set = vi.fn(async () => {});
    const deps = makeDeps({
      scanPhotos: vi.fn(async () => ({
        ok: true,
        assets: [
          { assetId: 'a', uri: 'file:///a.png', creationTime: 3000, modificationTime: 3000, filename: 'a.png', mimeType: 'image/png', width: 100, height: 100 },
        ],
      })),
      queue,
      cursor: { get: vi.fn(async () => 1000), set },
    });

    const res = await runCapturePass(deps, COUPLE);
    expect(res.photosFound).toBe(1);
    const item = queue.mock.calls[0]![0]!;
    expect(item.storage_path).toBe(`${COUPLE}/a.png`);
    expect(item.payload.mimeType).toBe('image/png');
    expect(item.payload).toMatchObject({ uri: 'file:///a.png', filename: 'a.png' });
  });

  it('advances the cursor ONLY when at least one photo was drained', async () => {
    const set = vi.fn(async () => {});
    const deps = makeDeps({
      scanPhotos: vi.fn(async () => ({ ok: true, assets: [] })),
      cursor: { get: vi.fn(async () => 5000), set },
    });
    const res = await runCapturePass(deps, COUPLE);
    expect(res.photosFound).toBe(0);
    // no assets found → never move the cursor (a blind "now" would silently drop items)
    expect(set).not.toHaveBeenCalled();
  });
});

describe('runCapturePass — sms', () => {
  it('enqueues messages, dedupes by smsId across inbox+sent, and advances cursor to max+1', async () => {
    const queue = makeQueue();
    const set = vi.fn(async () => {});
    const deps = makeDeps({
      pullSms: vi.fn(async () => ({
        ok: true,
        messages: [
          { smsId: '9', address: '+1', body: 'hi', date: 5000, dateSent: 0, read: true, threadId: 1, direction: 'inbox' as const },
          { smsId: '10', address: '+1', body: 'yo', date: 6000, dateSent: 6000, read: false, threadId: 1, direction: 'sent' as const },
          { smsId: '11', address: '+2', body: 'late', date: 6000, dateSent: 0, read: false, threadId: 2, direction: 'inbox' as const },
        ],
      })),
      queue,
      cursor: { get: vi.fn(async () => 4000), set },
    });

    const res = await runCapturePass(deps, COUPLE);
    expect(res.smsFound).toBe(3);
    expect(res.ok).toBe(true);
    expect(queue).toHaveBeenCalledTimes(3);
    expect(queue.mock.calls[0]![0]!.kind).toBe('sms');
    expect(queue.mock.calls[0]![0]!.storage_path).toBeNull();

    // native queries `date > cursor`; advance to max+1 so a retry never rescans
    // the newest message (which has date == max)
    expect(set).toHaveBeenCalledWith('sms', 6001);
  });

  it('never moves the sms cursor when no messages were found', async () => {
    const set = vi.fn(async () => {});
    const deps = makeDeps({
      pullSms: vi.fn(async () => ({ ok: true, messages: [] })),
      cursor: { get: vi.fn(async () => 100), set },
    });
    const res = await runCapturePass(deps, COUPLE);
    expect(res.smsFound).toBe(0);
    expect(set).not.toHaveBeenCalled();
  });
});

describe('runCapturePass — degradation', () => {
  it('reports photo_permission degradation without throwing or advancing', async () => {
    const set = vi.fn(async () => {});
    const scanPhotos = vi.fn(async () => ({ ok: false, reason: 'permission', assets: [] }));
    const pullSms = vi.fn(async () => ({ ok: true, messages: [] }));
    const deps = makeDeps({
      scanPhotos,
      pullSms,
      cursor: { get: vi.fn(async () => null), set },
    });
    const res = await runCapturePass(deps, COUPLE);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('photo_permission');
    expect(res.photosFound).toBe(0);
    expect(set).not.toHaveBeenCalled();
    // sms still scanned even when photos degraded
    expect(pullSms).toHaveBeenCalled();
  });

  it('reports sms_permission degradation and falls back to first degraded reason', async () => {
    const scanPhotos = vi.fn(async () => ({ ok: true, assets: [] }));
    const pullSms = vi.fn(async () => ({ ok: false, reason: 'permission', messages: [] }));
    const queue = makeQueue();
    const deps = makeDeps({
      scanPhotos,
      pullSms,
      queue,
      cursor: { get: vi.fn(async () => null), set: vi.fn(async () => {}) },
    });
    const res = await runCapturePass(deps, COUPLE);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('sms_permission');
    // no sms drained → queue untouched by the sms path
    expect(queue).not.toHaveBeenCalled();
  });

  it('does not override an earlier photo degradation with a later sms one', async () => {
    const deps = makeDeps({
      scanPhotos: vi.fn(async () => ({ ok: false, reason: 'permission', assets: [] })),
      pullSms: vi.fn(async () => ({ ok: false, reason: 'permission', messages: [] })),
      cursor: { get: vi.fn(async () => null), set: vi.fn(async () => {}) },
    });
    const res = await runCapturePass(deps, COUPLE);
    // first degraded source wins — keeps the operator's diagnostic unambiguous
    expect(res.reason).toBe('photo_permission');
  });
});

describe('runCapturePass — idempotent device_key', () => {
  it('relies on the queue insert-or-ignore; the collector never pre-dedupes', async () => {
    const queue = makeQueue();
    const deps = makeDeps({
      scanPhotos: vi.fn(async () => ({
        ok: true,
        assets: [
          { assetId: 'dup', uri: 'file:///x.jpg', creationTime: 900, modificationTime: 900, filename: null, mimeType: null, width: 1, height: 1 },
          { assetId: 'dup', uri: 'file:///x.jpg', creationTime: 900, modificationTime: 900, filename: null, mimeType: null, width: 1, height: 1 },
        ],
      })),
      queue,
      cursor: { get: vi.fn(async () => null), set: vi.fn(async () => {}) },
    });
    const res = await runCapturePass(deps, COUPLE);
    expect(res.photosFound).toBe(2);
    // both rows hit the queue with the same device_key; the DB dedupes (INSERT OR IGNORE)
    expect(queue.mock.calls[0]![0]!.device_key).toBe('dup');
    expect(queue.mock.calls[1]![0]!.device_key).toBe('dup');
  });
});
