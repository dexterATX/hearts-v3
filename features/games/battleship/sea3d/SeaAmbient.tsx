// features/games/battleship/sea3d/SeaAmbient.tsx — the page-level ambience
// the whole battleship screen sits in. Not part of the sea table itself:
// this is the room the table stands in.
//
// The grammar is the arcade card's stage glow, gentler and set free: two
// large blue radial light pools drifting behind everything (peak 0.10, well
// under the card's 0.13 lamp), plus one static top-light gradient so the
// page reads as lit from above. Pool A wanders on a 12s breath, pool B on
// 16s, each a yoyo (inOut quad) so the loop turns around instead of ever
// wrapping. Two loops total, both behind the board — inside the far-view
// budget even before the markers mount.
//
// Reduced motion: same pools, same top light, parked at mid drift — a
// static composed frame, no loops at all. Every loop cancels on unmount.
// Motion lives only on Animated.View transform arrays; the svgs inside just
// paint light.
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../../theme/theme';

// the pools: big soft lamps, mostly off-screen so only their falloff shows
const POOL_A_SIZE = 420;
const POOL_B_SIZE = 340;
const POOL_PEAK = 0.1; // gentler than the arcade stage's 0.13 lamp
// the drift: a slow wander, never far — the room breathes, it does not sway
const DRIFT_A_X = 26;
const DRIFT_A_Y = 16;
const DRIFT_B_X = 22;
const DRIFT_B_Y = 20;
// the two breaths: 12s and 16s there-and-back, never phase-locking
const POOL_A_HALF_MS = 6000;
const POOL_B_HALF_MS = 8000;
// the top light: a faint blue wash from above, dissolving by mid-page
const TOP_LIGHT_PEAK = 0.09;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function SeaAmbient({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { pool: `sapool${n}`, top: `satop${n}` };
  });

  // one driver per pool: 0 → 1 → 0 on a yoyo, parked at 0.5 when reduced
  const driftA = useSharedValue(reduced ? 0.5 : 0);
  const driftB = useSharedValue(reduced ? 0.5 : 0);

  useEffect(() => {
    if (reduced) {
      driftA.value = 0.5;
      driftB.value = 0.5; // the static frame: both pools at mid drift
      return;
    }
    driftA.value = 0;
    driftB.value = 1; // start apart — the pools never travel together
    driftA.value = withRepeat(
      withTiming(1, { duration: POOL_A_HALF_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true, // yoyo: turns around, nothing wraps
    );
    driftB.value = withRepeat(
      withTiming(0, { duration: POOL_B_HALF_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(driftA);
      cancelAnimation(driftB);
    };
  }, [reduced, driftA, driftB]);

  const poolAStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftA.value, [0, 1], [-DRIFT_A_X, DRIFT_A_X]) },
      { translateY: interpolate(driftA.value, [0, 1], [DRIFT_A_Y, -DRIFT_A_Y]) },
    ],
  }));
  const poolBStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftB.value, [0, 1], [-DRIFT_B_X, DRIFT_B_X]) },
      { translateY: interpolate(driftB.value, [0, 1], [-DRIFT_B_Y, DRIFT_B_Y]) },
    ],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* the ambience: pure light, never touches the layout or the touches */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {/* pool A: upper left, wandering right and up */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: -POOL_A_SIZE * 0.3,
              left: -POOL_A_SIZE * 0.25,
              width: POOL_A_SIZE,
              height: POOL_A_SIZE,
            },
            poolAStyle,
          ]}
        >
          <Svg width={POOL_A_SIZE} height={POOL_A_SIZE}>
            <Defs>
              <RadialGradient id={ids.pool} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={colors.blue} stopOpacity={POOL_PEAK} />
                <Stop offset="0.6" stopColor={colors.blue} stopOpacity={POOL_PEAK * 0.45} />
                <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={POOL_A_SIZE} height={POOL_A_SIZE} fill={`url(#${ids.pool})`} />
          </Svg>
        </Animated.View>

        {/* pool B: lower right, on the counter-breath; reuses pool A's lamp */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: -POOL_B_SIZE * 0.35,
              right: -POOL_B_SIZE * 0.25,
              width: POOL_B_SIZE,
              height: POOL_B_SIZE,
            },
            poolBStyle,
          ]}
        >
          <Svg width={POOL_B_SIZE} height={POOL_B_SIZE}>
            <Rect x={0} y={0} width={POOL_B_SIZE} height={POOL_B_SIZE} fill={`url(#${ids.pool})`} />
          </Svg>
        </Animated.View>

        {/* the top light: a static soft wash from above, gone by mid-page */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={ids.top} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.blue} stopOpacity={TOP_LIGHT_PEAK} />
              <Stop offset="0.45" stopColor={colors.blue} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${ids.top})`} />
        </Svg>
      </View>

      {children}
    </View>
  );
}
