// features/games/battleship/sea3d/seaView.ts — pure mappers from game state to
// the 8×8 CellVisual grid the sea table renders. No RN, no Reanimated: the same
// shapes rules.ts speaks, flattened into what each board may show.
//
//   targetSeaView — the enemy sea: only my resolved shots are visible
//   mySeaView     — my own sea: my hearts, with incoming shots overlaid
//   draftView     — placement: committed runs as 'ship', the draft on top
import { GRID, type BattleshipState, type Placement } from '../rules';
import type { UserId } from '../../engine/types';
import type { CellVisual, CellXY } from './seaTypes';

/** Fresh 8×8 of 'unknown' — never a shared row reference. */
function emptySea(): CellVisual[][] {
  return Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, (): CellVisual => 'unknown'),
  );
}

/** Bounds-checked write; out-of-sea cells are simply not part of the view. */
function setCell(view: CellVisual[][], x: number, y: number, v: CellVisual): void {
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
  const row = view[y];
  if (row) row[x] = v;
}

/**
 * The enemy sea as I may see it. Only MY resolved shots paint cells; a shot
 * still awaiting a verdict (pendingShot) is not in `shots` yet, so it stays
 * 'unknown' — the radar keeps sweeping until the owner answers.
 */
export function targetSeaView(state: BattleshipState, myId: UserId): CellVisual[][] {
  const view = emptySea();
  for (const s of state.shots) {
    if (s.by !== myId || s.result === null) continue;
    setCell(view, s.x, s.y, s.result);
  }
  return view;
}

/**
 * My own sea: every heart cell shows 'ship', then shots fired AGAINST me
 * overlay their verdict (miss / hit / sunk) on top. A pending incoming shot
 * has no verdict yet, so the heart beneath keeps showing.
 */
export function mySeaView(
  state: BattleshipState,
  myFleet: Placement[] | null,
  myId: UserId,
): CellVisual[][] {
  const view = emptySea();
  for (const p of myFleet ?? []) {
    for (const c of p.cells) setCell(view, c.x, c.y, 'ship');
  }
  for (const s of state.shots) {
    if (s.by === myId || s.result === null) continue;
    setCell(view, s.x, s.y, s.result);
  }
  return view;
}

/**
 * Placement scratch view: runs already placed show 'ship', the in-progress
 * draft shows 'draft' — and the draft wins when it overlaps a placed heart,
 * so the cell your finger is on always reads as draft.
 */
export function draftView(fleet: Placement[], draft: CellXY[]): CellVisual[][] {
  const view = emptySea();
  for (const p of fleet) {
    for (const c of p.cells) setCell(view, c.x, c.y, 'ship');
  }
  for (const c of draft) setCell(view, c.x, c.y, 'draft');
  return view;
}
