// features/photos/model.test.ts — on-this-day, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { onThisDay, photosInAlbum } from './model';
import type { PhotoRow } from '../../lib/db/database.types';

const photo = (over: Partial<PhotoRow>): PhotoRow =>
  ({
    id: 'p',
    couple_id: 'c',
    author_id: 'a',
    album_id: null,
    storage_path: 'c/p.jpg',
    caption: '',
    taken_at: null,
    op_id: null,
    created_at: '2024-07-30T12:00:00Z',
    ...over,
  }) as PhotoRow;

describe('onThisDay', () => {
  const now = new Date(2026, 6, 30, 12, 0); // local July 30, noon

  it('matches the same LOCAL month-day in earlier years only', () => {
    const lastYear = photo({ id: 'a', taken_at: new Date(2025, 6, 30, 9, 0).toISOString() });
    const otherDay = photo({ id: 'b', taken_at: new Date(2025, 6, 31, 9, 0).toISOString() });
    const thisYear = photo({ id: 'c', taken_at: new Date(2026, 6, 30, 8, 0).toISOString() });
    expect(onThisDay([lastYear, otherDay, thisYear], now).map((p) => p.id)).toEqual(['a']);
  });

  it('never crashes on a non-date taken_at', () => {
    const bad = photo({ id: 'x', taken_at: 'not a date' });
    expect(onThisDay([bad], now)).toEqual([]);
  });
});

describe('photosInAlbum', () => {
  it('filters and orders newest first', () => {
    const a = photo({ id: 'a', album_id: 'al1', created_at: '2024-01-01T00:00:00Z' });
    const b = photo({ id: 'b', album_id: 'al1', created_at: '2024-06-01T00:00:00Z' });
    const c = photo({ id: 'c', album_id: null });
    expect(photosInAlbum([a, b, c], 'al1').map((p) => p.id)).toEqual(['b', 'a']);
    expect(photosInAlbum([a, b, c], null).map((p) => p.id)).toEqual(['c']);
  });
});
