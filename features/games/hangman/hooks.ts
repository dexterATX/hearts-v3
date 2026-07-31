// features/games/hangman/hooks.ts — setter watches live (§7.7); verdicts are
// resolved on the SETTER'S device from their local word and appended as moves.
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from '../../../lib/session/store';
import { useGame } from '../engine/runtime';
import { createSession } from '../engine/session';
import { useGameSecrets } from '../engine/secrets';
import {
  hangmanRules,
  hashWord,
  positionsOf,
  type HangmanMove,
} from './rules';
import type { Result } from '../../../lib/result';
import { ok, err } from '../../../lib/result';
import type { GameSessionRow } from '../../../lib/db/database.types';

export function useHangman(sessionId: string | null) {
  const runtime = useGame(hangmanRules, sessionId, sessionId ?? 'hangman');
  const userId = useSession((s) => s.userId);
  const myWord = useGameSecrets((s) => (sessionId ? s.words[sessionId] : undefined));
  const attemptedRef = useRef<string | null>(null); // verdict loop-guard

  const iAmSetter = !!runtime.state?.setter && runtime.state.setter === userId;

  // the game is over — the word has no more secrets to keep (device hygiene)
  useEffect(() => {
    if (runtime.outcome && sessionId) useGameSecrets.getState().clearSession(sessionId);
  }, [runtime.outcome, sessionId]);

  // SETTER'S DUTY: a guess lands → resolve it locally → append the verdict.
  // The guesser's phone learns ONLY hit/miss/positions — never the word.
  // attemptedRef stops a failed verdict write from hot-looping: the refold
  // after rollback hands us a fresh `tried` array, which would otherwise
  // re-fire this effect forever (swarm finding). The runtime's own
  // lastFailedMove UI path carries the retry.
  useEffect(() => {
    const s = runtime.state;
    if (!s || !sessionId || !iAmSetter || !myWord) return;
    if (runtime.lastFailedMove !== null) return; // manual retry owns it now
    const pending = s.tried.filter(
      (letter) =>
        !runtime.moves.some(
          (m) =>
            (m.payload as HangmanMove).k === 'verdict' &&
            (m.payload as { k: 'verdict'; letter: string }).letter === letter,
        ),
    );
    for (const letter of pending) {
      if (attemptedRef.current === letter) continue;
      attemptedRef.current = letter;
      void runtime.move({ k: 'verdict', letter, positions: positionsOf(myWord, letter) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the log
  }, [runtime.state?.tried, iAmSetter, myWord, sessionId]);

  const commitWord = useCallback(
    async (word: string): Promise<boolean> => {
      if (!sessionId) return false;
      const clean = word.toLowerCase().trim();
      if (!/^[a-z]+$/.test(clean)) return false;
      useGameSecrets.getState().setWord(sessionId, clean);
      return runtime.move({ k: 'commit', wordHash: hashWord(sessionId, clean), length: clean.length });
    },
    [sessionId, runtime],
  );

  const guess = useCallback(
    (letter: string) => runtime.move({ k: 'guess', letter: letter.toLowerCase() }),
    [runtime],
  );

  return { ...runtime, commitWord, guess, iAmSetter, hasLocalWord: !!myWord };
}

export function useStartHangman(): {
  start: () => Promise<Result<GameSessionRow>>;
  busy: boolean;
} {
  const coupleId = useSession((s) => s.coupleId);
  const [busy, setBusy] = useState(false);
  const start = useCallback(async () => {
    if (!coupleId) return err({ code: 'validation', message: 'pair up first' });
    setBusy(true);
    try {
      const res = await createSession(coupleId, 'hangman', null, {});
      return res.ok ? ok(res.data) : res;
    } finally {
      setBusy(false);
    }
  }, [coupleId]);
  return { start, busy };
}
