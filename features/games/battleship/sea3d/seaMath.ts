// sea3d · camera math — pure functions, no RN, no shared values.
//
// Every export is a marked worklet: the camera does its per-frame clamping
// inside Reanimated worklets, and those may only call Math, interpolate, or
// helpers marked 'worklet' (house rules). The same functions run untouched
// in plain node, which is where the tests live.
//
// Pan convention: px/py are the board's top-left corner in view coords,
// after scaling by zoom. At zoom 1 with the board exactly view-sized,
// px = py = 0 and every edge kisses its frame.

import { GRID } from '../rules';
import { ZOOM_CLOSE, ZOOM_FAR } from './seaMotion';

/** Center of cell (x, y) in board coords. Cell 0,0 sits half a cell in. */
export function cellCenter(x: number, y: number, boardSize: number): { cx: number; cy: number } {
  'worklet';
  const cell = boardSize / GRID;
  return { cx: x * cell + cell / 2, cy: y * cell + cell / 2 };
}

function clampAxis(pan: number, boardPx: number, viewPx: number): number {
  'worklet';
  // Board smaller than the view: center it, there is no room to pan.
  if (boardPx <= viewPx) return (viewPx - boardPx) / 2;
  // Board bigger: the pan range runs from "far edge pinned to the frame"
  // (viewPx - boardPx, negative) to "near edge pinned" (0), so no edge of
  // the board can ever slip inside the viewport and show the void beneath.
  return Math.min(0, Math.max(viewPx - boardPx, pan));
}

/** Keep the board's edges at or outside the viewport on both axes. */
export function clampPan(
  px: number,
  py: number,
  zoom: number,
  boardSize: number,
  viewW: number,
  viewH: number,
): { px: number; py: number } {
  'worklet';
  const boardPx = boardSize * zoom;
  return { px: clampAxis(px, boardPx, viewW), py: clampAxis(py, boardPx, viewH) };
}

/**
 * Keep the zoom where the table still reads as a table: never wider than
 * the whole sea, never closer than the close-up (plus a half step of
 * breathing room so a pinch can settle past the scene handoff).
 */
export function clampZoom(z: number): number {
  'worklet';
  if (!Number.isFinite(z)) return ZOOM_FAR;
  return Math.min(ZOOM_CLOSE + 0.5, Math.max(ZOOM_FAR, z));
}

/** The zoom the camera springs to when it dives into a square. */
export function zoomForCloseup(): number {
  'worklet';
  return ZOOM_CLOSE;
}

export function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

/** Fast start, soft landing. For fades and scrims, never for movement. */
export function easeOutCubic(t: number): number {
  'worklet';
  const u = 1 - t;
  return 1 - u * u * u;
}
