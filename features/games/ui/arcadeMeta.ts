// features/games/ui/arcadeMeta.ts — the arcade's catalog: what each game is
// called, what it whispers, and where it lives. Shared by the picker grid,
// the live strip, and anything that deep-links into a session.
import type { GameKind } from '../../../lib/db/database.types';

export const ARCADE_GAMES: { kind: GameKind; title: string; blurb: string }[] = [
  { kind: 'hangman', title: 'loves me, loves me not', blurb: 'a word, a daisy, six petals' },
  { kind: 'battleship', title: 'find my hearts', blurb: 'hide yours, find theirs' },
  { kind: 'quiz', title: 'how well do you know me', blurb: 'one score for both of you' },
  { kind: 'cards', title: 'the deck', blurb: 'truth or dare · would you rather · 20q' },
];

// literal pathnames keep typed routes happy; params ride the object form
export const ARCADE_PATHS = {
  hangman: '/games/hangman',
  battleship: '/games/battleship',
  quiz: '/games/quiz',
  cards: '/games/cards',
} as const;

export function arcadeHref(kind: GameKind, sessionId: string) {
  return { pathname: ARCADE_PATHS[kind], params: { sessionId } } as const;
}
