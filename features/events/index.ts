// features/events/index.ts — public surface only.
export { useEvents, useEventSync, useEventActions, useEventReminders, useUpcoming } from './hooks';
export { nextOccurrence, daysUntil, countdownLabel, upcoming, shouldRemind } from './model';
export { EventsView } from './ui/EventsView';
