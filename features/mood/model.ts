// features/mood/model.ts — pure mood logic. No RN imports (§2.9).
// The vocabulary itself lives in lib/moods.ts (shared by journal/letters/home).
import type { MoodRow } from '../../lib/db/database.types';
import { MOODS, moodMeta, type MoodKey } from '../../lib/moods';

export { MOODS, moodMeta, type MoodKey };

/** The newest mood per author, history ordered newest-first. */
export function latestPerAuthor(rows: readonly MoodRow[]): Map<string, MoodRow> {
  const map = new Map<string, MoodRow>();
  for (const row of rows) {
    const existing = map.get(row.author_id);
    if (!existing || row.created_at > existing.created_at) map.set(row.author_id, row);
  }
  return map;
}

/** Group history into day buckets for the history list. */
export function groupByDay(rows: readonly MoodRow[]): { day: string; rows: MoodRow[] }[] {
  const groups = new Map<string, MoodRow[]>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    const list = groups.get(day) ?? [];
    list.push(row);
    groups.set(day, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, dayRows]) => ({
      day,
      rows: [...dayRows].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }));
}
