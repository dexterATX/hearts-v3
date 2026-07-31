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
  if (points.length > 0 && out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
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

export const PALETTE = ['#FF6B8A', '#F5C77E', '#F6EDF2', '#9A8A96', '#E8557E', '#7EC4F5'] as const;
