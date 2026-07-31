// features/home/model.test.ts — date math, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { parseLocalDate, daysTogether, daysLabel } from './model';

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
