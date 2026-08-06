// features/games/battleship/sea3d/markers/MarkerShip.tsx — the far-view
// marker for one of MY hearts still afloat: a silver-blue heart resting on
// calm water, lit by the arcade's one top-left key light.
//
// LOD budget: this marker is STATIC — no shared values, no loops, nothing to
// cancel. 64 cells can be visible at once, so the whole thing is one svg
// paint. Reduced motion needs no special case: it is already a still frame.
//
// The heart path is the arcade's bezier heart (SeaArt's 12×11) scaled 1.35
// and centred in a 24 box. The specular crescent rides the upper-left lobe,
// toward the key light; a soft contact shadow grounds the heart on the water
// (falling away from the light); two thin ink arcs mark the waterline at its
// base. The light direction is KEY_LIGHT from the arcade materials — same
// feature (features/games), so it is imported, not re-derived (§2.1).
import { useState } from 'react';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';
import { KEY_LIGHT } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';

// the shared key light lives top-left; the fill gradient runs toward it
const HEART_LIGHT = {
  x1: 0.5 + KEY_LIGHT.dx * 0.75,
  y1: 0.5 + KEY_LIGHT.dy * 0.75,
  x2: 0.5 - KEY_LIGHT.dx * 0.75,
  y2: 0.5 - KEY_LIGHT.dy * 0.75,
};

// SeaArt's 12×11 bezier heart, ×1.35, centred in 24 (offset 3.9 / 4.575)
const HEART_PATH =
  'M12 19.43 C7.28 14.7 3.9 12.14 3.9 8.9 C3.9 6.2 6.06 4.58 8.22 4.58 ' +
  'C9.84 4.58 11.19 5.52 12 7.01 C12.81 5.52 14.16 4.58 15.78 4.58 ' +
  'C17.94 4.58 20.1 6.2 20.1 8.9 C20.1 12.14 16.73 14.7 12 19.43 Z';
// the key light's signature: a specular crescent on the upper-left lobe
const SPEC_PATH = 'M6.74 9.57 C7.01 7.95 8.22 6.74 9.71 6.6';
// the waterline: two thin ink arcs hugging the heart's base — the front half
// of ripple rings, bulging toward the viewer (sweep 0 = below the chord)
const WATERLINE_NEAR = 'M6.2 19.7 A6.2 1.6 0 0 0 17.8 19.7';
const WATERLINE_FAR = 'M4.4 20.5 A8 2.1 0 0 0 19.6 20.5';

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** One of my hearts afloat, seen from the far camera: silver-blue, grounded
 *  by a contact shadow, the sea holding it at the waterline. Pure static
 *  svg — the cheapest marker on the board. */
export function MarkerShip({ size }: SceneProps) {
  const [ids] = useState(() => {
    const n = uid++;
    return { fill: `mship${n}`, glow: `mshipglow${n}`, shadow: `mshipsh${n}` };
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient
          id={ids.fill}
          x1={HEART_LIGHT.x1}
          y1={HEART_LIGHT.y1}
          x2={HEART_LIGHT.x2}
          y2={HEART_LIGHT.y2}
        >
          <Stop offset="0" stopColor={colors.silver} />
          <Stop offset="0.55" stopColor={colors.blue} />
          <Stop offset="1" stopColor={colors.blueDeep} />
        </LinearGradient>
        <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colors.blue} stopOpacity={0.3} />
          <Stop offset="0.6" stopColor={colors.blue} stopOpacity={0.1} />
          <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
        </RadialGradient>
        {/* the contact shadow's falloff: dense under the heart, gone by the rim */}
        <RadialGradient id={ids.shadow} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.45} />
          <Stop offset="0.7" stopColor="#000000" stopOpacity={0.16} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* the calm pool of light the heart rests in */}
      <Ellipse cx={12} cy={12.5} rx={10.5} ry={9.5} fill={`url(#${ids.glow})`} />

      {/* contact shadow: the heart sits ON the water, not over it — nudged
          down-right, away from the top-left key light */}
      <Ellipse cx={12.6} cy={20} rx={5.6} ry={1.5} fill={`url(#${ids.shadow})`} />

      {/* the heart itself: silver where the key light catches it, sinking
          through blue to blueDeep at the shaded bottom-right */}
      <Path d={HEART_PATH} fill={`url(#${ids.fill})`} />
      <Path
        d={SPEC_PATH}
        fill="none"
        stroke={colors.ink}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.55}
      />

      {/* the waterline: two thin ink arcs at the base, painted over the
          heart's bottom tip so it sits IN the sea, not on it */}
      <Path
        d={WATERLINE_NEAR}
        fill="none"
        stroke={colors.ink}
        strokeWidth={0.5}
        strokeLinecap="round"
        opacity={0.4}
      />
      <Path
        d={WATERLINE_FAR}
        fill="none"
        stroke={colors.ink}
        strokeWidth={0.4}
        strokeLinecap="round"
        opacity={0.2}
      />
    </Svg>
  );
}
