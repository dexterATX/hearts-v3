// features/journal/model.ts — pure journal logic. No RN imports.
import type { JournalEntryRow } from '../../lib/db/database.types';

/** Calendar grouping (§7.13): entries bucketed by day, newest first. */
export function groupByDay(
  rows: readonly JournalEntryRow[],
): { day: string; rows: JournalEntryRow[] }[] {
  const groups = new Map<string, JournalEntryRow[]>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    const list = groups.get(day) ?? [];
    list.push(row);
    groups.set(day, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, dayRows]) => ({ day, rows: dayRows }));
}

/** What I see: everything shared + my own private ones (RLS mirrors this). */
export function visibleTo(rows: readonly JournalEntryRow[], myId: string): JournalEntryRow[] {
  return rows.filter((r) => r.visibility === 'shared' || r.author_id === myId);
}

export function excerpt(body: string, max = 120): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
