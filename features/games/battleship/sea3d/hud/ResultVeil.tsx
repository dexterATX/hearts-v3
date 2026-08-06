// features/games/battleship/sea3d/hud/ResultVeil.tsx — the end state. A soft
// full-screen veil settles over the sea table, the engine's summary rises in
// display type, and one slow heart keeps beating behind it. Affectionate,
// never a loser: the copy arrives finished from the engine, we only render it.
//
// Motion budget: two shared values, three loops at most (fade in once, rise
// spring once, one reversed pulse loop). Fades and the slow pulse are timing;
// the rise is a spring. Reduced motion: everything lands at its final frame,
// no pulse, nothing to cancel.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Button, Text } from '../../../../../ui';
import { colors, motion, spacing } from '../../../../../theme/theme';

// per-instance gradient ids: two veils in one tree must never share one
let veilUid = 0;

// a heart, drawn once in a 100×100 box and scaled to taste
const HEART_PATH =
  'M50 88 C20 64 8 44 8 30 C8 16 20 8 30 8 C38 8 46 13 50 21 C54 13 62 8 70 8 C80 8 92 16 92 30 C92 44 80 64 50 88 Z';

const HEART_SIZE = 220;
const PULSE_MS = 1600; // one slow beat out; withRepeat(reverse) brings it home
const FADE_MS = 600;

export function ResultVeil({ summary, onExit }: { summary: string; onExit: () => void }) {
  const reduced = useReducedMotion();
  const [uid] = useState(() => ++veilUid);
  const glowId = `veilGlow${uid}`;

  // entrance: fades are timing, the rise is movement so it gets the spring
  const fade = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(reduced ? 1 : 0);
  // the heartbeat: 0 → 1 → 0 forever
  const beat = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      fade.value = 1;
      rise.value = 1;
      return;
    }
    fade.value = withTiming(1, { duration: FADE_MS });
    rise.value = withSpring(1, motion.springSoft);
    beat.value = withRepeat(withTiming(1, { duration: PULSE_MS }), -1, true);
    return () => {
      cancelAnimation(fade);
      cancelAnimation(rise);
      cancelAnimation(beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // the summary rises as it fades in — movement gets the spring, not the fade
  const riseStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - rise.value) * spacing.xl }],
  }));

  const heartStyle = useAnimatedStyle(() => ({
    // the beat is felt as scale; the glow breathes with it
    transform: [{ scale: 1 + beat.value * 0.06 }],
    opacity: 0.5 + beat.value * 0.2,
  }));

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5,7,12,0.85)', // colors.bg at 0.85
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
      }}
    >
      {/* blur substitute: one wide radial glow bleeding out from the centre */}
      <Svg
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        width="100%"
        height="100%"
      >
        <Defs>
          <RadialGradient id={glowId} cx="50%" cy="46%" r="65%">
            <Stop offset="0" stopColor={colors.blue} stopOpacity={0.16} />
            <Stop offset="0.55" stopColor={colors.blue} stopOpacity={0.05} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${glowId})`} />
      </Svg>

      {/* the slow heart, beating behind the words */}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ position: 'absolute' }, heartStyle]}
      >
        <Svg width={HEART_SIZE} height={HEART_SIZE} viewBox="0 0 100 100">
          <Path d={HEART_PATH} fill={colors.blueSoft} stroke={colors.blue} strokeWidth={1.5} />
        </Svg>
      </Animated.View>

      <Animated.View style={[{ alignItems: 'center', gap: spacing.xxl }, riseStyle]}>
        <Text variant="display" style={{ textAlign: 'center' }}>
          {summary}
        </Text>
        <Button label="back to the arcade" tone="ghost" onPress={onExit} />
      </Animated.View>
    </View>
  );
}
