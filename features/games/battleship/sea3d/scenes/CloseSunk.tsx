// sea3d/scenes/CloseSunk.tsx — the close-up for a sunk cell: the heart, come
// to rest. The same bezier heart the arcade draws (SeaArt) and the far view
// tips 25° (MarkerSunk) here lies on the sea floor at a quieter 16°, blueDeep,
// its bottom tip tucked under a soft sediment mound so it reads as SETTLED,
// not dropped. A dim shaft of surface light (5% silver, static) falls from
// above with a second, fainter companion off to its right; a faint blue glow
// behind the heart breathes on one slow reversed timing; a thin column of
// Bubbles rises off the heart's cleft; two dark seaweed slivers rooted in the
// mound sway ±2° on ONE shared slow driver. The mound itself carries the
// close-up detail: key-light gradient shading, three seeded specks, and a
// faint silver rim light along the wreck's upper-left arc.
//
// Loop budget: 3 — the glow breath, the one seaweed sway (both slivers read
// the same driver, one inverted so they counter-lean), and Bubbles' single
// shared driver. The shafts, mounds and silt never move: a wreck is still.
// Reduced motion parks every driver mid-travel (mid-breath glow, 0° sway)
// and Bubbles renders its own static scatter. The tilt is a plain View
// transform and the sway rotates Animated.Views; svg props animate
// numerically (opacity only) — never a transform key through animated props
// (the SeaArt production-crash rule).

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, radius } from '../../../../../theme/theme';
import { Bubbles } from '../particles/Bubbles';
import type { SceneProps } from '../seaTypes';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// the arcade's one heart: two arcs meeting at the cleft, bezier-pulled lobes,
// 12 wide × 11 tall (same path as features/games/ui/art/SeaArt.tsx)
const HEART_PATH =
  'M6 11 C2.5 7.5 0 5.6 0 3.2 C0 1.2 1.6 0 3.2 0 C4.4 0 5.4 0.7 6 1.8 C6.6 0.7 7.6 0 8.8 0 C10.4 0 12 1.2 12 3.2 C12 5.6 9.5 7.5 6 11 Z';
// what remains of the key light: a soft silver crescent on the upper-left lobe
const SPEC_PATH = 'M2.1 3.7 C2.3 2.5 3.2 1.6 4.3 1.5';

// geometry inside a 100×100 box, scaled by k
const HEART_W = 30;
const HEART_H = (HEART_W * 11) / 12; // 27.5
const HEART_CX = 50;
const HEART_CY = 62;
const TILT_DEG = -16; // settled, not falling — gentler than the far view's 25°

// the glow breath: one reversed timing, 0.45 → 0.85 and back. A pure fade
// with no wrap at all, so the loop can never show a seam
const BREATH_MS = 4600;

// the bubble column's box: Bubbles renders a SQUARE svg venting at (0.36,
// 0.94) of its own box, so the box is placed to put that vent on the tilted
// heart's cleft (~46, 54); its surface line lands ~17 units from the top
const BUBBLE_SIZE = 44;
const BUBBLE_LEFT = 46 - 0.36 * BUBBLE_SIZE;
const BUBBLE_TOP = 54 - 0.94 * BUBBLE_SIZE;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function CloseSunk({ size }: SceneProps) {
  const k = size / 100;
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return {
      water: `sunkwater${n}`,
      shaft: `sunkshaft${n}`,
      glow: `sunkglow${n}`,
      heart: `sunkheart${n}`,
    };
  });

  // parked mid-breath so reduced motion holds a lit, static frame
  const breath = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) return;
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(breath);
    };
  }, [reduced, breath]);

  const glowProps = useAnimatedProps(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.45, 0.85]),
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // the scene's own corner coincides with the dive stage's inner clip
      // (SeaCloseUp's MetallicFrame: radius.lg − its 2dp FRAME)
      style={{ width: size, height: size, borderRadius: radius.lg - 2, overflow: 'hidden' }}
      pointerEvents="none"
    >
      {/* deep water, the light shaft, the sea floor, the glow — one base svg */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={ids.water} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.surface} />
          </LinearGradient>
          <LinearGradient id={ids.shaft} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.silver} stopOpacity={0.05} />
            <Stop offset="0.75" stopColor={colors.silver} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={0.2} />
            <Stop offset="0.6" stopColor={colors.blue} stopOpacity={0.08} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width={100} height={100} fill={`url(#${ids.water})`} />

        {/* the shaft: what little surface light reaches this deep — static */}
        <Path d="M40 0 L64 0 L76 80 L30 80 Z" fill={`url(#${ids.shaft})`} />

        {/* the sea floor: a broad back swell of sediment */}
        <Ellipse cx={50} cy={90} rx={62} ry={18} fill={colors.surface} opacity={0.9} />

        {/* the heart's last light, breathing faintly behind it */}
        <AnimatedEllipse
          cx={HEART_CX}
          cy={HEART_CY}
          rx={34}
          ry={26}
          fill={`url(#${ids.glow})`}
          opacity={0.65}
          animatedProps={glowProps}
        />

        {/* silt and pebbles around the resting place — never moving */}
        <Circle cx={24} cy={90} r={1.6} fill={colors.raised} opacity={0.5} />
        <Circle cx={72} cy={92} r={2.2} fill={colors.line} opacity={0.8} />
        <Circle cx={64} cy={86} r={1.2} fill={colors.raised} opacity={0.6} />
        <Circle cx={36} cy={94} r={1.8} fill={colors.surfaceAlt} opacity={0.9} />
      </Svg>

      {/* the heart itself, tipped into the sediment — a static View rotation,
          never an svg transform string */}
      <View
        style={{
          position: 'absolute',
          left: (HEART_CX - HEART_W / 2) * k,
          top: (HEART_CY - HEART_H / 2) * k,
          width: HEART_W * k,
          height: HEART_H * k,
          transform: [{ rotate: `${TILT_DEG}deg` }],
        }}
      >
        <Svg width={HEART_W * k} height={HEART_H * k} viewBox="0 0 12 11">
          <Defs>
            <LinearGradient id={ids.heart} x1="0.2" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor={colors.blue} stopOpacity={0.55} />
              <Stop offset="1" stopColor={colors.blueDeep} />
            </LinearGradient>
          </Defs>
          <Path d={HEART_PATH} fill={`url(#${ids.heart})`} opacity={0.95} />
          <Path
            d={SPEC_PATH}
            fill="none"
            stroke={colors.silver}
            strokeWidth={0.7}
            strokeLinecap="round"
            opacity={0.3}
          />
        </Svg>
      </View>

      {/* the front lip of the mound, drawn OVER the heart's bottom tip so it
          reads as tucked into the sediment, plus two foreground silt grains */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Ellipse cx={52} cy={86} rx={44} ry={13} fill={colors.raised} opacity={0.55} />
        <Ellipse cx={52} cy={89} rx={40} ry={11} fill={colors.surface} opacity={0.85} />
        <Circle cx={46} cy={84} r={1} fill={colors.lineBright} opacity={0.5} />
        <Circle cx={60} cy={83} r={0.8} fill={colors.line} opacity={0.6} />
      </Svg>

      {/* the bubbles: one shared loop inside Bubbles, vented on the cleft */}
      <View
        style={{
          position: 'absolute',
          left: BUBBLE_LEFT * k,
          top: BUBBLE_TOP * k,
          width: BUBBLE_SIZE * k,
          height: BUBBLE_SIZE * k,
        }}
      >
        <Bubbles size={BUBBLE_SIZE * k} count={7} />
      </View>
    </View>
  );
}
