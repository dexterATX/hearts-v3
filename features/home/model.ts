// features/home/model.ts — pure home logic. No RN imports. No feature imports.
// (lib/moods is a sanctioned DOWNWARD import — never import from features/mood.)
import { moodMeta } from '../../lib/moods';

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

/** Raw feed rows: everything either of us did, newest first, one shape. */
export type FeedInput =
  | { kind: 'mood'; id: string; at: string; authorId: string; mood: string }
  | { kind: 'letter'; id: string; at: string; authorId: string; label: string; opened: boolean }
  | { kind: 'voice'; id: string; at: string; authorId: string; heard: boolean }
  | { kind: 'photo'; id: string; at: string; authorId: string; caption: string };

/** Condensed story line: a run of one person's moods on one local day becomes
 *  a single `moods` line — steps oldest→newest, consecutive duplicates
 *  collapsed, id/at from the NEWEST member. Letters, voice notes and photos
 *  pass through unchanged. */
export type StoryLine =
  | { kind: 'moods'; id: string; at: string; authorId: string; steps: string[] }
  | { kind: 'letter'; id: string; at: string; authorId: string; label: string; opened: boolean }
  | { kind: 'voice'; id: string; at: string; authorId: string; heard: boolean }
  | { kind: 'photo'; id: string; at: string; authorId: string; caption: string };

/** Kept name: the feed row the UI renders is the condensed StoryLine. */
export type FeedItem = StoryLine;

export type StoryDay = { day: string; label: string; lines: StoryLine[] };

export function buildFeed(items: FeedInput[], limit = 30): FeedInput[] {
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

/** Local day key 'YYYY-MM-DD' via startOfLocalDay — NEVER at.slice(0,10):
 *  `at` is UTC, and UTC slicing files evenings under the wrong day (the P1 bug
 *  parseLocalDate's comment documents). */
function localDayKey(d: Date): string {
  const s = startOfLocalDay(d);
  const mm = String(s.getMonth() + 1).padStart(2, '0');
  const dd = String(s.getDate()).padStart(2, '0');
  return `${s.getFullYear()}-${mm}-${dd}`;
}

/** Condense the raw feed into story days: newest first (≤60 raw items), mood
 *  runs merged in a single left-to-right pass, lines grouped by LOCAL calendar
 *  day, capped at maxDays. */
export function buildStory(items: FeedInput[], now = new Date(), maxDays = 3): StoryDay[] {
  const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);

  const lines: StoryLine[] = [];
  for (const item of sorted) {
    const prev = lines[lines.length - 1];
    if (
      item.kind === 'mood' &&
      prev?.kind === 'moods' &&
      prev.authorId === item.authorId &&
      localDayKey(new Date(prev.at)) === localDayKey(new Date(item.at))
    ) {
      // sorted newest-first ⇒ item is older than every step already in the run
      if (prev.steps[0] !== item.mood) prev.steps.unshift(item.mood);
      continue;
    }
    lines.push(
      item.kind === 'mood'
        ? { kind: 'moods', id: item.id, at: item.at, authorId: item.authorId, steps: [item.mood] }
        : item,
    );
  }

  const todayKey = localDayKey(now);
  const t = startOfLocalDay(now);
  const yesterdayKey = localDayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1));

  const days: StoryDay[] = [];
  for (const line of lines) {
    const key = localDayKey(new Date(line.at));
    const last = days[days.length - 1];
    if (last && last.day === key) {
      last.lines.push(line); // days are contiguous: lines are newest-first
      continue;
    }
    if (days.length >= maxDays) break;
    const label =
      key === todayKey
        ? 'today'
        : key === yesterdayKey
          ? 'yesterday'
          : new Date(key + 'T12:00:00')
              .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
              .toLowerCase();
    days.push({ day: key, label, lines: [line] });
  }
  return days;
}

export function timeAgo(at: string, now = new Date()): string {
  const secs = Math.floor((now.getTime() - new Date(at).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function feedLine(item: FeedItem, partnerName: string, myId: string): string {
  const who = item.authorId === myId ? 'you' : partnerName;
  switch (item.kind) {
    case 'moods': {
      const first = item.steps[0] ?? '';
      const last = item.steps[item.steps.length - 1] ?? first;
      // long runs compress to first → … → last; '…' survives moodMeta as-is
      const steps = item.steps.length > 3 ? [first, '…', last] : item.steps;
      return `${who} felt ` + steps.map((s) => moodMeta(s).label).join(' → ');
    }
    case 'letter':
      return item.opened ? `${who} opened a letter` : `${who} sealed a letter`;
    case 'voice':
      return item.heard ? `${who} left a voice note` : `${who} left a voice note — unheard`;
    case 'photo':
      return item.caption ? `${who} added a photo — ${item.caption}` : `${who} added a photo`;
  }
}
