// features/games/battleship/sea3d/markers/MarkerHit.tsx — far-view glyph for
// a found heart: the little blue heart itself resting in the warm spot its
// find left in the water. Quality pass: the flat fill is now a blue→blueDeep
// body lit by the arcade's one top-left key light (KEY_LIGHT, imported from
// the shared games materials — battleship is the same feature, §2.1), the
// specular crescent rides the upper-left lobe as before, a soft contact
// shadow grounds the heart down-right (away from the light), and the glow is
// doubled: a wide faint halo with a tighter hot core inside it.
// Static by contract (LOD budget — far-view markers never loop), so there is
// nothing to cancel and reduced motion needs no branch.
import { useState } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { colors } from '../../../../../theme/theme';
import { KEY_LIGHT } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';

// a real heart: two arcs meeting at the cleft, bezier-pulled lobes (12×11).
// Same geometry the arcade sea floats — inlined here, slices never import
// each other (§2.1).
const HEART_PATH =
  'M6 11 C2.5 7.5 0 5.6 0 3.2 C0 1.2 1.6 0 3.2 0 C4.4 0 5.4 0.7 6 1.8 C6.6 0.7 7.6 0 8.8 0 C10.4 0 12 1.2 12 3.2 C12 5.6 9.5 7.5 6 11 Z';
// the specular crescent on the upper-left lobe — the key light's signature
const SPEC_PATH = 'M2.1 3.7 C2.3 2.5 3.2 1.6 4.3 1.5';

// the heart fill's gradient axis runs toward the shared key light: lit where
// it points, sinking to blueDeep at the shaded bottom-right
const KEY_REACH = 0.75;
const HEART_LIGHT = {
  x1: 0.5 + KEY_LIGHT.dx * KEY_REACH,
  y1: 0.5 + KEY_LIGHT.dy * KEY_REACH,
  x2: 0.5 - KEY_LIGHT.dx * KEY_REACH,
  y2: 0.5 - KEY_LIGHT.dy * KEY_REACH,
};

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function MarkerHit({ size }: SceneProps) {
  const [ids] = useState(() => {
    const n = uid++;
    return { halo: `mhit-halo${n}`, core: `mhit-core${n}`, heart: `mhit-heart${n}` };
  });
  const c = size / 2;
  const w = size * 0.6; // the heart fills 60% of the cell
  const h = (w * 11) / 12;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        {/* the double glow: a wide faint halo, then a tight hot core */}
        <RadialGradient id={ids.halo} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colors.blue} stopOpacity={0.26} />
          <Stop offset="0.6" stopColor={colors.blue} stopOpacity={0.09} />
          <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={ids.core} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colors.blue} stopOpacity={0.4} />
          <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* the glow the find left in the water: halo first, core on top */}
      <Circle cx={c} cy={c} r={size * 0.46} fill={`url(#${ids.halo})`} />
      <Circle cx={c} cy={c} r={size * 0.27} fill={`url(#${ids.core})`} />

      {/* the contact shadow: soft and down-right — away from the key light */}
      <Ellipse
        cx={c - KEY_LIGHT.dx * size * 0.09}
        cy={c + h / 2 + size * 0.04}
        rx={w * 0.36}
        ry={size * 0.05}
        fill={colors.bg}
        opacity={0.4}
      />

      {/* the heart itself — a nested Svg viewport scales the 12×11 path
          without any transform key */}
      <Svg x={(size - w) / 2} y={(size - h) / 2} width={w} height={h} viewBox="0 0 12 11">
        <Defs>
          <LinearGradient
            id={ids.heart}
            x1={HEART_LIGHT.x1}
            y1={HEART_LIGHT.y1}
            x2={HEART_LIGHT.x2}
            y2={HEART_LIGHT.y2}
          >
            <Stop offset="0" stopColor={colors.blue} />
            <Stop offset="1" stopColor={colors.blueDeep} />
          </LinearGradient>
        </Defs>
        <Path d={HEART_PATH} fill={`url(#${ids.heart})`} />
        <Path
          d={SPEC_PATH}
          fill="none"
          stroke={colors.ink}
          strokeWidth={0.9}
          strokeLinecap="round"
          opacity={0.7}
        />
      </Svg>
    </Svg>
  );
}
