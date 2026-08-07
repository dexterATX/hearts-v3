// lib/sync/outboxCore.test.ts — replay/idempotency logic, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { decide, orderForFlush, nextBackoffMs, classifyError, type Op } from './outboxCore';

const op = (over: Partial<Op> = {}): Op => ({
  opId: 'o1',
  coupleId: 'c1',
  kind: 'upsert',
  table: 'moods',
  payload: { mood: 'loved' },
  attempts: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

// the REAL PostgrestError shape (supabase-js v2): message, details, hint,
// code — and crucially NO .status field (P1 finding)
const postgrestError = (code: string) => ({
  message: 'duplicate key value violates unique constraint "moods_op_id_key"',
  details: 'Key (op_id)=(x) already exists.',
  hint: '',
  code,
});

describe('classifyError (real PostgrestError shapes)', () => {
  it('maps unique violations to 409 — permanent conflict', () => {
    expect(classifyError(postgrestError('23505')).status).toBe(409);
  });
  it('maps fk violations to 409', () => {
    expect(classifyError(postgrestError('23503')).status).toBe(409);
  });
  it('maps RLS denials to 403', () => {
    expect(classifyError(postgrestError('42501')).status).toBe(403);
  });
  it('maps data exceptions to 400', () => {
    expect(classifyError(postgrestError('22P02')).status).toBe(400);
  });
  it('maps PostgREST schema errors to 400', () => {
    expect(classifyError(postgrestError('PGRST116')).status).toBe(400);
  });
  it('leaves network failures status-less → transient, backoff path', () => {
    const networkError = { message: 'fetch failed', details: '', hint: '', code: '' };
    expect(classifyError(networkError).status).toBeUndefined();
    expect(classifyError({ message: 'Network request failed' }).status).toBeUndefined();
  });
});

describe('decide', () => {
  it('sends immediately when there is no prior error', () => {
    expect(decide(op(), null, 0, 0)).toEqual({ action: 'send' });
  });

  it('backs off after network errors', () => {
    const d = decide(op({ attempts: 1 }), { status: 0 }, 0, 0, () => 0.5);
    expect(d.action).toBe('wait');
  });

  it('retries after the backoff elapses', () => {
    const d = decide(op({ attempts: 0 }), { status: 0 }, 10_000, 0, () => 0.5);
    expect(d.action).toBe('send');
  });

  it('kills ops on permanent 4xx — retrying cannot help', () => {
    expect(decide(op(), classifyError(postgrestError('42501')), 0, 0).action).toBe('dead');
    expect(decide(op(), classifyError(postgrestError('23505')), 0, 0).action).toBe('dead');
    expect(decide(op(), classifyError(postgrestError('PGRST116')), 0, 0).action).toBe('dead');
  });

  it('does NOT kill ops on classified network errors', () => {
    const netErr = classifyError({ message: 'fetch failed' });
    expect(decide(op({ attempts: 0 }), netErr, 0, 0, () => 0.5).action).not.toBe('dead');
    expect(decide(op({ attempts: 0 }), netErr, 10_000, 0, () => 0.5).action).toBe('send');
  });

  it('NEVER kills ops on network errors, however many attempts — durability', () => {
    // A transient failure must not permanently drop an op (the app's contract
    // is that airplane-mode / long outages lose nothing). The old MAX_ATTEMPTS
    // "give up" branch is gone; even at a huge attempt count decide() only
    // ever backs off for a network error.
    expect(decide(op({ attempts: 100 }), { status: 0 }, 0, 0, () => 0.5).action).toBe('wait');
    const afterBackoff = decide(op({ attempts: 100 }), { status: 0 }, 10_000 * 60, 0, () => 0.5);
    expect(afterBackoff.action).toBe('send');
    expect(afterBackoff.action).not.toBe('dead');
  });
});

describe('orderForFlush', () => {
  it('orders strictly oldest-first', () => {
    const a = op({ opId: 'a', createdAt: '2026-01-03T00:00:00Z' });
    const b = op({ opId: 'b', createdAt: '2026-01-01T00:00:00Z' });
    const c = op({ opId: 'c', createdAt: '2026-01-02T00:00:00Z' });
    expect(orderForFlush([a, b, c]).map((o) => o.opId)).toEqual(['b', 'c', 'a']);
  });
});

describe('nextBackoffMs', () => {
  it('grows exponentially and caps at 30s', () => {
    expect(nextBackoffMs(0, () => 0)).toBe(1000);
    expect(nextBackoffMs(0, () => 0.5)).toBe(1250);
    expect(nextBackoffMs(3, () => 0)).toBe(8000);
    expect(nextBackoffMs(10, () => 1)).toBe(30_000);
  });
});
