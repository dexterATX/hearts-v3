// features/games/battleship/sea3d/hud/TurnRibbon.tsx — whose shot it is, in one
// slim pill floating above the sea. It replaces the flat UI's accent/quiet
// turn card, so it keeps that grammar: blue when the move is yours, muted
// when you are watching. The one ambient loop is the breathing dot; the copy
// swap is a fade through invisible so no text ever slides or jumps.
import { useEffect, useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
  withRepeat,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text } from '../../../../../ui';
import { colors, spacing, radius, motion } from '../../../../../theme/theme';
import { SEA_SOFT } from '../seaMotion';

const COPY = {
  mine: 'your shot. pick a wave',
  theirs: 'their shot. watch the sea',
  answering: 'answering…',
} as const;

const pill = {
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'center',
  gap: spacing.sm,
  maxWidth: '90%',
  backgroundColor: colors.surfaceAlt,
  borderRadius: radius.pill,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.lg,
  borderWidth: 1,
} as const;

export function TurnRibbon({
  myTurn,
  waitingOnSetter,
}: {
  myTurn: boolean;
  waitingOnSetter: boolean;
}) {
  const reduced = useReducedMotion();
  // a pending shot speaks first (the flat screen's order): while a shot is in
  // the air the sea is answering, no matter whose finger fired it — the turn
  // only flips when the verdict lands, so myTurn alone would misname the wait
  const target = waitingOnSetter ? COPY.answering : myTurn ? COPY.mine : COPY.theirs;
  // `label` lags `target` by one fade: the old words leave before the new
  // ones arrive, so the swap reads as a breath, not a flicker.
  const [label, setLabel] = useState(target);

  const enterY = useSharedValue(reduced ? 0 : spacing.sm);
  const enterO = useSharedValue(0);
  const swapO = useSharedValue(1);
  const breathe = useSharedValue(0);

  // Entrance: a short rise (spring — it is movement) under a fade.
  useEffect(() => {
    enterO.value = withTiming(1, { duration: motion.screenMs });
    if (!reduced) enterY.value = withSpring(0, SEA_SOFT);
  }, [reduced, enterO, enterY]);

  // The dot breathes — the ribbon's single ambient loop, cancelled on unmount.
  useEffect(() => {
    if (reduced) return;
    breathe.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    return () => cancelAnimation(breathe);
  }, [reduced, breathe]);

  // Copy swap: fade out, trade the text while invisible, fade back in.
  // The same effect also covers the rapid-toggle case — if the turn flips
  // back before the fade-out lands, cleanup cancels it (finished=false, no
  // setLabel) and the matching branch simply fades the current words in.
  useEffect(() => {
    if (target === label) {
      swapO.value = withTiming(1, { duration: motion.fadeMs });
      return;
    }
    swapO.value = withTiming(0, { duration: motion.fadeMs }, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(setLabel, target);
    });
    return () => cancelAnimation(swapO);
  }, [target, label, swapO]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterO.value,
    transform: [{ translateY: enterY.value }],
  }));
  const swapStyle = useAnimatedStyle(() => ({ opacity: swapO.value }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.55, 1]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.8, 1.25]) }],
  }));

  const tone = myTurn ? colors.blue : colors.muted;

  return (
    <Animated.View
      style={[pill, { borderColor: myTurn ? colors.lineBright : colors.line }, enterStyle]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      {/* the turn signal: blue when the sea is yours, quiet when it is not */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            width: spacing.sm,
            height: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: myTurn ? colors.blue : colors.faint,
          },
          reduced ? undefined : dotStyle,
        ]}
      />
      <Animated.View style={swapStyle}>
        <Text variant="small" weight="medium" color={tone} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
