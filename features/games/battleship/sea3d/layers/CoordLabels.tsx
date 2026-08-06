// battleship · sea table — board edge coordinates.
// A–H across the top, 1–8 down the left, floating just outside the sea.
// One entrance only: each label fades in and rises a few pixels, staggered
// 20ms apart — the fade is a timing, the rise a spring (movement always gets
// the spring, §5) — then stays perfectly static (far-view LOD budget).
// Reduced motion renders the final frame instantly.

import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, type } from '../../../../../theme/theme';
import { SEA_SOFT } from '../seaMotion';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

const STAGGER_MS = 20;
const ENTRANCE_MS = 320;
const RISE_PX = 6;
const EDGE_GAP = 6;
const NUM_WIDTH = 14;

function EdgeLabel(props: { text: string; index: number; style: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const fade = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(reduced ? 0 : RISE_PX);

  useEffect(() => {
    if (reduced) {
      fade.value = 1;
      rise.value = 0;
      return;
    }
    fade.value = withDelay(props.index * STAGGER_MS, withTiming(1, { duration: ENTRANCE_MS }));
    rise.value = withDelay(props.index * STAGGER_MS, withSpring(0, SEA_SOFT));
    return () => {
      cancelAnimation(fade);
      cancelAnimation(rise);
    };
    // entrance plays exactly once on mount; index never changes per instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, fade, rise]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: rise.value }],
  }));

  return (
    <Animated.View style={[styles.label, props.style, animStyle]}>
      <Text style={styles.text}>{props.text}</Text>
    </Animated.View>
  );
}

export function CoordLabels({ size }: { size: number }): React.JSX.Element {
  const cell = size / 8;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { width: size, height: size }]}
    >
      {LETTERS.map((letter, i) => (
        <EdgeLabel
          key={letter}
          text={letter}
          index={i}
          style={{
            left: i * cell,
            top: -(type.overline.lineHeight + EDGE_GAP),
            width: cell,
            alignItems: 'center',
          }}
        />
      ))}
      {NUMBERS.map((num, i) => (
        <EdgeLabel
          key={num}
          text={num}
          index={LETTERS.length + i}
          style={{
            top: i * cell,
            left: -(NUM_WIDTH + EDGE_GAP),
            width: NUM_WIDTH,
            height: cell,
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  label: {
    position: 'absolute',
  },
  text: {
    ...type.overline,
    color: colors.faint,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
