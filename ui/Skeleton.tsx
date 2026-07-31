// ui/Skeleton.tsx — loading shimmer; every async path has a loading state (§6).
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, radius } from '../theme/theme';

export function Skeleton({ width = '100%', height = 16, style }: { width?: number | `${number}%`; height?: number; style?: ViewStyle }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.35, 0.8]),
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View
        style={[
          { width, height, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
          style,
        ]}
      />
    </Animated.View>
  );
}
