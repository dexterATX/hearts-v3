// features/mood/index.ts — public surface only (§2.2).
export { useMoods, useMoodSync, useSendMood } from './hooks';
export { MOODS, moodMeta, latestPerAuthor, groupByDay, type MoodKey } from './model';
export { MoodChips } from './ui/MoodChips';
export { MoodCard } from './ui/MoodCard';
export { MoodHistory } from './ui/MoodHistory';
