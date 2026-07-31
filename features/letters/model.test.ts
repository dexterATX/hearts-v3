// features/letters/model.test.ts — letter unlocking, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { isUnlocked, sealedReason, shelf, sealed } from './model';
import type { LetterRow } from '../../lib/db/database.types';

const base = {
  id: 'l1',
  couple_id: 'c1',
  author_id: 'me',
  label: 'for you',
  body: 'hi',
  audio_url: null,
  op_id: null,
  created_at: '2026-01-01T00:00:00Z',
};

const row = (over: Partial<LetterRow>): LetterRow => ({ ...base, ...over }) as LetterRow;

describe('isUnlocked', () => {
  it('anytime letters are always openable', () => {
    expect(isUnlocked(row({ lock_type: 'anytime', unlock_at: null, unlock_mood: null, opened_at: null }), [])).toBe(true);
  });

  it('date letters stay sealed before unlock_at', () => {
    const l = row({ lock_type: 'date', unlock_at: '2026-12-25T00:00:00Z', unlock_mood: null, opened_at: null });
    expect(isUnlocked(l, [], new Date('2026-06-01'))).toBe(false);
    expect(isUnlocked(l, [], new Date('2026-12-25T00:00:01Z'))).toBe(true);
  });

  it('mood letters open when the named mood exists in history', () => {
    const l = row({ lock_type: 'mood', unlock_at: null, unlock_mood: 'missing', opened_at: null });
    expect(isUnlocked(l, [{ mood: 'happy' }])).toBe(false);
    expect(isUnlocked(l, [{ mood: 'missing' }])).toBe(true);
  });

  it('opened letters stay open forever', () => {
    const l = row({ lock_type: 'date', unlock_at: '2999-01-01T00:00:00Z', unlock_mood: null, opened_at: '2026-01-02T00:00:00Z' });
    expect(isUnlocked(l, [], new Date('2026-01-03'))).toBe(true);
  });
});

describe('sealedReason', () => {
  it('never leaks a count or the body', () => {
    expect(sealedReason(row({ lock_type: 'mood', unlock_mood: 'grumpy', unlock_at: null }))).toContain('grumpy');
    expect(sealedReason(row({ lock_type: 'anytime', unlock_at: null, unlock_mood: null }))).toBe('ready when you are');
  });
});

describe('shelf / sealed', () => {
  it('splits opened from sealed and orders both', () => {
    const a = row({ id: 'a', lock_type: 'anytime', unlock_at: null, unlock_mood: null, opened_at: '2026-01-02T00:00:00Z' });
    const b = row({ id: 'b', lock_type: 'anytime', unlock_at: null, unlock_mood: null, opened_at: '2026-01-05T00:00:00Z' });
    const c = row({ id: 'c', lock_type: 'anytime', unlock_at: null, unlock_mood: null, opened_at: null, created_at: '2026-01-03T00:00:00Z' });
    expect(shelf([a, b, c]).map((l) => l.id)).toEqual(['b', 'a']);
    expect(sealed([a, b, c]).map((l) => l.id)).toEqual(['c']);
  });
});
