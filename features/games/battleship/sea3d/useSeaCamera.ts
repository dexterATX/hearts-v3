// features/games/battleship/sea3d/useSeaCamera.ts — the one camera the sea
// table shares. Owns the five shared values SeaBoard reads every frame plus
// `focus`, the zoomed-in cell mirrored as React state so HUD and SeaCloseUp
// can render against it.
//
// UNITS — SeaBoard must honour this, it is the whole contract:
// px/py are the board's top-left corner AFTER scaling by zoom, measured in
// BOARD UNITS (one cell = 1, the sea is GRID × GRID, and the view is exactly
// GRID wide at zoom 1 — seaMath's "board exactly view-sized, px = py = 0").
// Board units keep the camera size-independent: SeaBoard alone knows its
// pixel size and converts at render time (translatePx = px * boardPx / GRID),
// per-frame clamping with clampPan(px, py, zoom, GRID, GRID, GRID) inside its
// own worklet. flyTo below aims the cell's centre at the view centre
// (GRID / 2) and passes the target through clampPan at the close-up zoom, so
// edge cells rest pinned to the frame instead of showing the void, and the
// resting pose is always one the per-frame clamp would also allow.
//
// Motion: the dive and the flight home are CAMERA_FLY springs (movement is
// always a spring, §5); the tilt is a slow ambient ±1.2° orbit on a 7s yoyo
// so the sea breathes untouched. Reduced motion parks the orbit at 0 — no
// drift at all. Every value cancels on unmount.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GRID } from '../rules';
import { CAMERA_FLY, ZOOM_FAR } from './seaMotion';
import { cellCenter, clampPan, zoomForCloseup } from './seaMath';
import type { CellXY } from './seaTypes';

export type SeaCamera = {
  zoom: SharedValue<number>;
  px: SharedValue<number>;
  py: SharedValue<number>;
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  focus: CellXY | null;
  flyTo: (cell: CellXY) => void;
  flyHome: () => void;
};

// the ambient orbit: a ±1.2° lean, one way per 7s — a breath, not a sway
const TILT_DEG = 1.2;
const TILT_HALF_MS = 7000;

export function useSeaCamera(): SeaCamera {
  const reduced = useReducedMotion();

  // camera pose: the whole sea at rest, parked at home
  const zoom = useSharedValue(ZOOM_FAR);
  const px = useSharedValue(0);
  const py = useSharedValue(0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  // the cell under the magnifier, for JS-side UI (close-up, HUD ribbons)
  const [focus, setFocus] = useState<CellXY | null>(null);

  // The orbit. Both axes yoyo −1.2° ↔ +1.2° on inOut quad so the turn-around
  // is felt as a slow lean, never a reversal; tiltY lags a quarter period
  // (withDelay like SeaArt's hearts) so the pair traces a slow circle instead
  // of a diagonal line. Reduced motion: parked flat, nothing loops.
  useEffect(() => {
    if (reduced) {
      tiltX.value = 0;
      tiltY.value = 0;
      return;
    }
    tiltX.value = -TILT_DEG;
    tiltY.value = -TILT_DEG;
    const swing = { duration: TILT_HALF_MS, easing: Easing.inOut(Easing.quad) } as const;
    tiltX.value = withRepeat(withTiming(TILT_DEG, swing), -1, true);
    tiltY.value = withDelay(
      TILT_HALF_MS / 4,
      withRepeat(withTiming(TILT_DEG, swing), -1, true),
    );
    return () => {
      cancelAnimation(tiltX);
      cancelAnimation(tiltY);
    };
  }, [reduced, tiltX, tiltY]);

  // every animation dies with the board
  useEffect(
    () => () => {
      cancelAnimation(zoom);
      cancelAnimation(px);
      cancelAnimation(py);
      cancelAnimation(tiltX);
      cancelAnimation(tiltY);
    },
    [zoom, px, py, tiltX, tiltY],
  );

  // Dive into a square: zoom springs to the close-up while the pan centres
  // the cell. Board point b renders at view coord b * zoom + pan, so the
  // centring pan is GRID / 2 − centre * zoom; clampPan at the TARGET zoom
  // keeps corner cells inside the sea's edge invariant.
  const flyTo = useCallback(
    (cell: CellXY) => {
      setFocus(cell);
      const z = zoomForCloseup();
      const { cx, cy } = cellCenter(cell.x, cell.y, GRID);
      const target = clampPan(GRID / 2 - cx * z, GRID / 2 - cy * z, z, GRID, GRID, GRID);
      zoom.value = withSpring(z, CAMERA_FLY);
      px.value = withSpring(target.px, CAMERA_FLY);
      py.value = withSpring(target.py, CAMERA_FLY);
    },
    [zoom, px, py],
  );

  // Back to the whole sea: at ZOOM_FAR the only legal pan is 0,0.
  const flyHome = useCallback(() => {
    setFocus(null);
    zoom.value = withSpring(ZOOM_FAR, CAMERA_FLY);
    px.value = withSpring(0, CAMERA_FLY);
    py.value = withSpring(0, CAMERA_FLY);
  }, [zoom, px, py]);

  return useMemo(
    () => ({ zoom, px, py, tiltX, tiltY, focus, flyTo, flyHome }),
    [zoom, px, py, tiltX, tiltY, focus, flyTo, flyHome],
  );
}
