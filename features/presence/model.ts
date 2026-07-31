// features/presence/model.ts — pure presence logic. No RN imports.
import type { PresenceState } from '../../lib/sync/presence';

const SCREEN_NAMES: Record<string, string> = {
  index: 'on the home screen',
  letters: 'reading your letters',
  'new-letter': 'a letter',
  play: 'picking a game',
  us: 'looking at us',
  settings: 'in settings',
  canvas: 'drawing with you',
  hangman: 'playing daisy hangman',
  battleship: 'hiding hearts at sea',
  quiz: 'quizzing you',
  cards: 'shuffling cards',
  photos: 'in your photos',
};

export function describePresence(p: PresenceState): string {
  if (p.typing_in) return `typing in ${SCREEN_NAMES[p.typing_in] ?? p.typing_in}…`;
  return SCREEN_NAMES[p.screen] ?? `on ${p.screen}`;
}

/** Presence goes stale fast — after 90s silence, fall back to last_seen. */
export function isStale(p: PresenceState, now = Date.now()): boolean {
  return now - p.at > 90_000;
}

export function lastSeenText(iso: string | null): string {
  if (!iso) return 'has not been here yet';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return 'here right now';
  if (mins < 60) return `here ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `here ${hours}h ago`;
  return `here ${Math.round(hours / 24)}d ago`;
}
