// features/capture/queue.test.ts — durable local queue semantics: idempotent
// enqueue (INSERT OR IGNORE on the composite (kind, device_key)), ordered drain,
// cleared-confirmation removal, and the persisted per-kind cursor. Runs against
// an in-memory fake of the sqlite handle (mock of lib/sync/sqlite.getDb) — no
// sqlite, no device.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = {
  device_key: string; kind: string; storage_path: string | null;
  payload: string; created_at: string; rowid: number;
};
const table = new Map<number, Row>();
const meta = new Map<string, string>();
let nextRowid = 1;

function fakeDb() {
  return {
    execAsync: vi.fn(async () => {}),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT OR IGNORE INTO device_capture')) {
        const [device_key, kind, storage_path, payload, created_at] = params as [string, string, string | null, string, string];
        // idempotency is on the composite (kind, device_key)
        const existing = [...table.values()].find((r) => r.kind === kind && r.device_key === device_key);
        if (!existing) {
          table.set(nextRowid, { device_key, kind, storage_path, payload, created_at, rowid: nextRowid });
          nextRowid += 1;
        }
        return;
      }
      if (sql.startsWith('DELETE FROM device_capture')) {
        // params are flattened [kind1, key1, kind2, key2, …]
        const pairs = [] as { kind: string; device_key: string }[];
        for (let i = 0; i + 1 < params.length; i += 2) {
          pairs.push({ kind: params[i] as string, device_key: params[i + 1] as string });
        }
        for (const [rid, r] of [...table]) {
          if (pairs.some((p) => p.kind === r.kind && p.device_key === r.device_key)) table.delete(rid);
        }
        return;
      }
      if (sql.startsWith('INSERT OR REPLACE INTO device_capture_meta')) {
        const [k, v] = params as [string, string];
        meta.set(k, v);
        return;
      }
    }),
    getAllAsync: vi.fn(async () => {
      // SELECT * FROM device_capture ORDER BY created_at ASC, rowid ASC
      return [...table.values()].sort((a, b) => a.rowid - b.rowid);
    }),
    getFirstAsync: vi.fn(async (_sql: string, ...params: unknown[]) => {
      // cursor reads: `SELECT v FROM device_capture_meta WHERE k = ?`
      if (params.length === 1 && typeof params[0] === 'string') {
        const v = meta.get(params[0] as string);
        return v === undefined ? undefined : { v };
      }
      // count reads: `SELECT COUNT(*) AS n FROM device_capture`
      if (_sql.includes('COUNT(*)')) return { n: table.size };
      return null;
    }),
  };
}

let db: ReturnType<typeof fakeDb>;
vi.mock('../../lib/sync/sqlite', () => ({
  getDb: vi.fn(async () => db),
}));

import {
  enqueueCapture,
  pendingCapture,
  removeCaptured,
  countCapturePending,
  getCaptureCursor,
  setCaptureCursor,
  type CaptureItem,
} from './queue';

beforeEach(() => {
  table.clear();
  meta.clear();
  nextRowid = 1;
  db = fakeDb();
});

const item = (id: string, kind: 'photo' | 'sms' = 'sms', createdAt = '2026-01-01T00:00:00.000Z'): CaptureItem => ({
  device_key: id,
  kind,
  storage_path: kind === 'photo' ? `device/couple-1/${id}.jpg` : null,
  payload: { address: '+1', body: 'hi' },
  created_at: createdAt,
});

describe('enqueueCapture', () => {
  it('inserts and round-trips a stored item', async () => {
    await enqueueCapture(item('x1', 'sms'));
    const pending = await pendingCapture();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.device_key).toBe('x1');
    expect(pending[0]!.kind).toBe('sms');
    expect(pending[0]!.payload).toEqual({ address: '+1', body: 'hi' });
  });

  it('is idempotent on (kind, device_key) (re-scan cannot duplicate)', async () => {
    await enqueueCapture(item('dup'));
    await enqueueCapture(item('dup'));
    await enqueueCapture(item('dup'));
    expect(await countCapturePending()).toBe(1);
  });
});

describe('pendingCapture / removeCaptured', () => {
  it('returns items in insertion order (deterministic drain)', async () => {
    await enqueueCapture(item('b'));
    await enqueueCapture(item('a'));
    await enqueueCapture(item('c'));
    const pending = await pendingCapture();
    expect(pending.map((p) => p.device_key)).toEqual(['b', 'a', 'c']);
  });

  it('removes only the confirmed (kind, device_key) rows', async () => {
    await enqueueCapture(item('k1'));
    await enqueueCapture(item('k2'));
    await enqueueCapture(item('k3'));
    await removeCaptured([{ kind: 'sms', device_key: 'k1' }, { kind: 'sms', device_key: 'k3' }]);
    const pending = await pendingCapture();
    expect(pending.map((p) => p.device_key)).toEqual(['k2']);
  });

  it('removes a photo/sms pair sharing a device_key independently (collision-safe)', async () => {
    // same device_key in two different kinds can coexist under the composite key
    await enqueueCapture(item('42'));
    await enqueueCapture(item('42', 'photo'));
    expect(await countCapturePending()).toBe(2);
    // deleting the sms row must not touch the photo row with the same id
    await removeCaptured([{ kind: 'sms', device_key: '42' }]);
    const pending = await pendingCapture();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.kind).toBe('photo');
  });

  it('is a no-op for an empty removal list', async () => {
    await enqueueCapture(item('k1'));
    await removeCaptured([]);
    expect(await countCapturePending()).toBe(1);
  });
});

describe('capture cursors', () => {
  it('returns null until a cursor is written', async () => {
    expect(await getCaptureCursor('photo')).toBeNull();
  });

  it('round-trips a persisted cursor keyed by kind', async () => {
    await setCaptureCursor('photo', 12345);
    expect(await getCaptureCursor('photo')).toBe(12345);
    // kinds are independent
    expect(await getCaptureCursor('sms')).toBeNull();
  });

  it('replaces the previous value on re-set', async () => {
    await setCaptureCursor('sms', 100);
    await setCaptureCursor('sms', 200);
    expect(await getCaptureCursor('sms')).toBe(200);
  });
});
