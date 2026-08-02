// ui/Skeleton.tsx — loading shimmer; every async path has a loading state (§6).
// Skeletons over spinners: the layout should not jump when the data lands.
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '../theme/theme';

export function Skeleton({
  width = '100%',
  height = 16,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
}) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.4, 0.9]),
  }));

  return (
    <Animated.View style={animatedStyle} accessibilityRole="progressbar" accessibilityLabel="loading">
      <View
        style={[
          { width, height, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
          style,
        ]}
      />
    </Animated.View>
  );
}

/** The shape most lists want: a title line and one or more shorter body lines. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 3,
        borderColor: colors.line,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <Skeleton width="55%" height={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={12} />
      ))}
    </View>
  );
}
