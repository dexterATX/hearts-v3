// features/games/cards/hooks.ts — the deck, dealt on one phone, same everywhere.
import { useState, useCallback } from 'react';
import { useSession } from '../../../lib/session/store';
import { useGame } from '../engine/runtime';
import { createSession } from '../engine/session';
import { cardsRules, deckFor, currentCard, cardsLeft, type CardLevel } from './rules';
import type { Result } from '../../../lib/result';
import { ok, err } from '../../../lib/result';
import type { GameSessionRow } from '../../../lib/db/database.types';

/** Fisher-Yates — the starter shuffles, the ORDER travels in the begin move,
 *  so both phones see the same deck (apply stays pure, no randomness). */
export function shuffledOrder(length: number, rng: () => number = Math.random): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function useCards(sessionId: string | null) {
  const runtime = useGame(cardsRules, sessionId, sessionId ?? 'cards');
  const userId = useSession((s) => s.userId);
  const partnerId = useSession((s) => s.partner?.id ?? null);

  const begin = useCallback(
    async (levels: CardLevel[]): Promise<boolean> => {
      if (!userId || !partnerId) return false;
      const deck = deckFor(levels);
      if (deck.length === 0) return false;
      return runtime.move({
        k: 'begin',
        levels,
        players: [userId, partnerId],
        order: shuffledOrder(deck.length),
      });
    },
    [userId, partnerId, runtime],
  );

  const draw = useCallback(() => runtime.move({ k: 'draw' }), [runtime]);
  const skip = useCallback(() => runtime.move({ k: 'skip' }), [runtime]);

  const card = runtime.state ? currentCard(runtime.state) : null;
  const left = runtime.state ? cardsLeft(runtime.state) : 0;

  return { ...runtime, begin, draw, skip, card, left };
}

export function useStartCards(): { start: () => Promise<Result<GameSessionRow>>; busy: boolean } {
  const coupleId = useSession((s) => s.coupleId);
  const [busy, setBusy] = useState(false);
  const start = useCallback(async () => {
    if (!coupleId) return err({ code: 'validation', message: 'pair up first' });
    setBusy(true);
    try {
      const res = await createSession(coupleId, 'cards', null, {});
      return res.ok ? ok(res.data) : res;
    } finally {
      setBusy(false);
    }
  }, [coupleId]);
  return { start, busy };
}
