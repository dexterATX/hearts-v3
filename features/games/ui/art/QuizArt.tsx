// features/games/ui/art/QuizArt.tsx — the quiz as three glossy thought
// bubbles drifting in depth.
//
// REALISM PASS. Every bubble is a shaded glass sphere, not a stroked ring:
// a radial body gradient lit from the shared top-left key light (blueTint at
// the 10-o'clock shoulder, settling through surface to near-black at the far
// terminator), a crisp white specular crescent at 10 o'clock, and a soft
// contact shadow pooled below so each sphere sits in the scene instead of
// floating over it. Three depth layers — a small faint bubble far back, a
// mid bubble, the blue hero in front — drift on incommensurate periods (bob
// 2.9s/4.3s/5.7s front→back, every axis on its own period) so the
// composition never visibly repeats; distance reads as slower, smaller,
// fainter. The hero's inner blue pool trails the glass by 30% — overlapping
// action, the liquid lagging the shell (parallax inside the bubble). The
// wondering '?' marks are typography-grade: the display face with no faux
// weight, rising with an ease-out, swaying ±4°, then dissolving upward — a
// 2dp lift plus a 1→1.15 scale standing in for a blur. The smaller silver
// mark keeps its 4.7s cycle offset by 1.7s so the two never surface
// together; both wrap at opacity 0, hiding the loop snap. Reduced motion:
// the glossy trio at rest, both marks risen. Every loop cancels on unmount;
// gradient ids are minted per instance.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from '../../../../theme/theme';
import { KEY_LIGHT } from './materials';

// the scene is drawn once on a 56-unit grid; viewBox scales it to any size
const GRID = 56;
// three depth layers: a small faint bubble far back, a mid bubble, and the
// blue hero in front (opaque body, so it occludes whatever drifts behind it)
const BG = { cx: 20, cy: 43, r: 5.5 };
const MID = { cx: 17, cy: 20, r: 8.5 };
const FG = { cx: 38, cy: 33, r: 12 };
// aerial perspective at icon scale: depth reads as dimmer
const BG_OPACITY = 0.55;
const MID_OPACITY = 0.8;

// drift: duration-based critically-damped springs, reversed forever — zero
// velocity at the turnarounds, so wraps are invisible and every move slows
// in and out. Bob periods 2.9s/4.3s/5.7s front→back (depth = slower); each
// axis gets its own incommensurate period so no bubble's path ever closes
const FG_Y = { duration: 2900, dampingRatio: 1 };
const FG_X = { duration: 3700, dampingRatio: 1 };
const MID_Y = { duration: 4300, dampingRatio: 1 };
const MID_X = { duration: 5300, dampingRatio: 1 };
const BG_Y = { duration: 5700, dampingRatio: 1 };
const BG_X = { duration: 7100, dampingRatio: 1 };
const FG_Y_DP = 3;
const FG_X_DP = 1.8;
const MID_Y_DP = 2.2;
const MID_X_DP = 1.3;
const BG_Y_DP = 1.6;
const BG_X_DP = 1;
// the hero's inner pool rides only 70% of the drift — 30% counter-motion
// against the glass, so the liquid visibly trails the shell
const POOL_LAG = 0.3;

// the arcade's key light is shared (materials' KEY_LIGHT): one lamp,
// top-left. The specular crescent sits at 10 o'clock — direction
// (−cos30°, −sin30°), squarely inside that key — inset 62% of the radius,
// its long axis on the rim tangent (−60°)
const SPEC_INSET = 0.62;
const SPEC_ROT_DEG = -60;
const specAt = (c: { cx: number; cy: number; r: number }) => ({
  x: c.cx - 0.866 * SPEC_INSET * c.r,
  y: c.cy - 0.5 * SPEC_INSET * c.r,
  rx: c.r * 0.28,
  ry: c.r * 0.14,
});
// the contact shadow: a soft pool of dark below each sphere, nudged away
// from the shared key light (−KEY_LIGHT) and squashed flat like a real cast
// shadow
const shadowAt = (c: { cx: number; cy: number; r: number }) => ({
  x: c.cx - KEY_LIGHT.dx * c.r * 0.25,
  y: c.cy + c.r + 3 - KEY_LIGHT.dy * c.r * 0.25,
  rx: c.r * 0.78,
  ry: Math.max(1.4, c.r * 0.22),
});

// a glossy sphere: shadow, shaded body with a hairline rim, specular crescent
function glossySphere(
  c: { cx: number; cy: number; r: number },
  bodyId: string,
  shadowId: string,
  rim: string,
) {
  const spec = specAt(c);
  const shadow = shadowAt(c);
  return (
    <>
      <Ellipse cx={shadow.x} cy={shadow.y} rx={shadow.rx} ry={shadow.ry} fill={`url(#${shadowId})`} />
      <Circle cx={c.cx} cy={c.cy} r={c.r} fill={`url(#${bodyId})`} stroke={rim} strokeWidth={1.2} />
      <Ellipse
        cx={spec.x}
        cy={spec.y}
        rx={spec.rx}
        ry={spec.ry}
        fill="#FFFFFF"
        opacity={0.5}
        transform={`rotate(${SPEC_ROT_DEG} ${spec.x} ${spec.y})`}
      />
    </>
  );
}

// the sphere's two gradients: the body lit from the top-left (gradient center
// pulled toward the key light), and the contact shadow fading to nothing
function sphereDefs(bodyId: string, shadowId: string) {
  return (
    <Defs>
      <RadialGradient id={bodyId} cx="0.36" cy="0.3" r="0.85">
        <Stop offset="0" stopColor={colors.blueTint} />
        <Stop offset="0.55" stopColor={colors.surface} />
        <Stop offset="1" stopColor={colors.bg} />
      </RadialGradient>
      <RadialGradient id={shadowId} cx="0.5" cy="0.5" r="0.5">
        <Stop offset="0" stopColor="#000000" stopOpacity={0.34} />
        <Stop offset="0.7" stopColor="#000000" stopOpacity={0.12} />
        <Stop offset="1" stopColor="#000000" stopOpacity={0} />
      </RadialGradient>
    </Defs>
  );
}

// the wondering marks: display face (never a faux weight alongside it), rise
// with an ease-out, sway gently, dissolve upward. The blue mark runs a 3s
// cycle; the smaller silver one a 4.7s cycle delayed 1.7s so they never rise
// together
const Q_CYCLE_MS = 3000;
const Q_RISE_DP = -8;
const Q_SWAY_DEG = 4;
const Q_BOX = 20; // grid units — the mark lives in its own box so rotate/scale pivot on the glyph, not the stage
const Q_FONT = 15;
const Q2_CYCLE_MS = 4700;
const Q2_OFFSET_MS = 1700;
const Q2_RISE_DP = -7;
const Q2_SWAY_DEG = 3.5;
const Q2_BOX = 14;
const Q2_FONT = 9;
const Q2_PEAK = 0.85;
// one cycle, three acts: the rise eases out over the first 38%, holds, then
// the last 30% dissolves — fade plus a 2dp upward lift plus a 1→1.15 zoom,
// the blur-substitute. Appearing also scales 0.92→1, a breath of anticipation
const RISE_END = 0.38;
const DISSOLVE_AT = 0.7;
const DISSOLVE_LIFT_DP = -2;
const DISSOLVE_SCALE = 0.15;
const APPEAR_SCALE = 0.92;

// gradient ids resolve per Svg document; every instance mints its own set
let uid = 0;

export function QuizArt({ size = 56 }: { size?: number }) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return {
      bodyBg: `qzg${n}b`,
      bodyMid: `qzg${n}m`,
      bodyFg: `qzg${n}f`,
      shadowBg: `qzs${n}b`,
      shadowMid: `qzs${n}m`,
      shadowFg: `qzs${n}f`,
      pool: `qzp${n}`,
    };
  });
  // all drivers rest at 0.5: drifts sit at 0dp and both marks show risen —
  // that is also the reduced-motion static frame
  const driftFgY = useSharedValue(0.5);
  const driftFgX = useSharedValue(0.5);
  const driftMidY = useSharedValue(0.5);
  const driftMidX = useSharedValue(0.5);
  const driftBgY = useSharedValue(0.5);
  const driftBgX = useSharedValue(0.5);
  const q = useSharedValue(0.5);
  const q2 = useSharedValue(0.5);

  useEffect(() => {
    const drivers = [driftFgY, driftFgX, driftMidY, driftMidX, driftBgY, driftBgX, q, q2];
    if (reduced) {
      for (const d of drivers) cancelAnimation(d);
      for (const d of drivers) d.value = 0.5;
      return;
    }
    // every bubble out of phase twice over: incommensurate periods per axis
    // and per layer, and the inverted ranges below keep them from bobbing in
    // lockstep
    driftFgY.value = withRepeat(withSpring(1, FG_Y), -1, true);
    driftFgX.value = withRepeat(withSpring(1, FG_X), -1, true);
    driftMidY.value = withRepeat(withSpring(1, MID_Y), -1, true);
    driftMidX.value = withRepeat(withSpring(1, MID_X), -1, true);
    driftBgY.value = withRepeat(withSpring(1, BG_Y), -1, true);
    driftBgX.value = withRepeat(withSpring(1, BG_X), -1, true);
    // slow ambient loops, so withTiming is house-legal; both cycles wrap at
    // opacity 0, which hides the snap back to the start. The smaller mark is
    // delayed so the two never surface together
    q.value = 0;
    q.value = withRepeat(
      withTiming(1, { duration: Q_CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    q2.value = 0;
    q2.value = withDelay(
      Q2_OFFSET_MS,
      withRepeat(
        withTiming(1, { duration: Q2_CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    );
    return () => {
      for (const d of drivers) cancelAnimation(d);
    };
  }, [reduced, driftFgY, driftFgX, driftMidY, driftMidX, driftBgY, driftBgX, q, q2]);

  const fgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(driftFgY.value, [0, 1], [FG_Y_DP, -FG_Y_DP]) },
      { translateX: interpolate(driftFgX.value, [0, 1], [-FG_X_DP, FG_X_DP]) },
    ],
  }));
  const midStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(driftMidY.value, [0, 1], [-MID_Y_DP, MID_Y_DP]) },
      { translateX: interpolate(driftMidX.value, [0, 1], [MID_X_DP, -MID_X_DP]) },
    ],
  }));
  const bgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(driftBgY.value, [0, 1], [BG_Y_DP, -BG_Y_DP]) },
      { translateX: interpolate(driftBgX.value, [0, 1], [-BG_X_DP, BG_X_DP]) },
    ],
  }));
  // the pool lags the hero's drift by 30% — same path, 70% of the travel
  const poolStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(driftFgY.value, [0, 1], [FG_Y_DP, -FG_Y_DP]) * (1 - POOL_LAG) },
      { translateX: interpolate(driftFgX.value, [0, 1], [-FG_X_DP, FG_X_DP]) * (1 - POOL_LAG) },
    ],
  }));
  const qStyle = useAnimatedStyle(() => {
    const v = q.value;
    // the rise: ease-out cubic, so the mark decelerates as it clears the rim
    const riseT = Math.min(1, v / RISE_END);
    const rise = 1 - Math.pow(1 - riseT, 3);
    // the dissolve: accelerating zoom + lift + fade, wrapped up by cycle end
    const disT = Math.max(0, Math.min(1, (v - DISSOLVE_AT) / (1 - DISSOLVE_AT)));
    const dis = disT * disT;
    return {
      // in, hold, out — fully dissolved at both ends of the cycle
      opacity: interpolate(v, [0, 0.14, DISSOLVE_AT, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY:
            // ride the hero bubble's drift, then rise out of it
            interpolate(driftFgY.value, [0, 1], [FG_Y_DP, -FG_Y_DP]) +
            rise * Q_RISE_DP +
            dis * DISSOLVE_LIFT_DP,
        },
        { translateX: interpolate(driftFgX.value, [0, 1], [-FG_X_DP, FG_X_DP]) },
        { rotate: `${Math.sin(v * Math.PI * 2) * Q_SWAY_DEG}deg` },
        { scale: (APPEAR_SCALE + (1 - APPEAR_SCALE) * rise) * (1 + DISSOLVE_SCALE * dis) },
      ],
    };
  });
  const q2Style = useAnimatedStyle(() => {
    const v = q2.value;
    const riseT = Math.min(1, v / RISE_END);
    const rise = 1 - Math.pow(1 - riseT, 3);
    const disT = Math.max(0, Math.min(1, (v - DISSOLVE_AT) / (1 - DISSOLVE_AT)));
    const dis = disT * disT;
    return {
      opacity: interpolate(v, [0, 0.14, DISSOLVE_AT, 1], [0, Q2_PEAK, Q2_PEAK, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY:
            // ride the mid bubble's drift on both axes, then rise out of it
            interpolate(driftMidY.value, [0, 1], [-MID_Y_DP, MID_Y_DP]) +
            rise * Q2_RISE_DP +
            dis * DISSOLVE_LIFT_DP,
        },
        { translateX: interpolate(driftMidX.value, [0, 1], [MID_X_DP, -MID_X_DP]) },
        { rotate: `${Math.sin(v * Math.PI * 2) * Q2_SWAY_DEG}deg` },
        { scale: (APPEAR_SCALE + (1 - APPEAR_SCALE) * rise) * (1 + DISSOLVE_SCALE * dis) },
      ],
    };
  });

  // grid unit → px, for the mark boxes' static placement
  const k = size / GRID;

  return (
    <View style={{ width: size, height: size }}>
      {/* the far layer: smallest, slowest, faintest */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: BG_OPACITY }, bgStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
          {sphereDefs(ids.bodyBg, ids.shadowBg)}
          {glossySphere(BG, ids.bodyBg, ids.shadowBg, colors.silver)}
        </Svg>
      </Animated.View>
      {/* the mid layer — the small '?' rises out of this one */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: MID_OPACITY }, midStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
          {sphereDefs(ids.bodyMid, ids.shadowMid)}
          {glossySphere(MID, ids.bodyMid, ids.shadowMid, colors.silver)}
        </Svg>
      </Animated.View>
      {/* the smaller wondering mark: rises from the mid bubble and dissolves,
          drawn behind the hero so it stays in the midground */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: (MID.cx - Q2_BOX / 2) * k,
            top: (MID.cy - Q2_BOX / 2) * k,
            width: Q2_BOX * k,
            height: Q2_BOX * k,
          },
          q2Style,
        ]}
      >
        <Svg width={Q2_BOX * k} height={Q2_BOX * k} viewBox={`0 0 ${Q2_BOX} ${Q2_BOX}`}>
          <SvgText
            x={Q2_BOX / 2}
            y={Q2_BOX / 2 + Q2_FONT * 0.35}
            fontSize={Q2_FONT}
            fontFamily={fonts.display}
            fill={colors.silver}
            textAnchor="middle"
          >
            ?
          </SvgText>
        </Svg>
      </Animated.View>
      {/* the hero, in front — shaded body, rim, and the specular crescent all
          ride the drift together (a translating sphere keeps its highlight) */}
      <Animated.View style={[StyleSheet.absoluteFill, fgStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
          {sphereDefs(ids.bodyFg, ids.shadowFg)}
          {glossySphere(FG, ids.bodyFg, ids.shadowFg, colors.blue)}
        </Svg>
      </Animated.View>
      {/* the hero's inner pool, trailing the glass by 30% — the lag is the
          parallax cue that the blue lives INSIDE the bubble */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, poolStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
          <Defs>
            <RadialGradient id={ids.pool} cx="0.5" cy="0.42" r="0.55">
              <Stop offset="0" stopColor={colors.blue} stopOpacity={0.18} />
              <Stop offset="0.7" stopColor={colors.blue} stopOpacity={0.05} />
              <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={FG.cx} cy={FG.cy} r={FG.r} fill={`url(#${ids.pool})`} />
        </Svg>
      </Animated.View>
      {/* the main wondering mark: rises from the hero bubble and dissolves */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: (FG.cx - Q_BOX / 2) * k,
            top: (FG.cy - Q_BOX / 2) * k,
            width: Q_BOX * k,
            height: Q_BOX * k,
          },
          qStyle,
        ]}
      >
        <Svg width={Q_BOX * k} height={Q_BOX * k} viewBox={`0 0 ${Q_BOX} ${Q_BOX}`}>
          <SvgText
            x={Q_BOX / 2}
            y={Q_BOX / 2 + Q_FONT * 0.35}
            fontSize={Q_FONT}
            fontFamily={fonts.display}
            fill={colors.blue}
            textAnchor="middle"
          >
            ?
          </SvgText>
        </Svg>
      </Animated.View>
    </View>
  );
}
