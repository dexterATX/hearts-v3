// features/games/battleship/sea3d/scenes/CloseHit.tsx — the close-up for a
// heart found, and the payoff moment of the whole table, so it carries the
// richest finish of any scene: the heart is glass now (a silver sheen wash
// over the key-lit gradient body, a hot specular crescent on the upper-left
// lobe, a silver rim light catching the bottom-right edge at 0.25), a fine
// static god-ray fan stands behind it (three thin gradient wedges), and the
// old single halo is two nested radials breathing OUT OF PHASE off one
// driver — the core flares while the wide halo swells and thins, a pulse
// leaving the heart. Embers keep rising off the water; bright sparks
// twinkle over the whole find (../particles/Sparks); one sonar ring still
// rings out every 2.4s.
//
// Loops: 2 of the scene's own (the shared glow breath, the sonar ring) +
// the embers' and sparks' own drivers — 4 total, inside the ≤5 budget for
// this scene and the ≤6 close-up cap. The breath reverses, so it has no
// wrap; the sonar ring wraps while invisible (opacity 0 at both ends of the
// cycle). Reduced motion holds a static lit frame (mid-breath glows, faint
// ring, rays and glass all static; both particle fields render their own
// static frames); every loop cancels on unmount. Every svg animation is
// numeric (r/rx/ry/opacity/strokeWidth) — a `transform` key through
// useAnimatedProps killed this app in production.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
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
import { KEY_LIGHT } from '../../../ui/art/materials';
import { Embers } from '../particles/Embers';
import { Sparks } from '../particles/Sparks';
import type { SceneProps } from '../seaTypes';

// fixed 100-unit stage; the svg scales it to `size`, so every geometry below
// is a module constant computed once
const STAGE = 100;
const HEART_W = 55; // the heart owns 55% of the stage
const HEART_H = (HEART_W * 11) / 12;
const HEART_CX = STAGE / 2;
const HEART_CY = 47; // a touch high — the pool and contact shadow want the lower water

// the arcade's one key light lives top-left (KEY_LIGHT from the shared games
// materials — battleship is the same feature, §2.1); the heart fill's
// gradient axis and the glass sheen both run toward it
const KEY_REACH = 0.75;
const HEART_LIGHT = {
  x1: 0.5 + KEY_LIGHT.dx * KEY_REACH,
  y1: 0.5 + KEY_LIGHT.dy * KEY_REACH,
  x2: 0.5 - KEY_LIGHT.dx * KEY_REACH,
  y2: 0.5 - KEY_LIGHT.dy * KEY_REACH,
};

// the arcade's 12×11 bezier heart (SeaArt) scaled onto the stage: two arcs
// meeting at the cleft, bezier-pulled lobes
const heartScaler = (w: number, cx: number, cy: number) => {
  const s = w / 12;
  const ox = cx - w / 2;
  const oy = cy - ((11 * w) / 12) / 2;
  return (x: number, y: number) => `${(ox + x * s).toFixed(1)} ${(oy + y * s).toFixed(1)}`;
};
const pt = heartScaler(HEART_W, HEART_CX, HEART_CY);
const HEART_PATH = `M${pt(6, 11)} C${pt(2.5, 7.5)} ${pt(0, 5.6)} ${pt(0, 3.2)} C${pt(0, 1.2)} ${pt(1.6, 0)} ${pt(3.2, 0)} C${pt(4.4, 0)} ${pt(5.4, 0.7)} ${pt(6, 1.8)} C${pt(6.6, 0.7)} ${pt(7.6, 0)} ${pt(8.8, 0)} C${pt(10.4, 0)} ${pt(12, 1.2)} ${pt(12, 3.2)} C${pt(12, 5.6)} ${pt(9.5, 7.5)} ${pt(6, 11)} Z`;
// the key light's signature: a specular crescent on the upper-left lobe
const SPEC_PATH = `M${pt(2.1, 3.7)} C${pt(2.3, 2.5)} ${pt(3.2, 1.6)} ${pt(4.3, 1.5)}`;
// the glass rim light: a hairline hugging the bottom-right edge (the side
// turned away from the key light), silver at 0.25
const RIM_PATH = `M${pt(11.8, 4.2)} C${pt(11.7, 5.9)} ${pt(9.6, 7.7)} ${pt(6.1, 10.9)}`;

// the god-ray fan: three thin wedges standing behind the heart, apexes hidden
// behind its body, spreading to just past the stage's top edge. Static —
// their gradients (bright at the apex, gone by the tip) do all the work. The
// gradient axes are in each wedge's own bbox, apex corner → tip corner.
const RAY_APEX = { x: HEART_CX, y: 54 };
const RAYS: readonly { key: 'rayL' | 'rayC' | 'rayR'; d: string; axis: { x1: number; y1: number; x2: number; y2: number } }[] = [
  {
    key: 'rayL',
    d: `M${RAY_APEX.x} ${RAY_APEX.y} L17 -4 L25 -4 Z`,
    axis: { x1: 1, y1: 1, x2: 0.12, y2: 0 },
  },
  {
    key: 'rayC',
    d: `M${RAY_APEX.x} ${RAY_APEX.y} L45 -4 L55 -4 Z`,
    axis: { x1: 0.5, y1: 1, x2: 0.5, y2: 0 },
  },
  {
    key: 'rayR',
    d: `M${RAY_APEX.x} ${RAY_APEX.y} L75 -4 L83 -4 Z`,
    axis: { x1: 0, y1: 1, x2: 0.88, y2: 0 },
  },
];

const GLOW_BREATH_MS = 600; // one leg — 0→1→0 reversed = the 1.2s pulse
const SONAR_MS = 2400; // exactly one ring per cycle
const EMBER_COUNT = 7;
const SPARK_COUNT = 6;

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function CloseHit({ size }: SceneProps) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return {
      bg: `closehit-bg${n}`,
      pool: `closehit-pool${n}`,
      glowIn: `closehit-glowin${n}`,
      glowOut: `closehit-glowout${n}`,
      heart: `closehit-heart${n}`,
      sheen: `closehit-sheen${n}`,
      rayL: `closehit-rayl${n}`,
      rayC: `closehit-rayc${n}`,
      rayR: `closehit-rayr${n}`,
    };
  });

  const breath = useSharedValue(0); // drives BOTH glow radials, out of phase
  const sonar = useSharedValue(0); // 0 → 1 per ring; opacity 0 at both ends

  useEffect(() => {
    if (reduced) return;
    breath.value = withRepeat(
      withTiming(1, { duration: GLOW_BREATH_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    sonar.value = withRepeat(
      withTiming(1, { duration: SONAR_MS, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(breath);
      cancelAnimation(sonar);
    };
  }, [reduced, breath, sonar]);

  // the two nested radials breathe OUT OF PHASE off the one driver: the
  // tight core flares (dims → bright, barely swells) exactly as the wide
  // halo swells and thins (bright → dim, growing) — a pulse leaving the
  // heart. Numeric only, and the reversed driver never wraps.
  const glowInProps = useAnimatedProps(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.45, 0.9]),
    rx: interpolate(breath.value, [0, 1], [25, 26.5]),
    ry: interpolate(breath.value, [0, 1], [22.5, 24]),
  }));
  const glowOutProps = useAnimatedProps(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.7, 0.35]),
    rx: interpolate(breath.value, [0, 1], [34, 38]),
    ry: interpolate(breath.value, [0, 1], [31, 34.5]),
  }));
  // one ring per 2.4s: out of the heart, across the pool, gone by 75% of the
  // cycle — the reset frame (t=1 → t=0) is invisible at opacity 0
  const sonarProps = useAnimatedProps(() => ({
    r: interpolate(sonar.value, [0, 0.7, 1], [HEART_W * 0.45, 48, 48], Extrapolation.CLAMP),
    opacity: interpolate(
      sonar.value,
      [0, 0.06, 0.45, 0.75, 1],
      [0, 0.5, 0.22, 0, 0],
      Extrapolation.CLAMP,
    ),
    strokeWidth: interpolate(sonar.value, [0, 0.7, 1], [2.4, 0.5, 0.5], Extrapolation.CLAMP),
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // the scene's own corner coincides with the dive stage's inner clip
      // (SeaCloseUp's MetallicFrame: radius.lg − its 2dp FRAME) — every
      // close-up rounds identically, whichever scene is showing
      style={{ width: size, height: size, borderRadius: radius.lg - 2, overflow: 'hidden' }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${STAGE} ${STAGE}`}>
        <Defs>
          <LinearGradient id={ids.bg} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.blueTint} />
          </LinearGradient>
          <RadialGradient id={ids.pool} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={0.2} />
            <Stop offset="0.6" stopColor={colors.blue} stopOpacity={0.08} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
          {/* the tight hot core of the halo */}
          <RadialGradient id={ids.glowIn} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.ink} stopOpacity={0.32} />
            <Stop offset="0.25" stopColor={colors.blue} stopOpacity={0.5} />
            <Stop offset="0.6" stopColor={colors.blue} stopOpacity={0.18} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
          {/* the wide soft halo around it */}
          <RadialGradient id={ids.glowOut} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={0.3} />
            <Stop offset="0.55" stopColor={colors.blue} stopOpacity={0.12} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
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
          {/* the glass sheen: a silver wash over the whole heart, bright at
              the key-light corner, gone by the far edge */}
          <LinearGradient
            id={ids.sheen}
            x1={HEART_LIGHT.x1}
            y1={HEART_LIGHT.y1}
            x2={HEART_LIGHT.x2}
            y2={HEART_LIGHT.y2}
          >
            <Stop offset="0" stopColor={colors.silver} stopOpacity={0.22} />
            <Stop offset="0.45" stopColor={colors.silver} stopOpacity={0.05} />
            <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
          </LinearGradient>
          {/* one gradient per wedge: bright at the hidden apex, fading up */}
          {RAYS.map((ray) => (
            <LinearGradient
              key={ray.key}
              id={ids[ray.key]}
              x1={ray.axis.x1}
              y1={ray.axis.y1}
              x2={ray.axis.x2}
              y2={ray.axis.y2}
            >
              <Stop offset="0" stopColor={colors.ink} stopOpacity={0.14} />
              <Stop offset="0.55" stopColor={colors.ink} stopOpacity={0.05} />
              <Stop offset="1" stopColor={colors.ink} stopOpacity={0} />
            </LinearGradient>
          ))}
        </Defs>

        {/* deep water */}
        <Rect x={0} y={0} width={STAGE} height={STAGE} fill={`url(#${ids.bg})`} />
        {/* the light the water keeps around the find */}
        <Ellipse cx={HEART_CX} cy={60} rx={46} ry={32} fill={`url(#${ids.pool})`} />

        {/* the god-ray fan behind the heart — static under every motion
            setting, fine enough that it reads as light, not geometry */}
        {RAYS.map((ray) => (
          <Path key={ray.key} d={ray.d} fill={`url(#${ids[ray.key]})`} />
        ))}

        {/* the breathing halo, two nested radials out of phase — static
            mid-breath under reduced motion */}
        {reduced ? (
          <>
            <Ellipse
              cx={HEART_CX}
              cy={HEART_CY}
              rx={36}
              ry={32.5}
              fill={`url(#${ids.glowOut})`}
              opacity={0.5}
            />
            <Ellipse
              cx={HEART_CX}
              cy={HEART_CY}
              rx={25.5}
              ry={23}
              fill={`url(#${ids.glowIn})`}
              opacity={0.65}
            />
          </>
        ) : (
          <>
            <AnimatedEllipse
              cx={HEART_CX}
              cy={HEART_CY}
              rx={34}
              ry={31}
              fill={`url(#${ids.glowOut})`}
              opacity={0.7}
              animatedProps={glowOutProps}
            />
            <AnimatedEllipse
              cx={HEART_CX}
              cy={HEART_CY}
              rx={25}
              ry={22.5}
              fill={`url(#${ids.glowIn})`}
              opacity={0.45}
              animatedProps={glowInProps}
            />
          </>
        )}

        {/* the heart grounds itself: a soft contact shadow on the water,
            nudged down-right — away from the top-left key light, the same
            offset CloseShip's shadow takes */}
        <Ellipse
          cx={HEART_CX + 2.5}
          cy={HEART_CY + HEART_H / 2 + 4}
          rx={HEART_W * 0.4}
          ry={4.5}
          fill={colors.bg}
          opacity={0.4}
        />

        {/* the found heart, lit from the top-left, with its glass finish:
            gradient body, silver sheen wash, hot specular crescent toward
            the key light, silver rim light on the far bottom-right edge */}
        <Path d={HEART_PATH} fill={`url(#${ids.heart})`} />
        <Path d={HEART_PATH} fill={`url(#${ids.sheen})`} />
        <Path
          d={SPEC_PATH}
          fill="none"
          stroke={colors.ink}
          strokeWidth={2.8}
          strokeLinecap="round"
          opacity={0.6}
        />
        <Path
          d={RIM_PATH}
          fill="none"
          stroke={colors.silver}
          strokeWidth={1.3}
          strokeLinecap="round"
          opacity={0.25}
        />

        {/* the sonar ring — or its frozen ghost under reduced motion */}
        {reduced ? (
          <Circle
            cx={HEART_CX}
            cy={HEART_CY}
            r={40}
            fill="none"
            stroke={colors.blue}
            strokeWidth={1}
            opacity={0.14}
          />
        ) : (
          <AnimatedCircle
            cx={HEART_CX}
            cy={HEART_CY}
            r={HEART_W * 0.45}
            fill="none"
            stroke={colors.blue}
            strokeWidth={2.4}
            opacity={0}
            animatedProps={sonarProps}
          />
        )}
      </Svg>

      {/* embers rising off the find and sparks twinkling over it — each
          field runs its own loop and its own reduced frame */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Embers size={size} count={EMBER_COUNT} />
        <Sparks size={size} count={SPARK_COUNT} />
      </View>
    </View>
  );
}
