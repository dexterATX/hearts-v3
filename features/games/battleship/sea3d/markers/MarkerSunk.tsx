// sea3d/markers/MarkerSunk.tsx — far-view marker for a sunk cell: the heart,
// gone under. The arcade's own bezier heart (borrowed from SeaArt) fills
// blueDeep, tipped 25° as it settles, its centre pushed just below the cell's
// middle. A thin foam line floats above it — the surface closing over.
// Quality pass: a soft sediment shadow now pools under the resting heart,
// nudged down-right away from the top-left key light, and two static
// micro-bubbles hang in the column between the heart and the foam line —
// the last air it took down.
// Fully static: the LOD budget spends its loops on the close-up scene, so
// nothing here moves, ever. The tilt rides a plain View transform; svg
// transforms stay out of animated props (the SeaArt production-crash rule).

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';
import type { SceneProps } from '../seaTypes';

// the arcade's one heart: two arcs meeting at the cleft, bezier-pulled lobes,
// 12 wide × 11 tall (same path as features/games/ui/art/SeaArt.tsx)
const HEART_PATH =
  'M6 11 C2.5 7.5 0 5.6 0 3.2 C0 1.2 1.6 0 3.2 0 C4.4 0 5.4 0.7 6 1.8 C6.6 0.7 7.6 0 8.8 0 C10.4 0 12 1.2 12 3.2 C12 5.6 9.5 7.5 6 11 Z';

// geometry inside a 24×24 box, scaled by k — the heart's centre sits 1.6
// units low; even swung 25° its highest lobe reaches ≈ 7.5 up, so it always
// clears the foam line at 5.2 and reads as slipping beneath it
const HEART_CY = 13.6;
const FOAM_Y = 5.2;
const TILT_DEG = 25;

export function MarkerSunk({ size }: SceneProps) {
  const k = size / 24;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {/* the waterline, the sediment shadow, the bubbles — one base svg.
          The shadow sits right of the heart's centre: the key light lives
          top-left, so shade falls down-right */}
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* where the heart came to rest: a wide soft pool, a darker core */}
        <Ellipse cx={13} cy={19.7} rx={5.4} ry={1.4} fill={colors.bg} opacity={0.28} />
        <Ellipse cx={12.8} cy={19.4} rx={3.6} ry={0.95} fill={colors.bg} opacity={0.42} />

        {/* two micro-bubbles off the cleft, frozen mid-rise — static by
            budget, so they stand for the rise, not perform it */}
        <Circle cx={10.9} cy={7.4} r={0.45} fill={colors.silver} opacity={0.5} />
        <Circle cx={10.1} cy={6.2} r={0.3} fill={colors.silver} opacity={0.35} />

        {/* one thin foam stroke, kept above the sinking heart */}
        <Line
          x1={5}
          y1={FOAM_Y}
          x2={19}
          y2={FOAM_Y}
          stroke={colors.silver}
          strokeWidth={0.9}
          strokeLinecap="round"
          opacity={0.7}
        />
      </Svg>
      {/* the heart itself, tipped as it goes down — a static View rotation,
          never an svg transform string */}
      <View
        style={{
          position: 'absolute',
          left: (12 - 6) * k,
          top: (HEART_CY - 5.5) * k,
          width: 12 * k,
          height: 11 * k,
          transform: [{ rotate: `${TILT_DEG}deg` }],
        }}
      >
        <Svg width={12 * k} height={11 * k} viewBox="0 0 12 11">
          <Path d={HEART_PATH} fill={colors.blueDeep} opacity={0.9} />
        </Svg>
      </View>
    </View>
  );
}
