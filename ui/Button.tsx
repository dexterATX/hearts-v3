// ui/Button.tsx — every interactive element gets a press spring + haptic (§6).
// Reanimated 4 / worklets: withSpring config straight from theme tokens.
import { ActivityIndicator, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, motion } from '../theme/theme';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * primary   — the one action that matters on a screen. Filled blue.
 * secondary — equal-weight alternative. Silver hairline on glass.
 * ghost     — tertiary. No chrome until you touch it.
 * danger    — destructive only. Never for emphasis.
 */
type Tone = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.blueDeep, fg: colors.onBlue, border: 'transparent' },
  secondary: { bg: colors.surfaceAlt, fg: colors.ink, border: colors.lineBright },
  ghost: { bg: 'transparent', fg: colors.blue, border: 'transparent' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.danger },
};

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  tone?: Tone;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  haptic?: 'selection' | 'medium' | 'success' | 'heavy';
  style?: ViewStyle;
};

export function Button({
  label,
  tone = 'primary',
  size = 'md',
  icon,
  loading = false,
  haptic = 'selection',
  onPress,
  disabled,
  style,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // a pressed halo rather than a colour swap — reads as depth, not as a state bug
  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const t = TONES[tone];
  const isOff = !!disabled || loading;

  const fire = async () => {
    if (haptic === 'selection') await Haptics.selectionAsync();
    else if (haptic === 'success') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else await Haptics.impactAsync(
      haptic === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
    );
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff, busy: loading }}
      disabled={isOff}
      onPressIn={() => {
        if (isOff) return;
        scale.value = withSpring(motion.pressScale, motion.spring);
        glow.value = withTiming(1, { duration: motion.fadeMs });
        void fire();
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
        glow.value = withTiming(0, { duration: motion.fadeMs });
      }}
      onPress={onPress}
      style={[
        {
          backgroundColor: t.bg,
          borderRadius: radius.md,
          paddingVertical: size === 'lg' ? spacing.lg : spacing.md,
          paddingHorizontal: spacing.xl,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          borderWidth: t.border === 'transparent' ? 0 : 3,
          borderColor: t.border,
          opacity: isOff ? 0.45 : 1,
          overflow: 'hidden',
        },
        animatedStyle,
        style,
      ]}
      {...rest}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.blueGlow },
          haloStyle,
        ]}
      />
      {loading ? (
        <ActivityIndicator size="small" color={t.fg} />
      ) : icon ? (
        <Icon name={icon} size={18} color={t.fg} />
      ) : null}
      <Text variant={size === 'lg' ? 'heading' : 'body'} weight="semibold" color={t.fg}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
