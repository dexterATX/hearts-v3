// features/games/battleship/sea3d/markers/MarkerUnknown.tsx — far-view glyph
// for water nobody has touched yet.
//
// Deliberately the quietest marker on the board, but no longer flat: the
// rounded `surface` cell now holds a soft radial pool of blue (the shared
// bluePool material pulled down to 60%, so it stays a whisper), a 1px
// specular crescent rides the top-left rim toward the arcade's one key
// light, and the centre water dot is doubled — the 2dp breath of blue plus
// a 1dp silver glint offset toward the light, a cheap two-layer parallax.
// Fully STATIC (LOD budget: far-view markers never loop; only MarkerDraft
// may), so there is no Reanimated here at all, nothing to cancel, and
// reduced motion needs no special case.
import { useState } from 'react';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';
import { KEY_LIGHT, STOP_SETS } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';

// the shared bluePool at a whisper — 60% keeps this the quietest cell
// (the `?? []` is only noUncheckedIndexedAccess being thorough; the set
// is pinned in materials.ts)
const POOL_STOPS = (STOP_SETS.bluePool ?? []).map((s) => ({ ...s, op: s.op * 0.6 }));

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function MarkerUnknown({ size }: SceneProps) {
  const [ids] = useState(() => ({ pool: `munkpool${uid++}` }));
  const r = size * 0.2;
  const c = size / 2;
  // the pool sits a touch toward the key light, like light through water
  const poolCx = 0.5 + KEY_LIGHT.dx * 0.15;
  const poolCy = 0.5 + KEY_LIGHT.dy * 0.15;
  // the crescent hugs the top-left rounded corner, inset off the hairline;
  // clamped so a tiny cell can never produce a negative-radius arc
  const corner = 0.5 + r;
  const cr = Math.max(1.5, r - 1.2);
  // the glint rides toward the key light — the far layer of the parallax
  const glintX = c + KEY_LIGHT.dx * 2.4;
  const glintY = c + KEY_LIGHT.dy * 2.4;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={ids.pool} cx={poolCx} cy={poolCy} r={0.75}>
          {POOL_STOPS.map((s) => (
            <Stop key={s.o} offset={s.o} stopColor={s.c} stopOpacity={s.op} />
          ))}
        </RadialGradient>
      </Defs>
      {/* inset by half the hairline so the stroke is never clipped */}
      <Rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={size - 1}
        rx={r}
        ry={r}
        fill={colors.surface}
        stroke={colors.line}
        strokeWidth={1}
      />
      {/* the soft pool of light the cell holds */}
      <Rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={size - 1}
        rx={r}
        ry={r}
        fill={`url(#${ids.pool})`}
      />
      {/* the key light's signature: a 1px crescent on the top-left rim */}
      <Path
        d={`M ${corner - cr} ${corner} A ${cr} ${cr} 0 0 1 ${corner} ${corner - cr}`}
        fill="none"
        stroke={colors.silver}
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.2}
      />
      {/* the water dot, doubled: the held breath plus its glint */}
      <Circle cx={c} cy={c} r={2} fill={colors.blueSoft} />
      <Circle cx={glintX} cy={glintY} r={1} fill={colors.silver} opacity={0.5} />
    </Svg>
  );
}
