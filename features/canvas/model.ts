// features/canvas/model.ts — pure stroke logic. No RN imports.
export type Point = { x: number; y: number };

export type Stroke = {
  id: string;
  authorId: string;
  seq: number; // per-author monotonic
  points: Point[];
  color: string;
  width: number;
  at: string; // ISO — cross-author ordering for replay
};

/** Simplify a finger track: drop points closer than `minDist` to the last kept. */
export function simplify(points: readonly Point[], minDist = 3): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  const lastInput = points[points.length - 1];
  if (lastInput && out[out.length - 1] !== lastInput) {
    out.push(lastInput);
  }
  return out;
}

/** Merge persisted + live strokes into the replay order (both phones agree):
 *  created_at, then authorId as tie-break — deterministic. */
export function orderForReplay(strokes: readonly Stroke[]): Stroke[] {
  return [...strokes].sort((a, b) =>
    a.at === b.at ? a.authorId.localeCompare(b.authorId) : a.at.localeCompare(b.at),
  );
}

/** Next per-author seq — same engine rule as games (max+1). */
export function nextStrokeSeq(mine: readonly Stroke[]): number {
  return mine.reduce((max, s) => Math.max(max, s.seq), 0) + 1;
}

export const BRUSHES = [
  { name: 'pen', width: 4 },
  { name: 'marker', width: 10 },
  { name: 'highlighter', width: 18 },
] as const;

// The one full-bleed colour surface in the app, so it has to come from the
// same 218° anchor as everything else — six inks that read on blue-black
// glass: white, silver, the accent blue and its deep tone, plus a cool cyan
// and a warm counterpoint so a drawing is not monochrome.
export const PALETTE = ['#E8EEF9', '#C6CFDD', '#4D8DF7', '#2E6FE3', '#43D6A3', '#FF6B7D'] as const;

/** Screen readers announced six identical unnamed buttons without these. */
export const PALETTE_NAMES: Record<(typeof PALETTE)[number], string> = {
  '#E8EEF9': 'white',
  '#C6CFDD': 'silver',
  '#4D8DF7': 'blue',
  '#2E6FE3': 'deep blue',
  '#43D6A3': 'green',
  '#FF6B7D': 'red',
};
