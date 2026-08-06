// features/games/ui/ArcadeHeader.tsx — the arcade's marquee: the page's one
// designed moment before the cards take over.
//
//   1. THE WORDMARK — 'the arcade' set in the display face and filled with
//      the SILVER_METAL ramp itself, so the type is metal. One sheen passes
//      across it on entrance, then never again.
//   2. THE TROPHY SHELF — the five glass icons (daisy, heart, ?, deck, pen)
//      leaning on each other at the right, popping in one by one over a soft
//      blue glow that keeps breathing after they land.
//   3. THE RULE — the brushed-silver hairline draws left to right and
//      dissolves before the edge. THE OPEN SIGN — the small blue dot on the
//      baseline, breathing.
//
// Nothing here scrolls or drifts. Reduced motion: everything static at its
// lit state; the two breath loops never start. Loops cancel on unmount.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Text } from '../../../ui';
import { colors, fonts, spacing } from '../../../theme/theme';
import { ARCADE_SPRING_SOFT, ARCADE_POP } from './arcadeMotion';
import { DaisyIcon, HeartsIcon, QuizIcon, DeckIcon, CanvasIcon } from './art/GameIcon';

// the wordmark: display face at 34, metal-filled
const WORDMARK_SIZE = 34;
const WORDMARK_H = 44;
// entrance choreography: wordmark, then the sheen, then the shelf, then the rule
const WORDMARK_DELAY_MS = 60;
const SHEEN_DELAY_MS = 550;
const SHEEN_MS = 900;
const SHELF_DELAY_MS = 380;
const SHELF_STAGGER_MS = 90;
const RULE_DELAY_MS = 420;
const RULE_H = 1.5;
// the open sign: dot, halo, and the breath it takes
const DOT = 7;
const HALO = 18;
const BREATH_MS = 1600;
const BREATH_LOW = 0.4;

// the shelf: five glass icons leaning together — daisy, heart, ?, deck, pen
const SHELF: { Icon: (p: { size?: number }) => React.ReactElement; rotate: number }[] = [
  { Icon: DaisyIcon, rotate: -14 },
  { Icon: HeartsIcon, rotate: 7 },
  { Icon: QuizIcon, rotate: -5 },
  { Icon: DeckIcon, rotate: 11 },
  { Icon: CanvasIcon, rotate: 16 },
];
const SHELF_ICON = 32;
const SHELF_OVERLAP = -14;
// the breathing pool of light under the shelf
const POOL_W = 170;
const POOL_H = 60;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

export function ArcadeHeader() {
  const reduced = useReducedMotion();
  const [ids] = useState(() => {
    const n = uid++;
    return { word: `ahw${n}`, sheen: `ahs${n}`, rule: `ahr${n}`, pool: `ahp${n}` };
  });
  const [width, setWidth] = useState(0);

  // entrance progress: 0 approaching → 1 seated (drives the wordmark)
  const enter = useSharedValue(reduced ? 1 : 0);
  // the sheen's one pass across the metal type
  const sheen = useSharedValue(0);
  // the shelf icons pop in one by one
  const pops = [
    useSharedValue(1),
    useSharedValue(1),
    useSharedValue(1),
    useSharedValue(1),
    useSharedValue(1),
  ];
  // the rule's draw: 0 undrawn → 1 drawn across
  const draw = useSharedValue(reduced ? 1 : 0);
  // the open sign's breath + the shelf glow's breath
  const breath = useSharedValue(1);
  const glowBreath = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      enter.value = 1;
      draw.value = 1;
      return;
    }
    enter.value = withDelay(WORDMARK_DELAY_MS, withSpring(1, ARCADE_SPRING_SOFT));
    sheen.value = withDelay(
      SHEEN_DELAY_MS,
      withTiming(1, { duration: SHEEN_MS, easing: Easing.inOut(Easing.quad) }),
    );
    draw.value = withDelay(RULE_DELAY_MS, withSpring(1, ARCADE_SPRING_SOFT));
    pops.forEach((pop, i) => {
      pop.value = 0;
      pop.value = withDelay(SHELF_DELAY_MS + i * SHELF_STAGGER_MS, withSpring(1, ARCADE_POP));
    });
  }, [reduced, enter, sheen, draw, pops]);

  useEffect(() => {
    // reduced motion: everything simply stays lit — no loop ever starts
    if (reduced) return;
    breath.value = withRepeat(
      withTiming(BREATH_LOW, { duration: BREATH_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    glowBreath.value = withRepeat(
      withTiming(0.6, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(breath);
      cancelAnimation(glowBreath);
    };
  }, [reduced, breath, glowBreath]);

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 10 }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sheen.value, [0, 1], [-240, 240]) }],
  }));
  const ruleStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: draw.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: breath.value }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [BREATH_LOW, 1], [0, 0.8]),
  }));
  const poolStyle = useAnimatedStyle(() => ({ opacity: 0.8 * glowBreath.value }));

  const contentW = Math.max(0, width - spacing.lg * 2);

  return (
    <View
      style={{ paddingTop: spacing.xl, paddingBottom: spacing.lg }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          paddingHorizontal: spacing.lg,
        }}
      >
        <Animated.View style={[{ flex: 1 }, wordmarkStyle]}>
          {/* the metal wordmark: SILVER_METAL's ramp fills the type, and one
              sheen crosses it on arrival (then the band parks offscreen) */}
          <Svg width={260} height={WORDMARK_H}>
            <Defs>
              <LinearGradient id={ids.word} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
                <Stop offset="16%" stopColor="#C6CFDD" stopOpacity={1} />
                <Stop offset="34%" stopColor="#6E7A8C" stopOpacity={1} />
                <Stop offset="50%" stopColor="#AEBACB" stopOpacity={1} />
                <Stop offset="66%" stopColor="#49525F" stopOpacity={1} />
                <Stop offset="84%" stopColor="#C6CFDD" stopOpacity={1} />
                <Stop offset="100%" stopColor="#F4F8FF" stopOpacity={0.95} />
              </LinearGradient>
              <LinearGradient id={ids.sheen} x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="42%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.5} />
                <Stop offset="58%" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <SvgText
              x={0}
              y={WORDMARK_SIZE}
              fontSize={WORDMARK_SIZE}
              fontFamily={fonts.display}
              letterSpacing={-0.7}
              fill={`url(#${ids.word})`}
            >
              the arcade
            </SvgText>
            {!reduced ? (
              <Animated.View style={[sheenStyle, { position: 'absolute' }]}>
                <Svg width={120} height={WORDMARK_H}>
                  <Rect x={0} y={0} width={120} height={WORDMARK_H} fill={`url(#${ids.sheen})`} />
                </Svg>
              </Animated.View>
            ) : null}
          </Svg>
          <Text variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
            games for the two of you
          </Text>
        </Animated.View>

        {/* the trophy shelf: five glass icons leaning together over a
            breathing pool of light */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              {
                position: 'absolute',
                right: -10,
                bottom: -14,
                width: POOL_W,
                height: POOL_H,
              },
              poolStyle,
            ]}
          >
            <Svg width={POOL_W} height={POOL_H}>
              <Defs>
                <RadialGradient id={ids.pool} cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0" stopColor={colors.blue} stopOpacity={0.22} />
                  <Stop offset="0.7" stopColor={colors.blue} stopOpacity={0.07} />
                  <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={POOL_W} height={POOL_H} fill={`url(#${ids.pool})`} />
            </Svg>
          </Animated.View>
          {SHELF.map(({ Icon, rotate }, i) => (
            <ShelfIcon
              key={rotate}
              rotate={rotate}
              pop={pops[i] as (typeof pops)[number]}
              Icon={Icon}
            />
          ))}
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          marginTop: spacing.md,
        }}
      >
        {/* the metal rule draws itself left to right, dissolving before the edge */}
        <Animated.View
          style={[{ flex: 1, height: RULE_H, transformOrigin: '0% 50%' }, ruleStyle]}
        >
          {contentW > 0 ? (
            <Svg width={contentW - HALO} height={RULE_H}>
              <Defs>
                <LinearGradient id={ids.rule} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
                  <Stop offset="0.16" stopColor={colors.silver} stopOpacity={0.6} />
                  <Stop offset="0.34" stopColor="#6E7A8C" stopOpacity={0.6} />
                  <Stop offset="0.5" stopColor="#AEBACB" stopOpacity={0.5} />
                  <Stop offset="0.66" stopColor="#49525F" stopOpacity={0.45} />
                  <Stop offset="0.84" stopColor={colors.silver} stopOpacity={0.3} />
                  <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={contentW - HALO} height={RULE_H} fill={`url(#${ids.rule})`} />
            </Svg>
          ) : null}
        </Animated.View>
        {/* the open sign, lit at the rule's end */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' }}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: HALO,
                height: HALO,
                borderRadius: HALO / 2,
                backgroundColor: colors.blueGlow,
              },
              haloStyle,
            ]}
          />
          <Animated.View
            style={[
              { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.blue },
              dotStyle,
            ]}
          />
        </View>
      </View>
    </View>
  );
}

/** one icon on the shelf: pops in on the pop spring, leans at its angle */
function ShelfIcon({
  Icon,
  rotate,
  pop,
}: {
  Icon: (p: { size?: number }) => React.ReactElement;
  rotate: number;
  pop: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { rotate: `${rotate}deg` }],
  }));
  return (
    <Animated.View style={[{ marginLeft: SHELF_OVERLAP }, style]}>
      <Icon size={SHELF_ICON} />
    </Animated.View>
  );
}
