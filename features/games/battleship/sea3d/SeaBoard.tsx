// features/games/battleship/sea3d/SeaBoard.tsx — the sea table itself.
//
// The 8×8 sea as a physical table seen at a lean (~34° at rest, leveling to
// nearly flat as the camera dives nose-down): WaterBase breathes at the
// bottom, GridLines etches the joinery, 64 BoardCells carry the markers,
// PlaneMaterial washes the plane in sheen and shadow, HorizonGlow fogs the
// far edge, CoordLabels rides the rim. The camera's
// five shared values drive two nested transforms — tilt outside
// (perspective + the ambient orbit + the dive leveling), pan/zoom inside,
// re-clamped EVERY frame (clampPan/clampZoom inside the worklet, per the
// useSeaCamera contract) so no spring or gesture can ever push an edge
// inside the frame and show the void.
//
// Gestures: the tap is BoardCell's own Pressable (untouched here); a
// one-finger drag pans the zoomed sea; a pinch zooms around its focal
// point, and a pinch that ends past CLOSEUP_FADE_AT dives into the square
// under the focal point — the other half of "pinch or tap a square". While
// a dive is open (camera.focus set) the board's gestures sleep: the
// close-up owns the stage and its own way home, so its invisible-at-rest
// overlay can never strand a pinched-out camera.
//
// Transforms live ONLY on Animated.View style arrays (the SeaArt production
// crash rule); this component owns no loops — WaterBase and HorizonGlow
// carry the far-view budget — so there is nothing here to cancel.
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { GRID } from '../rules';
import { CAMERA_FLY, CLOSEUP_FADE_AT, ZOOM_CLOSE, ZOOM_FAR } from './seaMotion';
import { clampPan, clampZoom } from './seaMath';
import type { CellVisual, CellXY } from './seaTypes';
import type { SeaCamera } from './useSeaCamera';
import { BoardCell } from './BoardCell';
import { WaterBase } from './layers/WaterBase';
import { GridLines } from './layers/GridLines';
import { HorizonGlow } from './layers/HorizonGlow';
import { CoordLabels } from './layers/CoordLabels';

// the resting lean of the table, and how level the camera goes on a dive —
// a whisper of tilt stays so the water still reads as a surface, not a wall
const TILT_FAR_DEG = 34;
const TILT_NEAR_DEG = 8;
const PERSPECTIVE = 900; // the arcade's camera (the ArcadeCard grammar)
// room around the sea for the floating coordinate labels + a breathing margin
const MARGIN_TOP = 26;
const MARGIN_LEFT = 26;
const MARGIN = 10;
// a pan becomes a pan (and stops being a tap) past this drift
const PAN_SLOP = 8;
// below this pinch-out the sea springs home instead of hovering half-zoomed
const HOME_SNAP = ZOOM_FAR + 0.06;

export function SeaBoard({
  cells,
  camera,
  interactive,
  onCellTap,
}: {
  cells: CellVisual[][];
  camera: SeaCamera;
  interactive: boolean;
  onCellTap: (c: CellXY) => void;
}): React.JSX.Element {
  // the square the sea fits in, measured per layout. Board units → px
  // conversion lives here alone; the camera speaks only in cells.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  };
  const boardPx = Math.max(
    0,
    Math.floor(Math.min(box.w - MARGIN_LEFT - MARGIN, box.h - MARGIN_TOP - MARGIN)),
  );
  const k = boardPx / GRID; // px per cell
  const cell = boardPx / GRID;

  // gesture bookkeeping on the UI thread: the pose at gesture start, the
  // last pinch focal (onEnd events are not guaranteed to carry one)
  const startZoom = useSharedValue(ZOOM_FAR);
  const startPx = useSharedValue(0);
  const startPy = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  // gestures sleep while a dive is open — the close-up owns the way home
  const awake = interactive && !camera.focus && boardPx > 0;

  // Settle after a gesture: snap home near ZOOM_FAR, otherwise spring the
  // pan back inside the sea's edges. Shared by pan and the non-diving pinch.
  const settle = () => {
    'worklet';
    const z = clampZoom(camera.zoom.value);
    if (z <= HOME_SNAP) {
      camera.zoom.value = withSpring(ZOOM_FAR, CAMERA_FLY);
      camera.px.value = withSpring(0, CAMERA_FLY);
      camera.py.value = withSpring(0, CAMERA_FLY);
      return;
    }
    const cl = clampPan(camera.px.value, camera.py.value, z, GRID, GRID, GRID);
    camera.zoom.value = withSpring(z, CAMERA_FLY);
    camera.px.value = withSpring(cl.px, CAMERA_FLY);
    camera.py.value = withSpring(cl.py, CAMERA_FLY);
  };

  // a drag pans the zoomed sea; at ZOOM_FAR clampPan parks every axis at 0,
  // so the same code idles when there is nowhere to go
  const pan = Gesture.Pan()
    .enabled(awake)
    .activeOffsetX([-PAN_SLOP, PAN_SLOP])
    .activeOffsetY([-PAN_SLOP, PAN_SLOP])
    .onStart(() => {
      startPx.value = camera.px.value;
      startPy.value = camera.py.value;
    })
    .onUpdate((e) => {
      const next = clampPan(
        startPx.value + e.translationX / k,
        startPy.value + e.translationY / k,
        clampZoom(camera.zoom.value),
        GRID,
        GRID,
        GRID,
      );
      camera.px.value = next.px;
      camera.py.value = next.py;
    })
    .onEnd(() => {
      settle();
    });

  // a pinch zooms around its focal point; ending past the fade threshold is
  // a dive into the square under the focal — flyTo owns the rest (JS side)
  const pinch = Gesture.Pinch()
    .enabled(awake)
    .onStart(() => {
      startZoom.value = clampZoom(camera.zoom.value);
      startPx.value = camera.px.value;
      startPy.value = camera.py.value;
    })
    .onUpdate((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
      const z = clampZoom(startZoom.value * e.scale);
      // keep the board point under the focal fixed: b = (f − P) / z0, P1 = f − b·z1
      const bx = (e.focalX - startPx.value * k) / startZoom.value;
      const by = (e.focalY - startPy.value * k) / startZoom.value;
      const next = clampPan(
        (e.focalX - bx * z) / k,
        (e.focalY - by * z) / k,
        z,
        GRID,
        GRID,
        GRID,
      );
      camera.zoom.value = z;
      camera.px.value = next.px;
      camera.py.value = next.py;
    })
    .onEnd(() => {
      if (clampZoom(camera.zoom.value) >= CLOSEUP_FADE_AT) {
        const cx = Math.min(GRID - 1, Math.max(0, Math.floor(focalX.value / k)));
        const cy = Math.min(GRID - 1, Math.max(0, Math.floor(focalY.value / k)));
        scheduleOnRN(camera.flyTo, { x: cx, y: cy });
        return;
      }
      settle();
    });

  // the table: perspective, the ambient orbit, and the dive leveling. The
  // orbit's ±1.2° rides on top of the zoom-driven base tilt.
  const tiltStyle = useAnimatedStyle(() => {
    const z = clampZoom(camera.zoom.value);
    const base = interpolate(
      z,
      [ZOOM_FAR, ZOOM_CLOSE],
      [TILT_FAR_DEG, TILT_NEAR_DEG],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { perspective: PERSPECTIVE },
        { rotateX: `${base + camera.tiltX.value}deg` },
        { rotateY: `${camera.tiltY.value}deg` },
      ],
    };
  });

  // the flight: translate so the board's top-left lands at (px, py) after
  // scaling — RN scales about the view's center, so the translate carries
  // the c·(z−1) correction that keeps the pan convention exact
  const camStyle = useAnimatedStyle(() => {
    const z = clampZoom(camera.zoom.value);
    const cl = clampPan(camera.px.value, camera.py.value, z, GRID, GRID, GRID);
    const c = boardPx / 2;
    return {
      transform: [
        { translateX: cl.px * k + c * (z - 1) },
        { translateY: cl.py * k + c * (z - 1) },
        { scale: z },
      ],
    };
  });

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {boardPx > 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
            <View style={{ width: boardPx, height: boardPx }}>
              <Animated.View style={[{ width: boardPx, height: boardPx }, tiltStyle]}>
                <Animated.View style={[{ width: boardPx, height: boardPx }, camStyle]}>
                  {/* the water, the joinery, then the cells; fog and labels
                      float on top (both are touch-transparent) */}
                  <View style={{ position: 'absolute', top: 0, left: 0 }}>
                    <WaterBase size={boardPx} />
                  </View>
                  <View style={{ position: 'absolute', top: 0, left: 0 }}>
                    <GridLines size={boardPx} />
                  </View>

                  <View style={{ position: 'absolute', top: 0, left: 0 }}>
                    {Array.from({ length: GRID }).map((_, y) => (
                      <View key={`row-${y}`} style={{ flexDirection: 'row' }}>
                        {Array.from({ length: GRID }).map((__, x) => (
                          <BoardCell
                            key={`${x}-${y}`}
                            x={x}
                            y={y}
                            visual={cells[y]?.[x] ?? 'unknown'}
                            size={cell}
                            interactive={interactive}
                            onTap={onCellTap}
                          />
                        ))}
                      </View>
                    ))}
                  </View>

                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', top: 0, left: 0 }}
                  >
                    <HorizonGlow size={boardPx} />
                  </View>
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', top: 0, left: 0 }}
                  >
                    <CoordLabels size={boardPx} />
                  </View>
                </Animated.View>
              </Animated.View>
            </View>
          </GestureDetector>
        </View>
      ) : null}
    </View>
  );
}
