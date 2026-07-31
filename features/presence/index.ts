// features/presence/index.ts — public surface only.
export { usePublishPresence, usePartnerPresence, usePoke } from './hooks';
export { describePresence, isStale, lastSeenText } from './model';
export { PresenceChip } from './ui/PresenceChip';
