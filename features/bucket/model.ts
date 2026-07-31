// features/bucket/model.ts — pure bucket-list logic. No RN imports.
import type { BucketItemRow } from '../../lib/db/database.types';

export function openItems(rows: readonly BucketItemRow[]): BucketItemRow[] {
  return rows.filter((r) => !r.done_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function doneItems(rows: readonly BucketItemRow[]): BucketItemRow[] {
  return rows
    .filter((r) => !!r.done_at)
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
}

/** Votes: votes jsonb is { [userId]: true }. Both-voted items float up. */
export function voteCount(row: BucketItemRow): number {
  const votes = (row.votes ?? {}) as Record<string, boolean>;
  return Object.values(votes).filter(Boolean).length;
}

export function hasVoted(row: BucketItemRow, userId: string): boolean {
  const votes = (row.votes ?? {}) as Record<string, boolean>;
  return !!votes[userId];
}

export function withVote(row: BucketItemRow, userId: string, on: boolean): BucketItemRow {
  const votes = { ...((row.votes ?? {}) as Record<string, boolean>) };
  if (on) votes[userId] = true;
  else delete votes[userId];
  return { ...row, votes };
}

/** Ranked for the list: both-voted first, then one-vote, then newest. */
export function ranked(rows: readonly BucketItemRow[]): BucketItemRow[] {
  return [...openItems(rows)].sort((a, b) => voteCount(b) - voteCount(a) || b.created_at.localeCompare(a.created_at));
}

/** Random picker (§7.14) — picks one of the open items, pure given an rng. */
export function pickRandom(rows: readonly BucketItemRow[], rng: () => number = Math.random): BucketItemRow | null {
  const open = openItems(rows);
  if (open.length === 0) return null;
  return open[Math.floor(rng() * open.length)] ?? null;
}

export const CATEGORIES = ['us', 'places', 'food', 'adventure', 'home', 'someday'] as const;
