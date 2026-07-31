// features/games/quiz/rules.ts — "how well do you know me" (§7.9).
// Scored TOGETHER, never against: one shared score, both names on it.
// Question content snapshots travel in the begin move → apply stays pure.
import type { GameRules, UserId, Outcome } from '../engine/types';

export type QuizQuestion = {
  id: string;
  authorId: UserId; // who the question is ABOUT (they wrote it)
  prompt: string;
  options: string[];
  answerIndex: number;
};

export type QuizMove =
  | { k: 'begin'; questions: QuizQuestion[]; players: [UserId, UserId] }
  | { k: 'answer'; questionId: string; choiceIndex: number };

export type QuizAnswerRecord = {
  questionId: string;
  by: UserId;
  choiceIndex: number;
  correct: boolean;
};

export type QuizState = {
  phase: 'lobby' | 'playing' | 'done';
  questions: QuizQuestion[];
  players: UserId[];
  answers: QuizAnswerRecord[];
  score: number; // OUR score — one number for both of us
};

export function currentQuestion(s: QuizState): QuizQuestion | null {
  if (s.phase !== 'playing') return null;
  return s.questions[s.answers.length] ?? null;
}

/** Who must answer the current question: NOT its author. */
export function answererFor(q: QuizQuestion | null, players: readonly UserId[]): UserId | null {
  if (!q) return null;
  return players.find((u) => u !== q.authorId) ?? null;
}

export const quizRules: GameRules<QuizState, QuizMove> = {
  init: () => ({ phase: 'lobby', questions: [], players: [], answers: [], score: 0 }),

  apply(state, move, by) {
    switch (move.k) {
      case 'begin': {
        if (state.phase !== 'lobby' || move.questions.length === 0) return state;
        return { ...state, phase: 'playing', questions: move.questions, players: move.players };
      }
      case 'answer': {
        if (state.phase !== 'playing') return state;
        const q = currentQuestion(state);
        if (!q || q.id !== move.questionId) return state; // answers land in order
        if (by === q.authorId) return state; // you never answer your own question
        const correct = move.choiceIndex === q.answerIndex;
        const answers = [
          ...state.answers,
          { questionId: q.id, by, choiceIndex: move.choiceIndex, correct },
        ];
        const score = state.score + (correct ? 1 : 0);
        const phase = answers.length >= state.questions.length ? ('done' as const) : state.phase;
        return { ...state, answers, score, phase };
      }
    }
  },

  turnOf(state) {
    return answererFor(currentQuestion(state), state.players);
  },

  outcome(state): Outcome | null {
    if (state.phase !== 'done') return null;
    const total = state.questions.length;
    const { score } = state;
    const summary =
      score === total
        ? `a perfect ${score} — you two really do know each other`
        : score >= total / 2
          ? `${score} out of ${total} — you know each other better than most`
          : `${score} out of ${total} — more to learn, more dates to come`;
    return { winner: null, summary }; // nobody loses at knowing each other (§6)
  },
};
