// features/games/battleship/sea3d/particles/SprayMist.tsx — a breath of sea
// spray hanging over the water.
//
// Two overlapping radial-gradient puffs (silver at 0.06, so it reads as
// light on damp air rather than smoke) drift ±10dp laterally on a 6s
// reversing loop — in-out easing parks the drift at each end, so the reverse
// never snaps. The motion lives on an Animated.View transform array; the svg
// only paints (the production-crash rule: never `transform` in animated
// props). Reduced motion holds the mist centred and still; the loop cancels
// on unmount. One shared value, one loop — inside the close-up LOD budget.
import { useEffect, useState } from 'react';
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
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';

// one leg of the drift: 3s out, 3s back reversed = a 6s loop that wraps
// while motionless at the extremes
const MIST_LEG_MS = 3000;
const DRIFT_DP = 10;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function SprayMist({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { a: `mistA${n}`, b: `mistB${n}` };
  });

  const drift = useSharedValue(reduced ? 0.5 : 0);

  useEffect(() => {
    if (reduced) {
      drift.value = 0.5; // parked mid-drift: the mist hangs centred and still
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: MIST_LEG_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(drift);
  }, [reduced, drift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-DRIFT_DP, DRIFT_DP]) }],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
      pointerEvents="none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Defs>
            <RadialGradient id={ids.a} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={colors.silver} stopOpacity={0.06} />
              <Stop offset="0.65" stopColor={colors.silver} stopOpacity={0.03} />
              <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={ids.b} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={colors.silver} stopOpacity={0.05} />
              <Stop offset="0.6" stopColor={colors.silver} stopOpacity={0.02} />
              <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {/* two puffs, offset so the overlap thickens the middle of the cloud */}
          <Ellipse cx={19} cy={26} rx={15} ry={9} fill={`url(#${ids.a})`} />
          <Ellipse cx={30} cy={22} rx={13} ry={8} fill={`url(#${ids.b})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
