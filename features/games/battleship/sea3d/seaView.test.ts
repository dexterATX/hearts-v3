// features/games/battleship/sea3d/seaView.test.ts — pure mappers, plain node (§2.9).
import { describe, it, expect } from 'vitest';
import { battleshipRules, GRID, type BattleshipState, type ShotRecord } from '../rules';
import { targetSeaView, mySeaView, draftView } from './seaView';
import type { CellVisual } from './seaTypes';

const A = 'scotty';
const B = 'annsleigh';

const SEED = 'sea-seed';

function stateWith(shots: ShotRecord[], extra: Partial<BattleshipState> = {}): BattleshipState {
  return { ...battleshipRules.init(SEED), phase: 'firing', shots, ...extra };
}

/** Every cell of the view satisfies `pred`. */
function everyCell(view: CellVisual[][], pred: (v: CellVisual) => boolean): boolean {
  return view.every((row) => row.every(pred));
}

describe('targetSeaView', () => {
  it('is all unknown on an empty state', () => {
    const view = targetSeaView(battleshipRules.init(SEED), A);
    expect(view).toHaveLength(GRID);
    expect(view.every((row) => row.length === GRID)).toBe(true);
    expect(everyCell(view, (v) => v === 'unknown')).toBe(true);
  });

  it('lands a miss, a hit and a sunk on their cells', () => {
    const view = targetSeaView(
      stateWith([
        { x: 0, y: 0, by: A, result: 'miss' },
        { x: 3, y: 2, by: A, result: 'hit' },
        { x: 7, y: 6, by: A, result: 'sunk' },
        { x: 1, y: 1, by: B, result: 'hit' }, // incoming: not my business here
      ]),
      A,
    );
    expect(view[0]?.[0]).toBe('miss');
    expect(view[2]?.[3]).toBe('hit');
    expect(view[6]?.[7]).toBe('sunk');
    expect(view[1]?.[1]).toBe('unknown');
  });

  it('keeps my pending shot unknown until the verdict lands', () => {
    const view = targetSeaView(
      stateWith([], { pendingShot: { x: 4, y: 4, by: A } }),
      A,
    );
    expect(view[4]?.[4]).toBe('unknown');
  });

  it('ignores out-of-range shots without throwing', () => {
    const view = targetSeaView(
      stateWith([
        { x: -1, y: 0, by: A, result: 'hit' },
        { x: GRID, y: 3, by: A, result: 'miss' },
        { x: 2, y: GRID, by: A, result: 'sunk' },
      ]),
      A,
    );
    expect(everyCell(view, (v) => v === 'unknown')).toBe(true);
  });
});

describe('mySeaView', () => {
  const fleet = [
    { cells: [0, 1, 2, 3].map((x) => ({ x, y: 0 })) }, // 4
    { cells: [0, 1].map((x) => ({ x, y: 7 })) }, // 2
  ];

  it('is all unknown on an empty state with no fleet', () => {
    expect(everyCell(mySeaView(battleshipRules.init(SEED), null, A), (v) => v === 'unknown')).toBe(true);
  });

  it('shows my ship cells', () => {
    const view = mySeaView(battleshipRules.init(SEED), fleet, A);
    expect(view[0]?.[0]).toBe('ship');
    expect(view[0]?.[3]).toBe('ship');
    expect(view[7]?.[1]).toBe('ship');
    expect(view[4]?.[4]).toBe('unknown');
  });

  it('overlays incoming verdicts on top of my ships', () => {
    const view = mySeaView(
      stateWith([
        { x: 1, y: 0, by: B, result: 'hit' }, // on my 4-heart
        { x: 5, y: 5, by: B, result: 'miss' }, // open water
        { x: 0, y: 7, by: B, result: 'sunk' }, // on my 2-heart
        { x: 6, y: 6, by: A, result: 'hit' }, // MY shot: belongs on the other board
      ]),
      fleet,
      A,
    );
    expect(view[0]?.[1]).toBe('hit');
    expect(view[5]?.[5]).toBe('miss');
    expect(view[7]?.[0]).toBe('sunk');
    expect(view[7]?.[1]).toBe('ship'); // unhit cell of the same heart stays ship
    expect(view[6]?.[6]).toBe('unknown');
  });

  it('ignores out-of-range placements and shots', () => {
    const view = mySeaView(
      stateWith([{ x: 99, y: 0, by: B, result: 'hit' }]),
      [{ cells: [{ x: 0, y: -2 }] }],
      A,
    );
    expect(everyCell(view, (v) => v === 'unknown')).toBe(true);
  });
});

describe('draftView', () => {
  it('is all unknown with nothing placed', () => {
    expect(everyCell(draftView([], []), (v) => v === 'unknown')).toBe(true);
  });

  it('shows committed runs as ship and draft cells as draft', () => {
    const view = draftView(
      [{ cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
      [{ x: 4, y: 4 }, { x: 5, y: 4 }],
    );
    expect(view[0]?.[0]).toBe('ship');
    expect(view[0]?.[1]).toBe('ship');
    expect(view[4]?.[4]).toBe('draft');
    expect(view[4]?.[5]).toBe('draft');
  });

  it('lets the draft win over a placed ship on overlap', () => {
    const view = draftView(
      [{ cells: [{ x: 2, y: 2 }, { x: 3, y: 2 }] }],
      [{ x: 3, y: 2 }],
    );
    expect(view[2]?.[2]).toBe('ship');
    expect(view[2]?.[3]).toBe('draft');
  });

  it('ignores out-of-range draft cells', () => {
    const view = draftView([], [{ x: -1, y: 0 }, { x: 0, y: GRID }]);
    expect(everyCell(view, (v) => v === 'unknown')).toBe(true);
  });
});
