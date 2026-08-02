// features/mood/ui/MoodChips.tsx — tap a chip → his phone buzzes instantly.
// These have to feel physical: press spring plus a blue halo that fades in
// under the finger, an echo ring that ripples out on send, and a brief "sent"
// flash, so the tap reads as pressure rather than as a colour swap.
import { StyleSheet, useWindowDimensions, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon, MoodBunny, Reveal, Text } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { MOODS, type MoodKey } from '../model';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Chip({
  mood,
  onPick,
  cardW,
  cardH,
}: {
  mood: (typeof MOODS)[number];
  onPick: (k: MoodKey) => void;
  cardW: number;
  cardH: number;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const fire = useSharedValue(0);
  const sent = useSharedValue(0);
  const reduced = useReducedMotion();

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(sent.value, [0, 1], [colors.surfaceAlt, colors.blueTint]),
    borderColor: interpolateColor(sent.value, [0, 1], [colors.line, colors.blue]),
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fire.value, [0, 0.15, 1], [0, 0.9, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(fire.value, [0, 1], [1, 2.1], Extrapolation.CLAMP) }],
  }));
  const sentStyle = useAnimatedStyle(() => ({ opacity: sent.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sent.value, [0, 1], [1, 0.35]),
  }));

  return (
    <View style={{ overflow: 'visible' }}>
      {/* echo ring: ripples outward on send, sits under the card */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ringStyle]}>
        <View style={{ flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.blue }} />
      </Animated.View>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`mood ${mood.label}`}
        onPressIn={() => {
          scale.value = withSpring(motion.pressScale, motion.spring);
          glow.value = withTiming(1, { duration: motion.fadeMs });
          void Haptics.selectionAsync();
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
          glow.value = withTiming(0, { duration: motion.fadeMs });
        }}
        onPress={() => {
          if (reduced) {
            // reduced motion: keep the halo + colour flash, skip ring/overshoot
            scale.value = withSpring(1, motion.spring);
          } else {
            scale.value = withSequence(withSpring(1.06, motion.springSoft), withSpring(1, motion.spring));
            fire.value = 0;
            fire.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });
          }
          glow.value = withTiming(0, { duration: motion.fadeMs });
          sent.value = withSequence(
            withTiming(1, { duration: motion.fadeMs }),
            withDelay(800, withTiming(0, { duration: 260 })),
          );
          onPick(mood.key);
        }}
        style={[
          {
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            borderRadius: radius.md,
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.sm,
            borderWidth: 1,
            overflow: 'hidden',
            // exact computed size — percentages + aspectRatio misbehave on-device
            width: cardW,
            height: cardH,
          },
          style,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.blueGlow }, haloStyle]}
        />
        {/* the bunny IS the mood — big in the square, label under it */}
        <Animated.View
          style={[{ alignItems: 'center', gap: spacing.sm }, contentStyle]}
        >
          <MoodBunny mood={mood.key} size={64} />
          <Text variant="body" weight="displaySemi" color={colors.ink} style={{ letterSpacing: 0.3 }}>
            {mood.label}
          </Text>
        </Animated.View>
        {/* sent flash: check + word ride the same opacity, content dims under it */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
            sentStyle,
          ]}
        >
          <Icon name="check" size={14} color={colors.blue} />
          <Text variant="caption" weight="semibold" color={colors.blue}>
            sent
          </Text>
        </Animated.View>
      </AnimatedPressable>
    </View>
  );
}

export function MoodChips({ onPick }: { onPick: (k: MoodKey) => void }) {
  const { width } = useWindowDimensions();
  // two cards per row, centered as a pair: (screen − side padding − one gap) / 2,
  // then a hair narrower so the pair visibly floats in the middle
  const cardW = (width - spacing.lg * 2 - spacing.lg) / 2;
  const cardH = cardW * 0.85; // content + ~1cm of vertical air, nothing more

  return (
    <Reveal delay={240} dy={12}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: spacing.lg,
          paddingHorizontal: spacing.lg,
          width: '100%',
        }}
      >
        {MOODS.map((m) => (
          <Chip key={m.key} mood={m} onPick={onPick} cardW={cardW} cardH={cardH} />
        ))}
      </View>
    </Reveal>
  );
}
