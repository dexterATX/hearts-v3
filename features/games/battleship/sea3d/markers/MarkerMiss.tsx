// features/games/battleship/sea3d/markers/MarkerMiss.tsx — far-view glyph for
// a spent shot: the foam ring the splash left behind, now drawn as real foam.
// Two faint concentric strokes (the second ring is the first one's settling
// echo), a three-dot cluster of foam beads caught on the rim toward the key
// light, and the impact point softened from a hard silver dot into a small
// radial bloom. Static by contract (LOD budget — far-view markers never
// loop), so there is nothing to cancel and reduced motion needs no branch.
import { useState } from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';
import { KEY_LIGHT } from '../../../ui/art/materials';
import type { SceneProps } from '../seaTypes';

// the rim cluster gathers toward the arcade's one top-left key light;
// ±0.38 rad (≈22°) keeps the three beads reading as one cluster, not a ring
const FOAM_BASE = Math.atan2(KEY_LIGHT.dy, KEY_LIGHT.dx);
const FOAM_DOTS = [
  { a: FOAM_BASE - 0.38, r: 0.7, op: 0.45 },
  { a: FOAM_BASE, r: 1.1, op: 0.7 },
  { a: FOAM_BASE + 0.38, r: 0.8, op: 0.5 },
] as const;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function MarkerMiss({ size }: SceneProps) {
  const [ids] = useState(() => ({ bloom: `mmiss${uid++}` }));
  const c = size / 2;
  const rim = size * 0.3;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id={ids.bloom} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colors.silver} stopOpacity={0.85} />
          <Stop offset="0.55" stopColor={colors.silver} stopOpacity={0.3} />
          <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* the foam ring the splash left behind — two concentric breaths */}
      <Circle cx={c} cy={c} r={rim} fill="none" stroke={colors.faint} strokeWidth={1} />
      <Circle
        cx={c}
        cy={c}
        r={rim * 0.72}
        fill="none"
        stroke={colors.faint}
        strokeWidth={0.6}
        opacity={0.5}
      />
      {/* foam beads caught on the rim, clustered toward the light */}
      {FOAM_DOTS.map((d) => (
        <Circle
          key={d.a}
          cx={c + Math.cos(d.a) * rim}
          cy={c + Math.sin(d.a) * rim}
          r={d.r}
          fill={colors.silver}
          opacity={d.op}
        />
      ))}
      {/* the impact point, softened into a bloom */}
      <Circle cx={c} cy={c} r={Math.max(1.6, size * 0.08)} fill={`url(#${ids.bloom})`} />
    </Svg>
  );
}
