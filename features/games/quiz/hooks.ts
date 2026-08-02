// features/games/quiz/hooks.ts — write questions about yourself, answer theirs.
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../../lib/session/store';
import { enqueue } from '../../../lib/sync/outbox';
import { useGame } from '../engine/runtime';
import { createSession } from '../engine/session';
import { fetchQuestions } from './api';
import { quizRules, currentQuestion, type QuizQuestion } from './rules';
import type { Result } from '../../../lib/result';
import { ok, err } from '../../../lib/result';
import type { GameSessionRow } from '../../../lib/db/database.types';

const KEY = ['quiz-questions'] as const;

export function useQuizQuestions() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...KEY, coupleId],
    queryFn: async () => {
      const res = await fetchQuestions(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

export function useAddQuestion() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();
  return useCallback(
    async (prompt: string, options: string[], answerIndex: number) => {
      if (!coupleId || !userId) return;
      await enqueue({
        coupleId,
        kind: 'upsert',
        table: 'quiz_questions',
        payload: { couple_id: coupleId, author_id: userId, prompt, options, answer_index: answerIndex },
      });
      void queryClient.invalidateQueries({ queryKey: [...KEY, coupleId] });
    },
    [coupleId, userId, queryClient],
  );
}

export function useQuiz(sessionId: string | null) {
  const runtime = useGame(quizRules, sessionId, sessionId ?? 'quiz');
  const questions = useQuizQuestions();
  const userId = useSession((s) => s.userId);
  const partnerId = useSession((s) => s.partner?.id ?? null);

  /** Deal a round: up to `n` questions mixing both authors, snapshotted into
   *  the begin move so apply() stays pure on both phones. */
  const begin = useCallback(
    async (n = 6): Promise<boolean> => {
      if (!userId || !partnerId || !questions.data) return false;
      const mine = questions.data.filter((q) => q.author_id === userId);
      const theirs = questions.data.filter((q) => q.author_id === partnerId);
      const interleaved: QuizQuestion[] = [];
      const maxLen = Math.max(mine.length, theirs.length);
      for (let i = 0; i < maxLen && interleaved.length < n; i++) {
        const qm = mine[i];
        if (qm) {
          interleaved.push({ id: qm.id, authorId: qm.author_id, prompt: qm.prompt, options: qm.options as string[], answerIndex: qm.answer_index });
        }
        const qt = theirs[i];
        if (qt && interleaved.length < n) {
          interleaved.push({ id: qt.id, authorId: qt.author_id, prompt: qt.prompt, options: qt.options as string[], answerIndex: qt.answer_index });
        }
      }
      if (interleaved.length === 0) return false;
      return runtime.move({ k: 'begin', questions: interleaved, players: [userId, partnerId] });
    },
    [userId, partnerId, questions.data, runtime],
  );

  const answer = useCallback(
    (questionId: string, choiceIndex: number) => runtime.move({ k: 'answer', questionId, choiceIndex }),
    [runtime],
  );

  const question = runtime.state ? currentQuestion(runtime.state) : null;

  return { ...runtime, begin, answer, question, questionBank: questions };
}

export function useStartQuiz(): { start: () => Promise<Result<GameSessionRow>>; busy: boolean } {
  const coupleId = useSession((s) => s.coupleId);
  const [busy, setBusy] = useState(false);
  const start = useCallback(async () => {
    if (!coupleId) return err({ code: 'validation', message: 'pair up first' });
    setBusy(true);
    try {
      const res = await createSession(coupleId, 'quiz', null, {});
      return res.ok ? ok(res.data) : res;
    } finally {
      setBusy(false);
    }
  }, [coupleId]);
  return { start, busy };
}
