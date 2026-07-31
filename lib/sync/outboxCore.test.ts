// lib/sync/outboxCore.test.ts — replay/idempotency logic, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { decide, orderForFlush, nextBackoffMs, MAX_ATTEMPTS, type Op } from './outboxCore';

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
    expect(decide(op(), { status: 403, code: '42501' }, 0, 0).action).toBe('dead');
    expect(decide(op(), { status: 400 }, 0, 0).action).toBe('dead');
  });

  it('gives up after MAX_ATTEMPTS even on network errors', () => {
    const d = decide(op({ attempts: MAX_ATTEMPTS }), { status: 0 }, 0, 0);
    expect(d.action).toBe('dead');
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
