// features/home/model.ts — pure home logic. No RN imports. No feature imports.

/** Parse 'YYYY-MM-DD' as a LOCAL date — `new Date(s)` would treat it as UTC
 *  midnight, shifting the day in every timezone west of Greenwich (P1). */
export function parseLocalDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysTogether(anniversaryIso: string | null, now = new Date()): number | null {
  if (!anniversaryIso) return null;
  const start = parseLocalDate(anniversaryIso);
  if (!start) return null;
  const days = Math.floor(
    (startOfLocalDay(now).getTime() - startOfLocalDay(start).getTime()) / 86_400_000,
  );
  return days >= 0 ? days : null;
}

export function daysLabel(days: number | null): string {
  if (days === null) return 'our story started — set the day in settings';
  if (days === 0) return 'day one. today. ♥';
  return `${days} days of us`;
}

/** The home feed: everything either of us did, newest first, one shape. */
export type FeedItem =
  | { kind: 'mood'; id: string; at: string; authorId: string; mood: string }
  | { kind: 'letter'; id: string; at: string; authorId: string; label: string; opened: boolean }
  | { kind: 'voice'; id: string; at: string; authorId: string; heard: boolean }
  | { kind: 'photo'; id: string; at: string; authorId: string; caption: string };

export function buildFeed(items: FeedItem[], limit = 30): FeedItem[] {
  return [...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Unread badges (§7.2): unheard voice notes + letters ready to open.
 *  NEVER a sealed-letter count (§7.5) — badges count gifts, not secrets. */
export function badgeCounts(input: {
  myId: string;
  voiceNotes: { author_id: string; heard_at: string | null }[];
  letters: { id: string; author_id: string; opened_at: string | null }[];
  unlockableLetterIds: Set<string>;
}): { voice: number; letters: number } {
  const voice = input.voiceNotes.filter(
    (v) => v.author_id !== input.myId && !v.heard_at,
  ).length;
  const letters = input.letters.filter(
    (l) => l.author_id !== input.myId && !l.opened_at && input.unlockableLetterIds.has(l.id),
  ).length;
  return { voice, letters };
}

/** Badge-scoped unlock projection — mirrors the letters slice's unlock rules.
 *  Duplicated on purpose: features never import each other (§2.1), and this
 *  is a read-only projection, not the letters feature's source of truth. */
export function isLetterOpenable(
  letter: {
    lock_type: string; // generated type; runtime values constrained by CHECK
    unlock_at: string | null;
    unlock_mood: string | null;
    opened_at: string | null;
  },
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
      return false;
  }
}

export function feedLine(item: FeedItem, partnerName: string, myId: string): string {
  const who = item.authorId === myId ? 'you' : partnerName;
  switch (item.kind) {
    case 'mood':
      return `${who} felt ${item.mood}`;
    case 'letter':
      return item.opened ? `${who} opened a letter` : `${who} sealed a letter`;
    case 'voice':
      return item.heard ? `${who} left a voice note` : `${who} left a voice note — unheard`;
    case 'photo':
      return item.caption ? `${who} added a photo — ${item.caption}` : `${who} added a photo`;
  }
}
