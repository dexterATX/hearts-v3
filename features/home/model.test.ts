// features/home/model.test.ts — date math, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { parseLocalDate, daysTogether, daysLabel, buildStory, timeAgo, waveBars, type FeedInput } from './model';

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as a LOCAL date, never UTC', () => {
    const d = parseLocalDate('2025-02-14') as Date;
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(14); // no UTC shift to the 13th
  });
  it('rejects garbage', () => {
    expect(parseLocalDate('14/02/2025')).toBeNull();
    expect(parseLocalDate('')).toBeNull();
  });
});

describe('daysTogether', () => {
  it('counts full local days since the anniversary', () => {
    const now = new Date(2026, 6, 30, 23, 59);
    expect(daysTogether('2025-07-30', now)).toBe(365);
    expect(daysTogether('2026-07-30', now)).toBe(0);
    expect(daysTogether('2026-07-29', now)).toBe(1);
  });
  it('is null without or before the day', () => {
    expect(daysTogether(null)).toBeNull();
    expect(daysTogether('2027-01-01', new Date(2026, 0, 1))).toBeNull();
  });
  it('handles the label', () => {
    expect(daysLabel(0)).toContain('day one');
    expect(daysLabel(365)).toBe('365 days of us');
    expect(daysLabel(null)).toContain('settings');
  });
});

describe('buildStory', () => {
  // fixed "now": sunday 2026-08-02, 3pm LOCAL time
  const now = new Date(2026, 7, 2, 15, 0, 0);

  const mood = (id: string, authorId: string, d: Date, key: string): FeedInput => ({
    kind: 'mood',
    id,
    at: d.toISOString(),
    authorId,
    mood: key,
  });
  const letter = (id: string, authorId: string, d: Date): FeedInput => ({
    kind: 'letter',
    id,
    at: d.toISOString(),
    authorId,
    label: 'for you',
    opened: false,
  });

  it('collapses a same-author run: steps oldest→newest, id/at from the newest', () => {
    const story = buildStory(
      [
        mood('m1', 'a', new Date(2026, 7, 2, 9), 'happy'),
        mood('m2', 'a', new Date(2026, 7, 2, 10), 'playful'),
        mood('m3', 'a', new Date(2026, 7, 2, 11), 'sleepy'),
      ],
      now,
    );
    expect(story).toHaveLength(1);
    expect(story[0]?.label).toBe('today');
    expect(story[0]?.lines).toHaveLength(1);
    const line = story[0]?.lines[0];
    if (line?.kind !== 'moods') throw new Error('expected a moods line');
    expect(line.id).toBe('m3');
    expect(line.at).toBe(new Date(2026, 7, 2, 11).toISOString());
    expect(line.authorId).toBe('a');
    expect(line.steps).toEqual(['happy', 'playful', 'sleepy']);
  });

  it('breaks the run when the author switches', () => {
    const story = buildStory(
      [
        mood('m1', 'a', new Date(2026, 7, 2, 10), 'happy'),
        mood('m2', 'b', new Date(2026, 7, 2, 11), 'playful'),
      ],
      now,
    );
    const lines = story[0]?.lines ?? [];
    expect(lines.map((l) => l.kind)).toEqual(['moods', 'moods']);
    expect(lines.map((l) => l.id)).toEqual(['m2', 'm1']);
  });

  it('breaks the run on a non-mood item, which passes through unchanged', () => {
    const story = buildStory(
      [
        mood('m1', 'a', new Date(2026, 7, 2, 9), 'happy'),
        letter('l1', 'b', new Date(2026, 7, 2, 10)),
        mood('m2', 'a', new Date(2026, 7, 2, 11), 'sleepy'),
      ],
      now,
    );
    const lines = story[0]?.lines ?? [];
    expect(lines.map((l) => l.kind)).toEqual(['moods', 'letter', 'moods']);
    expect(lines.map((l) => l.id)).toEqual(['m2', 'l1', 'm1']);
    expect(lines[1]).toEqual({
      kind: 'letter',
      id: 'l1',
      at: new Date(2026, 7, 2, 10).toISOString(),
      authorId: 'b',
      label: 'for you',
      opened: false,
    });
  });

  it('collapses consecutive duplicate moods', () => {
    const story = buildStory(
      [
        mood('m1', 'a', new Date(2026, 7, 2, 9), 'happy'),
        mood('m2', 'a', new Date(2026, 7, 2, 10), 'happy'),
        mood('m3', 'a', new Date(2026, 7, 2, 11), 'playful'),
      ],
      now,
    );
    const line = story[0]?.lines[0];
    if (line?.kind !== 'moods') throw new Error('expected a moods line');
    expect(line.steps).toEqual(['happy', 'playful']);
    expect(line.id).toBe('m3');
  });

  it('does not merge moods across different LOCAL days', () => {
    // 23:30 and 00:30 local are different days — even where UTC disagrees
    const story = buildStory(
      [
        mood('m1', 'a', new Date(2026, 7, 1, 23, 30), 'happy'),
        mood('m2', 'a', new Date(2026, 7, 2, 0, 30), 'playful'),
      ],
      now,
    );
    expect(story).toHaveLength(2);
    expect(story[0]?.label).toBe('today');
    expect(story[1]?.label).toBe('yesterday');
    expect(story[0]?.lines[0]?.id).toBe('m2');
    expect(story[1]?.lines[0]?.id).toBe('m1');
  });

  it('labels days today / yesterday / earlier date', () => {
    const story = buildStory(
      [
        mood('t', 'a', new Date(2026, 7, 2, 8), 'happy'),
        mood('y', 'a', new Date(2026, 7, 1, 8), 'happy'),
        mood('e', 'a', new Date(2026, 6, 30, 8), 'happy'),
      ],
      now,
    );
    expect(story.map((d) => d.day)).toEqual(['2026-08-02', '2026-08-01', '2026-07-30']);
    expect(story.map((d) => d.label)).toEqual([
      'today',
      'yesterday',
      new Date('2026-07-30T12:00:00')
        .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
        .toLowerCase(),
    ]);
  });

  it('caps the number of days at maxDays, keeping the newest', () => {
    const story = buildStory(
      [0, 1, 2, 3].map((back) => mood(`d${back}`, 'a', new Date(2026, 7, 2 - back, 12), 'happy')),
      now,
      2,
    );
    expect(story.map((d) => d.day)).toEqual(['2026-08-02', '2026-08-01']);
  });
});

describe('timeAgo', () => {
  const now = new Date(2026, 7, 2, 15, 0, 0);
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('covers just-now / minutes / hours / date', () => {
    expect(timeAgo(ago(30_000), now)).toBe('just now');
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5m ago');
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3h ago');
    // 26h back is local aug 1, 1pm — same local date in every timezone
    expect(timeAgo(ago(26 * 3_600_000), now)).toBe(
      new Date(2026, 7, 1, 13).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    );
  });
});

describe('waveBars', () => {
  it('is deterministic per seed — every render draws the same shape', () => {
    expect(waveBars('note-1')).toEqual(waveBars('note-1'));
  });

  it('returns `count` bars, each in the 0.25…1 range', () => {
    const bars = waveBars('note-2', 24);
    expect(bars).toHaveLength(24);
    for (const b of bars) {
      expect(b).toBeGreaterThanOrEqual(0.25);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('distinct seeds draw distinct shapes', () => {
    expect(waveBars('note-1')).not.toEqual(waveBars('note-2'));
  });

  // the feed's waveform must match the voice list's bar-for-bar (§2.1 mirror)
  it('matches the voice slice algorithm on a known seed', () => {
    // computed once from the shared djb2+LCG definition, pinned so neither
    // copy can drift without this test speaking up
    expect(waveBars('abc', 4)).toEqual([
      0.25 + (942 % 1000) / 1333,
      0.25 + (797 % 1000) / 1333,
      0.25 + (888 % 1000) / 1333,
      0.25 + (975 % 1000) / 1333,
    ]);
  });
});
