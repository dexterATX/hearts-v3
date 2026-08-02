// features/letters/model.ts — pure letter logic. No RN imports (§2.9).
// NOTE: no imports from sibling features — the one rule (§2.1).
import type { LetterRow } from '../../lib/db/database.types';

/**
 * Unlock rules (§7.5):
 *  anytime → open whenever she wants
 *  date    → opens at unlock_at
 *  mood    → opens once EITHER partner has pinged unlock_mood
 * Opened letters stay readable — the seal break is a moment, not a door.
 */
export function isUnlocked(
  letter: Pick<LetterRow, 'lock_type' | 'unlock_at' | 'unlock_mood' | 'opened_at'>,
  moods: readonly { mood: string }[],
  now = new Date(),
): boolean {
  if (letter.opened_at) return true;
  switch (letter.lock_type) {
    case 'anytime':
      return true;
    case 'date':
      return !!letter.unlock_at && new Date(letter.unlock_at) <= now;
    case 'mood':
      return !!letter.unlock_mood && moods.some((m) => m.mood === letter.unlock_mood);
    default:
      return false; // generated types widen lock_type to string; CHECK constrains to 3
  }
}

/** Human reason a letter stays sealed — shown on the sealed card, in my voice. */
export function sealedReason(
  letter: Pick<LetterRow, 'lock_type' | 'unlock_at' | 'unlock_mood'>,
): string {
  switch (letter.lock_type) {
    case 'anytime':
      return 'ready when you are';
    case 'date': {
      if (!letter.unlock_at) return 'sealed for later';
      const d = new Date(letter.unlock_at);
      return `sealed until ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
    }
    case 'mood':
      return `opens when one of us feels ${letter.unlock_mood ?? 'it'}`;
    default:
      return 'sealed for later';
  }
}

export const isOpened = (l: Pick<LetterRow, 'opened_at'>): boolean => !!l.opened_at;

// These are generic over the row shape because the list no longer carries a
// `body` (0008 keeps sealed text on the server), while the tests still pass
// full rows. They only ever touch opened_at / created_at / author_id.

/** The shelf: opened, newest first. NEVER a remaining count (§7.5) — the
 *  sealed pile is a promise, not a number. */
export function shelf<T extends Pick<LetterRow, 'opened_at'>>(rows: readonly T[]): T[] {
  return rows.filter(isOpened).sort((a, b) => (b.opened_at ?? '').localeCompare(a.opened_at ?? ''));
}

/** The sealed pile: unopened, ordered by when they were written. */
export function sealed<T extends Pick<LetterRow, 'opened_at' | 'created_at'>>(
  rows: readonly T[],
): T[] {
  return rows.filter((l) => !isOpened(l)).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Letters I wrote vs letters for me. */
export function writtenBy<T extends Pick<LetterRow, 'author_id'>>(
  rows: readonly T[],
  authorId: string,
): T[] {
  return rows.filter((l) => l.author_id === authorId);
}
