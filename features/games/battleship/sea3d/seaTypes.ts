// features/games/battleship/sea3d/seaTypes.ts — pinned contract shared by every
// sea3d slice. Exact shapes only; the 3D sea table builds on these.
export type CellVisual = 'unknown' | 'miss' | 'hit' | 'sunk' | 'ship' | 'draft';
export type SceneProps = { size: number };
export type CellXY = { x: number; y: number };
export type BattlePhase = 'placement' | 'battle' | 'over';
