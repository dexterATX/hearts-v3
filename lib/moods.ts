// lib/moods.ts — the couple's shared mood vocabulary. Lives in lib because
// mood chips, letters, journal and home all render it (§2.1: features never
// import each other — shared vocabulary goes DOWN a layer, not across).
export const MOODS = [
  { key: 'loved', emoji: '🥰', label: 'loved' },
  { key: 'missing', emoji: '🥺', label: 'missing you' },
  { key: 'happy', emoji: '😊', label: 'happy' },
  { key: 'playful', emoji: '😏', label: 'playful' },
  { key: 'sleepy', emoji: '😴', label: 'sleepy' },
  { key: 'grumpy', emoji: '😾', label: 'grumpy' },
  { key: 'stressed', emoji: '😣', label: 'stressed' },
] as const;

export type MoodKey = (typeof MOODS)[number]['key'];

export function moodMeta(key: string): { emoji: string; label: string } {
  const found = MOODS.find((m) => m.key === key);
  return found ? { emoji: found.emoji, label: found.label } : { emoji: '💭', label: key };
}
