// features/games/index.ts — the ONE games feature: engine + four games.
// Public surface only; slices outside never reach inside.
export { useGame } from './engine/runtime';
export { listActiveSessions } from './engine/session';
export { SeqBuffer } from './engine/buffer';
export { fold, nextSeq, canMove } from './engine/fold';
export type { GameRules, MoveEnvelope, Outcome, UserId } from './engine/types';

export { hangmanRules, hashWord, PETALS } from './hangman/rules';
export { useHangman, useStartHangman } from './hangman/hooks';
export { HangmanScreen } from './hangman/ui/HangmanScreen';

export { battleshipRules, validateLayout, GRID, FLEET } from './battleship/rules';
export { useBattleship, useStartBattleship } from './battleship/hooks';
export { BattleshipScreen } from './battleship/ui/BattleshipScreen';

export { quizRules } from './quiz/rules';
export { useQuiz, useQuizQuestions, useAddQuestion, useStartQuiz } from './quiz/hooks';
export { QuizScreen } from './quiz/ui/QuizScreen';

export { cardsRules, deckFor } from './cards/rules';
export { useCards, useStartCards } from './cards/hooks';
export { CardsScreen } from './cards/ui/CardsScreen';
