// features/canvas/index.ts — public surface only.
export { useCanvas, useReplay } from './hooks';
export { simplify, orderForReplay, nextStrokeSeq, BRUSHES, PALETTE, type Stroke, type Point } from './model';
export { CanvasBoard } from './ui/CanvasBoard';
