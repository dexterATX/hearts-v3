// features/events/model.ts — pure countdown logic. No RN imports.
import type { EventRow } from '../../lib/db/database.types';

/** Next occurrence, honouring yearly recurrence. Pure given `now`. */
export function nextOccurrence(event: Pick<EventRow, 'date' | 'recurring'>, now = new Date()): Date | null {
  const base = new Date(`${event.date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  if (!event.recurring) return base >= startOfDay(now) ? base : null;
  let year = now.getFullYear();
  let next = new Date(base);
  next.setFullYear(year);
  if (next < startOfDay(now)) {
    next = new Date(base);
    next.setFullYear(year + 1);
  }
  return next;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysUntil(date: Date, now = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days === 0) return 'today ♥';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Sorted by next occurrence, soonest first; past one-offs sink to the end. */
export function upcoming(rows: readonly EventRow[], now = new Date()): { event: EventRow; next: Date; days: number }[] {
  return rows
    .map((event) => {
      const next = nextOccurrence(event, now);
      return next ? { event, next, days: daysUntil(next, now) } : null;
    })
    .filter((x): x is { event: EventRow; next: Date; days: number } => x !== null)
    .sort((a, b) => a.days - b.days);
}

/** Reminder window: should a local notification fire for this event today? */
export function shouldRemind(event: EventRow, now = new Date()): boolean {
  const next = nextOccurrence(event, now);
  if (!next) return false;
  return daysUntil(next, now) === event.remind_days_before;
}
