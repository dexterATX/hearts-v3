// features/games/battleship/sea3d/hud/FleetPips.tsx — one tiny heart per ship:
// lit blue while she sails, dimmed and tilted once she goes down. The heart
// that just sank plays a single one-shot sink (dip, tilt, crossfade to silver);
// reduced motion swaps it instantly. No loops anywhere in this row, so the row
// costs nothing against the LOD budget.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../../../../ui';
import { colors, motion, spacing } from '../../../../../theme/theme';

// a plump little heart on a 24×24 box, fill carries the whole state
const HEART_D =
  'M12 21s-8-5.5-10-10C0 7 2 3 6 3c2.4 0 4 1.2 6 3.2C14 4.2 15.6 3 18 3c4 0 6 4 4 8-2 4.5-10 10-10 10z';

const PIP = 14;

function Heart({ size, fill }: { size: number; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={HEART_D} fill={fill} />
    </Svg>
  );
}

function Pip({ sunk }: { sunk: boolean }) {
  const reduced = useReducedMotion();
  // 0 = afloat, 1 = sunk. Ships that were already down when the row mounted
  // start at 1, so only a heart whose state flips under you ever animates.
  const sink = useSharedValue(sunk ? 1 : 0);

  useEffect(() => {
    if (sunk) {
      sink.value = reduced ? 1 : withSpring(1, motion.springSoft);
    } else {
      sink.value = 0;
    }
    return () => cancelAnimation(sink);
  }, [sunk, reduced, sink]);

  // movement (dip, tilt, settle) rides the spring; the colour change is a
  // plain crossfade of two stacked hearts, driven by the same progress
  const sinkStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(sink.value, [0, 1], [0, 2.5]) },
      { rotate: `${interpolate(sink.value, [0, 1], [0, -18])}deg` },
      { scale: interpolate(sink.value, [0, 1], [1, 0.85]) },
    ],
  }));
  const litStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sink.value, [0, 1], [1, 0]),
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sink.value, [0, 1], [0, 0.55]),
  }));

  return (
    <Animated.View style={[{ width: PIP, height: PIP }, sinkStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
        <Heart size={PIP} fill={colors.silver} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, litStyle]}>
        <Heart size={PIP} fill={colors.blue} />
      </Animated.View>
    </Animated.View>
  );
}

export function FleetPips({ total, lost, label }: { total: number; lost: number; label: string }) {
  const count = Math.max(0, Math.round(total));
  const sunkCount = Math.max(0, Math.min(count, Math.round(lost)));
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <Text variant="overline" color={colors.muted} style={{ textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View
        accessible
        accessibilityLabel={`${count - sunkCount} hearts afloat, ${sunkCount} gone under`}
        style={{ flexDirection: 'row', gap: spacing.sm }}
      >
        {Array.from({ length: count }).map((_, i) => (
          // lit hearts first, the sunk ones trail off to the right; when `lost`
          // grows, exactly one pip's `sunk` flips and only that heart animates
          <Pip key={i} sunk={i >= count - sunkCount} />
        ))}
      </View>
    </View>
  );
}
