// features/games/battleship/sea3d/layers/GridLines.tsx — the 8×8 sea table's
// etched grid: hairlines under the water, a brushed-metal rim around it.
//
// The grid is the table's joinery — machined, not drawn, and lit by the one
// shared key light (materials.KEY_LIGHT, top-left):
//   · the rim is a real bevel: the SILVER_METAL gradient stroke from
//     ui/MetallicFrame (diagonal, so the sheen runs corner to corner), plus
//     a groove pair just inside it — a 1px inner shadow (black 0.35) falling
//     away from the light and a 1px highlight (white 0.14) toward it, so
//     the edge reads milled, not stroked
//   · interior hairlines in lineBright at 0.35 stay quiet (they are seen
//     THROUGH the water), each with a 0.5px silver twin 0.5px up-left at
//     0.08 — the second wall of the etched cut, which is what gives it depth
//   · a soft AO dot (radial black 0.18, 3dp) at each of the 49 interior
//     crossings, where two cuts meet and the light pools least
//   · small silver ticks mark the four corners a touch brighter, like wear
//     on a well-handled instrument
//
// Motion is a ONE-TIME draw-in on mount: horizontal hairlines grow out of the
// middle column (scaleX), vertical ones out of the middle row (scaleY), and
// the rim grows on both axes — springs from center settling in ~400ms, then
// the layer is fully static. Zero loops, so the far-view LOD budget is
// untouched. Transforms live ONLY on Animated.View style arrays, never in
// svg props (the SeaArt production-crash rule). Reduced motion draws
// everything instantly at full extent; both springs cancel on unmount.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, radius } from '../../../../../theme/theme';
import { SILVER_METAL } from '../../../../../ui/MetallicFrame';
import { KEY_LIGHT } from '../../../ui/art/materials';
import { GRID } from '../../rules';
import { SEA_SPRING } from '../seaMotion';

// interior hairlines only — the boundary of the board is the metal rim's job
const INTERIOR = Array.from({ length: GRID - 1 }, (_, i) => i + 1);

// gradient ids resolve per document; every mounted board mints its own
let uid = 0;

export function GridLines({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { metal: `gridmetal${n}`, ao: `gridao${n}` };
  });

  const cell = size / GRID;
  const frameW = Math.max(2.5, size * 0.012);
  const inset = frameW / 2; // the stroke straddles the board's edge
  // the rim hugs the water's corner (radius.lg — WaterBase's CORNER_DP): the
  // stroke's INNER edge lands exactly on the water's rounded edge, no gap
  const rimR = radius.lg + frameW / 2;
  const tickLen = cell * 0.42;
  // ticks sit just inside the rim, but never past the water's corner arc —
  // at radius.lg the arc reaches ~7dp in along the diagonal, so 2% of size
  // keeps the tick vertex painted over water on any board
  const tickOff = frameW + Math.max(3, size * 0.02);
  const tickW = Math.max(1.25, size * 0.005);

  // the bevel grammar follows the shared key light: every highlight shifts
  // TOWARD it, every shadow away — one light, one lit stage
  const hx = Math.sign(KEY_LIGHT.dx); // −1 → highlights step left
  const hy = Math.sign(KEY_LIGHT.dy); // −1 → highlights step up
  // the groove pair's centerline: just inside the rim's inner edge (frameW),
  // so the 1px strokes paint over water, kissing the metal
  const groove = frameW + 0.5;

  // 0 = collapsed into the center cross, 1 = full extent; reduced motion
  // starts (and stays) at 1 — nothing ever animates
  const drawX = useSharedValue(reduced ? 1 : 0);
  const drawY = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      drawX.value = 1;
      drawY.value = 1;
      return;
    }
    drawX.value = withSpring(1, SEA_SPRING);
    drawY.value = withDelay(90, withSpring(1, SEA_SPRING));
    return () => {
      cancelAnimation(drawX);
      cancelAnimation(drawY);
    };
  }, [reduced, drawX, drawY]);

  const hStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: drawX.value }] }));
  const vStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: drawY.value }] }));
  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: drawX.value }, { scaleY: drawY.value }],
  }));

  // L-shaped corner ticks, one path per corner, inset just inside the rim
  const ticks = [
    `M${tickOff + tickLen} ${tickOff} L${tickOff} ${tickOff} L${tickOff} ${tickOff + tickLen}`,
    `M${size - tickOff - tickLen} ${tickOff} L${size - tickOff} ${tickOff} L${size - tickOff} ${tickOff + tickLen}`,
    `M${tickOff + tickLen} ${size - tickOff} L${tickOff} ${size - tickOff} L${tickOff} ${size - tickOff - tickLen}`,
    `M${size - tickOff - tickLen} ${size - tickOff} L${size - tickOff} ${size - tickOff} L${size - tickOff} ${size - tickOff - tickLen}`,
  ];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {/* horizontal hairlines, growing out of the middle column */}
      <Animated.View style={[StyleSheet.absoluteFill, hStyle]}>
        <Svg width={size} height={size}>
          {/* etched twins first: a 0.5px silver hairline half a pixel toward
              the key light — the lit wall of each cut, under the dark one */}
          {INTERIOR.map((i) => (
            <Line
              key={`ht${i}`}
              x1={0}
              y1={i * cell + hy * 0.5}
              x2={size}
              y2={i * cell + hy * 0.5}
              stroke={colors.silver}
              strokeWidth={0.5}
              opacity={0.08}
            />
          ))}
          {INTERIOR.map((i) => (
            <Line
              key={`h${i}`}
              x1={0}
              y1={i * cell}
              x2={size}
              y2={i * cell}
              stroke={colors.lineBright}
              strokeWidth={1}
              opacity={0.35}
            />
          ))}
        </Svg>
      </Animated.View>

      {/* vertical hairlines, growing out of the middle row */}
      <Animated.View style={[StyleSheet.absoluteFill, vStyle]}>
        <Svg width={size} height={size}>
          {INTERIOR.map((i) => (
            <Line
              key={`vt${i}`}
              x1={i * cell + hx * 0.5}
              y1={0}
              x2={i * cell + hx * 0.5}
              y2={size}
              stroke={colors.silver}
              strokeWidth={0.5}
              opacity={0.08}
            />
          ))}
          {INTERIOR.map((i) => (
            <Line
              key={`v${i}`}
              x1={i * cell}
              y1={0}
              x2={i * cell}
              y2={size}
              stroke={colors.lineBright}
              strokeWidth={1}
              opacity={0.35}
            />
          ))}
        </Svg>
      </Animated.View>

      {/* the machined rim — gradient bevel + groove pair — and the corner
          ticks, growing on both axes; the crossing AO dots ride along so the
          whole joinery draws in as one piece */}
      <Animated.View style={[StyleSheet.absoluteFill, frameStyle]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id={ids.metal} x1="0%" y1="0%" x2="100%" y2="100%">
              {SILVER_METAL.map((s) => (
                <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </LinearGradient>
            {/* soft black falloff for the crossing AO dots */}
            <RadialGradient id={ids.ao} cx="0.5" cy="0.5" r="0.5">
              <Stop offset={0} stopColor="#000000" stopOpacity={0.18} />
              <Stop offset={1} stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect
            x={inset}
            y={inset}
            width={size - frameW}
            height={size - frameW}
            rx={rimR}
            ry={rimR}
            fill="none"
            stroke={`url(#${ids.metal})`}
            strokeWidth={frameW}
            opacity={0.9}
          />
          {/* the groove pair, 1px apart: shadow away from the key light,
              highlight toward it — the milled inner edge of the rim */}
          <Rect
            x={groove - hx}
            y={groove - hy}
            width={size - 2 * (groove - hx)}
            height={size - 2 * (groove - hy)}
            rx={Math.max(0, radius.lg - 1.5)}
            ry={Math.max(0, radius.lg - 1.5)}
            fill="none"
            stroke="#000000"
            strokeWidth={1}
            opacity={0.35}
          />
          <Rect
            x={groove + hx}
            y={groove + hy}
            width={size - 2 * (groove + hx)}
            height={size - 2 * (groove + hy)}
            rx={radius.lg + 0.5}
            ry={radius.lg + 0.5}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={1}
            opacity={0.14}
          />
          {/* AO where two cuts cross: a 3dp soft dot at each interior
              crossing, painted before the ticks so they stay on top */}
          {INTERIOR.map((ix) =>
            INTERIOR.map((iy) => (
              <Circle
                key={`ao${ix}-${iy}`}
                cx={ix * cell}
                cy={iy * cell}
                r={1.5}
                fill={`url(#${ids.ao})`}
              />
            )),
          )}
          {ticks.map((d) => (
            <Path
              key={d}
              d={d}
              fill="none"
              stroke={colors.silver}
              strokeWidth={tickW}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
