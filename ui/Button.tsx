// ui/Button.tsx — every interactive element gets a press spring + haptic (§6).
// Reanimated 4 / worklets: withSpring config straight from theme tokens.
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, motion } from '../theme/theme';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  tone?: 'rose' | 'ghost' | 'gold';
  haptic?: 'selection' | 'medium' | 'success' | 'heavy';
  style?: ViewStyle;
};

export function Button({ label, tone = 'rose', haptic = 'selection', onPress, style, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const fire = async () => {
    if (haptic === 'selection') await Haptics.selectionAsync();
    else if (haptic === 'success') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else await Haptics.impactAsync(
      haptic === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
    );
  };

  const bg = tone === 'rose' ? colors.roseDeep : tone === 'gold' ? colors.gold : 'transparent';
  const fg = tone === 'gold' ? colors.bg : tone === 'ghost' ? colors.rose : colors.ink;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => {
        scale.value = withSpring(motion.pressScale, motion.spring);
        void fire();
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={onPress}
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          alignItems: 'center',
          borderWidth: tone === 'ghost' ? 1 : 0,
          borderColor: colors.line,
        },
        animatedStyle,
        style,
      ]}
      {...rest}
    >
      <Text variant="body" color={fg} style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
