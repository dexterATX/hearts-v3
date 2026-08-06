// features/home/ui/useStoryArrivals.test.ts — the pure arrival diff, plain
// node (§2.9). The hook is a thin ref+memo wrapper; everything testable lives
// in diffArrivals.
import { describe, it, expect } from 'vitest';
import { diffArrivals } from './useStoryArrivals';
import type { StoryDay, StoryLine } from '../model';

const letter = (id: string): StoryLine => ({
  kind: 'letter',
  id,
  at: '2026-08-02T10:00:00.000Z',
  authorId: 'a',
  label: 'for you',
  opened: false,
});

const days = (...ids: string[]): StoryDay[] => [
  { day: '2026-08-02', label: 'today', lines: ids.map(letter) },
];

describe('diffArrivals', () => {
  it('returns an empty set on the very first data (prev === null)', () => {
    // initial load is the deal cascade, not an arrival
    expect(diffArrivals(null, days('l1', 'l2')).size).toBe(0);
  });

  it('returns an empty set when the previous data was empty', () => {
    // coming back from empty/loading is a re-deal, not an arrival
    expect(diffArrivals(new Set(), days('l1')).size).toBe(0);
  });

  it('detects a new line id', () => {
    const prev = new Set(['l1']);
    expect([...diffArrivals(prev, days('l2', 'l1'))]).toEqual(['l2']);
  });

  it('produces an empty set for an unchanged refetch', () => {
    const prev = new Set(['l1', 'l2']);
    expect(diffArrivals(prev, days('l1', 'l2')).size).toBe(0);
  });

  it('does not count a removed line as an arrival', () => {
    const prev = new Set(['l1', 'l2']);
    expect(diffArrivals(prev, days('l1')).size).toBe(0);
  });
});
