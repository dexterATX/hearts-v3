// features/games/battleship/sea3d/layers/HorizonGlow.tsx — depth cues for the
// tilted sea plane: a two-band fog over the far edge, a corner vignette, and
// one breathing glow line where the water meets the haze.
//
// The fog stacks two bg→transparent gradients: a tall haze held to the top
// third (the far edge at the ~34° tilt) and a deeper, shorter veil hugging
// the edge itself, so distant water sinks further into the murk than one
// band alone could push it. The vignette is a radial dark (0.22) that pools
// in the corners. At the fog's base sits the atmospheric glow line — a soft
// blue band breathing 0.1 ↔ 0.25 on a 5s yoyo, the layer's only loop
// (withTiming on opacity, reversed so it never wraps). Reduced motion holds
// a static frame: same fog, same vignette, the line parked at mid opacity.
// Numeric svg props only — no transform ever passes through animatedProps.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../../../theme/theme';

const FOG_TOP_OPACITY = 0.35;
const VIGNETTE_OPACITY = 0.22;
const LINE_MIN = 0.15;
const LINE_MAX = 0.3;
const BREATH_HALF_MS = 2000; // there and back is one 4s breath

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function HorizonGlow({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { fog: `hzfog${n}`, vig: `hzvig${n}` };
  });

  const breath = useSharedValue(reduced ? 0.5 : 0);

  useEffect(() => {
    if (reduced) {
      breath.value = 0.5; // parked at mid opacity — the static frame
      return;
    }
    breath.value = 0;
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_HALF_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true, // yoyo: the loop turns around instead of wrapping
    );
    return () => cancelAnimation(breath);
  }, [reduced, breath]);

  const lineProps = useAnimatedProps(() => ({
    opacity: interpolate(breath.value, [0, 1], [LINE_MIN, LINE_MAX]),
  }));

  const fogH = size / 3;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
      pointerEvents="none"
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={ids.fog} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={FOG_TOP_OPACITY} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id={ids.vig} cx="0.5" cy="0.5" r="0.75">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={VIGNETTE_OPACITY} />
          </RadialGradient>
        </Defs>
        {/* far-edge fog, top third only */}
        <Rect x={0} y={0} width={size} height={fogH} fill={`url(#${ids.fog})`} />
        {/* radial vignette pooling in the corners */}
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${ids.vig})`} />
        {/* the horizon hairline, breathing where the sea meets the fog */}
        <AnimatedRect
          x={0}
          y={fogH - 0.5}
          width={size}
          height={1}
          fill={colors.blueSoft}
          opacity={LINE_MIN}
          animatedProps={lineProps}
        />
      </Svg>
    </View>
  );
}
