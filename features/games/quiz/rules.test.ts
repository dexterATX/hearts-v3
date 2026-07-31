// features/games/quiz/rules.test.ts — knowing each other, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { quizRules, currentQuestion, answererFor, type QuizQuestion } from './rules';
import { fold } from '../engine/fold';

const A = 'scotty';
const B = 'annsleigh';

const QUESTIONS: QuizQuestion[] = [
  { id: 'q1', authorId: A, prompt: 'my favorite flower?', options: ['rose', 'lily', 'daisy', 'tulip'], answerIndex: 1 },
  { id: 'q2', authorId: B, prompt: 'her comfort food?', options: ['pasta', 'soup', 'tacos', 'cake'], answerIndex: 2 },
];

const begin = { k: 'begin' as const, questions: QUESTIONS, players: [A, B] as [string, string] };

describe('quiz rules', () => {
  it('begin deals the questions and starts play', () => {
    const s = fold(quizRules, 'seed', [{ seq: 1, authorId: A, payload: begin }]);
    expect(s.phase).toBe('playing');
    expect(currentQuestion(s)?.id).toBe('q1');
  });

  it('the author never answers their own question', () => {
    expect(answererFor(QUESTIONS[0], [A, B])).toBe(B);
    const s = fold(quizRules, 'seed', [
      { seq: 1, authorId: A, payload: begin },
      { seq: 2, authorId: A, payload: { k: 'answer' as const, questionId: 'q1', choiceIndex: 1 } },
    ]);
    expect(s.answers).toHaveLength(0);
  });

  it('correct answers grow OUR shared score', () => {
    const s = fold(quizRules, 'seed', [
      { seq: 1, authorId: A, payload: begin },
      { seq: 2, authorId: B, payload: { k: 'answer' as const, questionId: 'q1', choiceIndex: 1 } },
      { seq: 3, authorId: A, payload: { k: 'answer' as const, questionId: 'q2', choiceIndex: 0 } },
    ]);
    expect(s.score).toBe(1);
    expect(s.phase).toBe('done');
  });

  it('out-of-order answers are ignored', () => {
    const s = fold(quizRules, 'seed', [
      { seq: 1, authorId: A, payload: begin },
      { seq: 2, authorId: B, payload: { k: 'answer' as const, questionId: 'q2', choiceIndex: 2 } },
    ]);
    expect(s.answers).toHaveLength(0);
  });

  it('a perfect game is celebrated, a weak one is still sweet (§6)', () => {
    const perfect = fold(quizRules, 'seed', [
      { seq: 1, authorId: A, payload: begin },
      { seq: 2, authorId: B, payload: { k: 'answer' as const, questionId: 'q1', choiceIndex: 1 } },
      { seq: 3, authorId: A, payload: { k: 'answer' as const, questionId: 'q2', choiceIndex: 2 } },
    ]);
    expect(quizRules.outcome(perfect)?.summary).toContain('perfect');
    expect(quizRules.outcome(perfect)?.winner).toBeNull();
  });
});
