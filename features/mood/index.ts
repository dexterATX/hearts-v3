// features/mood/index.ts — public surface only (§2.2).
export { useMoods, useMoodSync, useSendMood } from './hooks';
export { MOODS, moodMeta, latestPerAuthor, type MoodKey } from './model';
export { MoodChips } from './ui/MoodChips';
export { MoodDeck } from './ui/MoodDeck';
export { MoodCard } from './ui/MoodCard';
