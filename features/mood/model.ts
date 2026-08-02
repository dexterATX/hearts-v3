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
