// features/games/battleship/sea3d/scenes/CloseDraft.tsx — a ghost heart deciding.
//
// The placement close-up: an outlined heart hovers over the water, its body
// a gradient lit toward the arcade's one top-left key light (KEY_LIGHT from
// features/games/ui/art/materials — same feature, §2.1) but held at ghost
// opacity, like it has not quite made up its mind. A soft glow stroke
// shimmers along the edge, breathing 0.3↔0.7 off the same reversed 1.6s
// driver as the heart's deciding swell (scale 0.96↔1.03, body 0.5↔0.9 — no
// linear easing anywhere). Underneath, two staggered SplashRings
// (../particles/SplashRing, half a cycle apart) ripple where the heart
// almost rests, squashed to the board's tilt, and a faint sparkle of four
// Sparks (../particles/Sparks) twinkles over the water.
//
// Loops: 4 of the close-up's budget — the pulse here, one driver per
// SplashRing, the sparks' own. Every loop reverses or wraps while invisible;
// reduced motion parks the pulse mid-cycle (the rings and sparks hold their
// own static frames) and every loop cancels on unmount. The pulse transform
// lives on an Animated.View style array (never a svg `transform` prop); svg
// animates numerically only — the shimmer stroke's opacity.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors, radius } from '../../../../../theme/theme';
import { KEY_LIGHT } from '../../../ui/art/materials';
import { SplashRing } from '../particles/SplashRing';
import { Sparks } from '../particles/Sparks';
import type { SceneProps } from '../seaTypes';

// the deciding pulse: 1.6s out, reversed back — slow into both ends
const PULSE_MS = 1600;

// the arcade's bezier heart (see features/games/ui/art/SeaArt.tsx) scaled ×4
// into a 48×44 box; the specular crescent is the key light's signature on the
// upper-left lobe
const HEART_PATH =
  'M24 44 C10 30 0 22.4 0 12.8 C0 4.8 6.4 0 12.8 0 C17.6 0 21.6 2.8 24 7.2 C26.4 2.8 30.4 0 35.2 0 C41.6 0 48 4.8 48 12.8 C48 22.4 38 30 24 44 Z';
const SPEC_PATH = 'M8.4 14.8 C9.2 10 12.8 6.4 17.2 6';

// the ghost body's gradient axis runs toward the shared key light and back,
// the same reach CloseHit's found heart takes
const BODY_REACH = 0.75;
const HEART_LIGHT = {
  x1: 0.5 + KEY_LIGHT.dx * BODY_REACH,
  y1: 0.5 + KEY_LIGHT.dy * BODY_REACH,
  x2: 0.5 - KEY_LIGHT.dx * BODY_REACH,
  y2: 0.5 - KEY_LIGHT.dy * BODY_REACH,
};

// heart geometry in the 100×100 scene box: heart spans x 26…74, y 16…60 with
// an 8–10 unit halo margin around it; rings sit just under the tip
const HEART_LEFT = 0.16;
const HEART_TOP = 0.08;
const HEART_W = 0.68;
const HEART_H = 0.6;

// the rings: an 80-unit box centred just under the heart's tip, squashed to
// the board's tilt so SplashRing's round ripple reads as water; the second
// ring lags by half the ring's 2.6s cycle so the two never phase-lock
const RING_CX = 50;
const RING_CY = 71;
const RING_BOX = 80;
const RING_SQUASH = 0.4;
const RING_STAGGER_MS = 1300;

const SPARK_COUNT = 4; // a faint sparkle, not a field

const AnimatedPath = Animated.createAnimatedComponent(Path);

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function CloseDraft({ size }: SceneProps) {
  const reduced = useReducedMotion();
  const k = size / 100;
  const [ids] = useState(() => {
    const n = uid++;
    return { glow: `draftglow${n}`, body: `draftbody${n}` };
  });

  // parked mid-cycle when reduced: the static frame is the composed middle
  const pulse = useSharedValue(reduced ? 0.5 : 0);

  useEffect(() => {
    if (reduced) {
      pulse.value = 0.5;
      return;
    }
    // reversed repeat: 0→1 in 1.6s then 1→0 in 1.6s, no jump at the wrap
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  // the deciding swell — a real RN transform array on a View, never svg
  const heartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.5, 0.9]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.96, 1.03]) }],
  }));

  // the shimmering edge: the soft glow stroke breathes 0.3↔0.7 off the same
  // driver, a numeric opacity only
  const shimmerProps = useAnimatedProps(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.3, 0.7]),
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // the scene's own corner coincides with the dive stage's inner clip
      // (SeaCloseUp's MetallicFrame: radius.lg − its 2dp FRAME)
      style={{ width: size, height: size, borderRadius: radius.lg - 2, overflow: 'hidden' }}
    >
      {/* the water remembering where the heart almost rested: two staggered
          splash rings in one tilt-squashed box — each ring owns its loop and
          its own reduced-motion frame; the squash is a static View style */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: (RING_CX - RING_BOX / 2) * k,
          top: (RING_CY - RING_BOX / 2) * k,
          width: RING_BOX * k,
          height: RING_BOX * k,
          transform: [{ scaleY: RING_SQUASH }],
        }}
      >
        <SplashRing size={RING_BOX * k} tint={colors.blue} />
        <View style={StyleSheet.absoluteFill}>
          <SplashRing size={RING_BOX * k} tint={colors.blue} delay={RING_STAGGER_MS} />
        </View>
      </View>

      {/* the ghost heart itself, halo and glow breathing with the pulse */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: HEART_LEFT * size,
            top: HEART_TOP * size,
            width: HEART_W * size,
            height: HEART_H * size,
          },
          heartStyle,
        ]}
      >
        <Svg width={HEART_W * size} height={HEART_H * size} viewBox="-10 -8 68 60">
          <Defs>
            <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={colors.blue} stopOpacity={0.3} />
              <Stop offset="0.55" stopColor={colors.blue} stopOpacity={0.12} />
              <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient
              id={ids.body}
              x1={HEART_LIGHT.x1}
              y1={HEART_LIGHT.y1}
              x2={HEART_LIGHT.x2}
              y2={HEART_LIGHT.y2}
            >
              <Stop offset="0" stopColor={colors.blue} />
              <Stop offset="1" stopColor={colors.blueDeep} />
            </LinearGradient>
          </Defs>
          <Ellipse cx={24} cy={22} rx={27} ry={23} fill={`url(#${ids.glow})`} />
          {/* the ghost body: the key-lit gradient at a whisper of opacity */}
          <Path d={HEART_PATH} fill={`url(#${ids.body})`} opacity={0.16} />
          {/* the shimmering edge: a soft glow stroke breathing under a
              confident thin one */}
          <AnimatedPath
            d={HEART_PATH}
            fill="none"
            stroke={colors.blue}
            strokeWidth={6.5}
            strokeLinejoin="round"
            animatedProps={shimmerProps}
          />
          <Path
            d={HEART_PATH}
            fill="none"
            stroke={colors.blue}
            strokeWidth={2.2}
            strokeLinejoin="round"
            opacity={0.95}
          />
          <Path
            d={SPEC_PATH}
            fill="none"
            stroke={colors.ink}
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.4}
          />
        </Svg>
      </Animated.View>

      {/* a faint sparkle over the water — its own driver, its own static
          frame under reduced motion */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Sparks size={size} count={SPARK_COUNT} />
      </View>
    </View>
  );
}
