// features/voice/model.ts — pure voice-note logic. No RN imports.
import type { VoiceNoteRow } from '../../lib/db/database.types';

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Unheard badge (§7.12): notes from HER that I haven't heard yet. */
export function unheardFor(rows: readonly VoiceNoteRow[], myId: string): VoiceNoteRow[] {
  return rows.filter((r) => r.author_id !== myId && !r.heard_at);
}

/** Waveform bars from a duration when we don't have real PCM data:
 *  deterministic pseudo-wave so both phones draw the same shape. */
export function waveBars(seed: string, count = 24): number[] {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  const bars: number[] = [];
  let state = h >>> 0;
  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) >>> 0; // LCG — deterministic
    bars.push(0.25 + (state % 1000) / 1333); // 0.25 … 1.0
  }
  return bars;
}

export const SPEEDS = [1, 1.5, 2] as const;
export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

export function storagePathFor(coupleId: string, noteId: string): string {
  return `${coupleId}/${noteId}.m4a`;
}
