// features/home/index.ts — public surface only.
export { useCouple, useFeed, useBadges, useHomeSync } from './hooks';
export { daysTogether, daysLabel, buildFeed, badgeCounts, isLetterOpenable, feedLine } from './model';
export { DaysTogether } from './ui/DaysTogether';
export { FeedList } from './ui/FeedList';
export { OutboxBanner } from './ui/OutboxBanner';
