// features/games/battleship/rules.ts — "find my hearts" (§7.8).
// Fleets NEVER leave the device (§2.6): only a hash is committed. A shot is a
// move; the sea's OWNER resolves it locally and appends a verdict carrying
// only miss / hit / sunk. Secrecy falls out of the architecture.
import type { GameRules, UserId, Outcome } from '../engine/types';

export const GRID = 8;
export const FLEET = [4, 3, 3, 2] as const; // heart lengths
export const TOTAL_HEARTS = FLEET.reduce((a, b) => a + b, 0); // 12

export type Cell = { x: number; y: number };
export type Placement = { cells: Cell[] }; // one heart = a run of cells
export type FleetLayout = Placement[];

export type Verdict = 'miss' | 'hit' | 'sunk';

export type BattleshipMove =
  | { k: 'commit'; fleetHash: number }
  | { k: 'shot'; x: number; y: number }
  | { k: 'verdict'; x: number; y: number; result: Verdict };

export type ShotRecord = Cell & { by: UserId; result: Verdict | null };

export type BattleshipState = {
  phase: 'placing' | 'firing' | 'done';
  committed: UserId[];
  shots: ShotRecord[]; // every shot ever fired, in order
  pendingShot: (Cell & { by: UserId }) | null; // awaiting the owner's verdict
  turn: UserId | null; // who may fire next
  firstShooter: UserId | null;
};

/** Same djb2 as hangman — layout secrecy with a pinky promise. */
export function hashFleet(seed: string, layout: FleetLayout): number {
  const flat = layout
    .map((p) => p.cells.map((c) => `${c.x},${c.y}`).join('|'))
    .sort()
    .join('::');
  const s = `${seed}:${flat}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

/** Local-only validation when placing hearts. */
export function validateLayout(layout: FleetLayout): { ok: true } | { ok: false; reason: string } {
  if (layout.length !== FLEET.length) return { ok: false, reason: `hide exactly ${FLEET.length} hearts` };
  const used = new Set<string>();
  const lengths = [...FLEET].sort((a, b) => a - b);
  const got = layout.map((p) => p.cells.length).sort((a, b) => a - b);
  if (lengths.join(',') !== got.join(',')) return { ok: false, reason: 'heart sizes must be 4, 3, 3 and 2' };
  for (const p of layout) {
    const xs = new Set(p.cells.map((c) => c.x));
    const ys = new Set(p.cells.map((c) => c.y));
    if (xs.size > 1 && ys.size > 1) return { ok: false, reason: 'hearts lie straight, not diagonal' };
    const sorted = [...p.cells].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      const d = Math.abs(sorted[i].x - sorted[i - 1].x) + Math.abs(sorted[i].y - sorted[i - 1].y);
      if (d !== 1) return { ok: false, reason: 'each heart is one unbroken line' };
    }
    for (const c of p.cells) {
      if (c.x < 0 || c.y < 0 || c.x >= GRID || c.y >= GRID) return { ok: false, reason: 'stay inside the sea' };
      const key = `${c.x},${c.y}`;
      if (used.has(key)) return { ok: false, reason: 'hearts never overlap' };
      used.add(key);
    }
  }
  return { ok: true };
}

/** Owner-side resolution — runs ONLY on the sea owner's device. */
export function resolveShot(layout: FleetLayout, x: number, y: number): Verdict {
  for (const p of layout) {
    if (p.cells.some((c) => c.x === x && c.y === y)) return 'hit';
  }
  return 'miss';
}

/** Owner-side sunk check: every cell of the placement has been hit. */
export function isSunk(placement: Placement, hits: readonly Cell[]): boolean {
  return placement.cells.every((c) => hits.some((h) => h.x === c.x && h.y === c.y));
}

export function hitsAgainst(state: BattleshipState, owner: UserId): number {
  // hits ON `owner`'s sea = shots BY the other player that hit
  return state.shots.filter((s) => s.by !== owner && s.result !== 'miss' && s.result !== null).length;
}

export const battleshipRules: GameRules<BattleshipState, BattleshipMove> = {
  init: () => ({
    phase: 'placing',
    committed: [],
    shots: [],
    pendingShot: null,
    turn: null,
    firstShooter: null,
  }),

  apply(state, move, by) {
    switch (move.k) {
      case 'commit': {
        if (state.phase !== 'placing' || state.committed.includes(by)) return state;
        const committed = [...state.committed, by];
        if (committed.length < 2) return { ...state, committed };
        // both fleets hidden → the first to commit fires first (deterministic)
        return { ...state, committed, phase: 'firing', turn: committed[0], firstShooter: committed[0] };
      }
      case 'shot': {
        if (state.phase !== 'firing' || state.pendingShot) return state;
        if (state.turn !== by) return state;
        const dup = state.shots.some((s) => s.by === by && s.x === move.x && s.y === move.y);
        if (dup) return state; // already shot there
        return { ...state, pendingShot: { x: move.x, y: move.y, by }, turn: null };
      }
      case 'verdict': {
        if (state.phase !== 'firing' || !state.pendingShot) return state;
        const shot = state.pendingShot;
        if (by === shot.by) return state; // the OWNER answers, never the shooter
        if (shot.x !== move.x || shot.y !== move.y) return state;
        const shots = [...state.shots, { x: move.x, y: move.y, by: shot.by, result: move.result }];
        const next: BattleshipState = { ...state, shots, pendingShot: null };
        // game over when the shooter's hits total the defender's whole fleet
        const hitsOnOwner = shots.filter((s) => s.by === shot.by && s.result !== 'miss').length;
        if (hitsOnOwner >= TOTAL_HEARTS) return { ...next, phase: 'done', turn: null };
        // classic rule: a hit earns another shot; a miss hands the sea over
        return { ...next, turn: move.result === 'miss' ? by : shot.by };
      }
    }
  },

  turnOf(state) {
    if (state.phase !== 'firing') return null;
    if (state.pendingShot) return null; // the OWNER owes a verdict — UI gates
    return state.turn;
  },

  outcome(state): Outcome | null {
    if (state.phase !== 'done') return null;
    const last = state.shots[state.shots.length - 1];
    const finder = last?.by ?? null;
    return {
      winner: finder,
      summary: finder ? 'you found every last one of my hearts — they were all yours anyway' : 'all hearts found',
    };
  },
};
