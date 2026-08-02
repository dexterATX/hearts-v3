// features/home/ui/DaysTogether.tsx — the day counter at the top of home.
// The screen's showpiece: Sora numerals at mega size counting up on a soft
// spring, two blue halos breathing behind them, and a hairline of the one
// blue that draws in once the number lands. Chromeless — no card, no frame;
// the obsidian page itself is the surface.
import { useEffect } from 'react';
import { TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Reveal, Skeleton, Text } from '../../../ui';
import { colors, motion, spacing, type } from '../../../theme/theme';
import { daysTogether, daysLabel } from '../model';

// module scope: creating the animated component inside render would remount
// the input every pass and drop the native drive
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// halo diameters — a wide soft wash and a brighter core, centred on the numeral
const HALO_OUTER = spacing.huge * 5;
const HALO_INNER = spacing.huge * 2.5;

// the one explicitly decorative loop on the page: a slow, symmetric breath
const BREATH = { duration: 2600, easing: Easing.inOut(Easing.quad) };

export function DaysTogether({
  anniversary,
  loading = false,
}: {
  anniversary: string | null;
  loading?: boolean;
}) {
  const days = daysTogether(anniversary);

  // hooks all at the top, before any early return; the shared values are
  // written only inside this effect — never in the render body
  const count = useSharedValue(0);
  const enter = useSharedValue(0);
  const breathe = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (days === null) return;
    if (reduced) {
      // reduced motion: land instantly — no count-up, no breathing loop
      count.value = days;
      enter.value = 1;
      breathe.value = 0;
      return;
    }
    enter.value = withSequence(
      withTiming(0, { duration: 0 }), // replay the entrance when `days` changes
      withDelay(80, withSpring(1, motion.springSoft)),
    );
    count.value = withDelay(150, withSpring(days, motion.springSoft));
    breathe.value = withDelay(
      1200,
      withRepeat(withSequence(withTiming(1, BREATH), withTiming(0, BREATH)), -1, false),
    );
    return () => cancelAnimation(breathe);
  }, [days, reduced, count, enter, breathe]);

  // Android only re-renders an animated TextInput through `text`; iOS also
  // needs `defaultValue` — drive both or one platform shows a frozen number.
  const numeralProps = useAnimatedProps(() => {
    const text = String(Math.max(0, Math.floor(count.value)));
    return { text, defaultValue: text };
  });

  const numeralWrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [16, 0]) },
      { scale: interpolate(enter.value, [0, 1], [0.96, 1]) },
    ],
  }));

  const haloOuterStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.55, 1]) * enter.value,
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1, 1.07]) }],
  }));

  const haloInnerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.35, 1]) * enter.value,
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1, 1.035]) }],
  }));

  // the hairline stays collapsed until the numeral has mostly landed
  const hairlineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(enter.value, [0, 0.6, 1], [0, 0, 1]) }],
  }));

  const container = {
    alignItems: 'center' as const,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  };

  if (loading) {
    return (
      <View style={container}>
        <Skeleton width={88} height={44} />
        <Skeleton width={140} height={11} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  if (days === null) {
    // no anniversary set: quiet plain copy, none of the choreography
    return (
      <View style={container}>
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
          {daysLabel(null)}
        </Text>
      </View>
    );
  }

  return (
    <Reveal delay={0} dy={18} soft>
      <View
        style={container}
        accessibilityRole="header"
        accessibilityLabel={`${days} days together`}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: HALO_OUTER,
                height: HALO_OUTER,
                borderRadius: HALO_OUTER / 2,
                backgroundColor: colors.blueSoft,
                left: '50%',
                top: '50%',
                marginLeft: -HALO_OUTER / 2,
                marginTop: -HALO_OUTER / 2,
              },
              haloOuterStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: HALO_INNER,
                height: HALO_INNER,
                borderRadius: HALO_INNER / 2,
                backgroundColor: colors.blueGlow,
                left: '50%',
                top: '50%',
                marginLeft: -HALO_INNER / 2,
                marginTop: -HALO_INNER / 2,
              },
              haloInnerStyle,
            ]}
          />
          <Animated.View style={numeralWrapStyle}>
            <AnimatedTextInput
              editable={false}
              pointerEvents="none"
              accessible={false}
              underlineColorAndroid="transparent"
              animatedProps={numeralProps}
              style={[
                { ...type.mega },
                {
                  color: colors.ink,
                  includeFontPadding: false,
                  padding: 0,
                  backgroundColor: 'transparent',
                  textAlign: 'center',
                  minWidth: 160,
                },
              ]}
            />
          </Animated.View>
        </View>
        <Animated.View
          style={[
            {
              width: 64,
              height: 1,
              backgroundColor: colors.blue,
              marginTop: spacing.md,
            },
            hairlineStyle,
          ]}
        />
        <Text
          variant="overline"
          color={colors.muted}
          style={{ textTransform: 'uppercase', marginTop: spacing.md }}
        >
          {days === 0 ? daysLabel(0) : 'days of us'}
        </Text>
      </View>
    </Reveal>
  );
}
