// ui/Sheet.tsx — bottom sheet built on primitives (no external dep).
import { useEffect } from 'react';
import { Modal, Pressable, View, type ViewProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing, motion, elevation } from '../theme/theme';

export function Sheet({
  visible,
  onClose,
  children,
  ...rest
}: ViewProps & { visible: boolean; onClose: () => void }) {
  const translateY = useSharedValue(400);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(visible ? 0 : 400, motion.spring);
    opacity.value = withTiming(visible ? 1 : 0, { duration: motion.screenMs });
  }, [visible, translateY, opacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[{ flex: 1, backgroundColor: 'rgba(2,4,8,0.78)' }, dimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <Animated.View
          style={[
            {
              backgroundColor: colors.raised,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              padding: spacing.xl,
              borderTopWidth: 3,
              borderColor: colors.lineBright,
            },
            elevation.sheet,
            sheetStyle,
          ]}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.lineBright,
              marginBottom: spacing.lg,
            }}
          />
          <View {...rest}>{children}</View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
