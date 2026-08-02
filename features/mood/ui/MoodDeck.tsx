// features/mood/ui/MoodDeck.tsx — the mood picker as a deck of cards.
//
// Seven cards, fanned like a hand: each undercard sits a slot lower, smaller,
// dimmer, and tilted a degree further. The top card is metal and live — it
// tilts in 3D under your finger (perspective transform), ticks a detent when
// the drag passes the throw threshold, and on a committed flick it soars up
// and away, shrinking and fading like it's flying to their phone. The deck
// restacks on soft springs: thrown card to the back, everyone rises a slot.
// Tap throws too. Horizontal-only activation so the page's scroll always wins.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MetallicFrame, MoodBunny, SILVER_METAL, Text } from '../../../ui';
import { colors, motion, radius, spacing } from '../../../theme/theme';
import { MOODS, type MoodKey } from '../model';

// throw rules: distance, velocity, or a decisive upward flick
const FLING_DIST = 90;
const FLING_VELOCITY = 800;
const THROW_UP = -120;
// deck depth cues per slot back from the top
const SLOT_Y = 14;
const SLOT_SCALE = 0.05;
const SLOT_DIM = 0.12;
const SLOT_TILT = 1.6; // degrees of fan per slot, alternating sides
const VISIBLE = 4; // deeper cards are invisible behind the stack

type DeckCardProps = {
  mood: (typeof MOODS)[number];
  index: number;
  top: boolean;
  cardW: number;
  cardH: number;
  onSend: (k: MoodKey) => void;
};

function DeckCard({ mood, index, top, cardW, cardH, onSend }: DeckCardProps) {
  const reduced = useReducedMotion();
  // slot position — spring-animated on every restack; +4 on mount so the deck
  // drops in from below the first time it appears
  const pos = useSharedValue(index + 4);
  // gesture state (top card only)
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const armed = useSharedValue(0); // detent tick fires once per drag
  const hint = useSharedValue(1); // the "flick me" caption, gone on first grab
  const pop = useSharedValue(1); // rise-to-the-top overshoot on restack

  useEffect(() => {
    pos.value = withSpring(index, motion.springSoft);
    // a new slot means a clean slate: flight offsets never follow the card
    x.value = 0;
    y.value = 0;
    if (top && !reduced) {
      // just became the top card — pop up to meet the finger
      pop.value = 0.94;
      pop.value = withSpring(1, motion.spring);
    }
  }, [index, top, reduced, pos, x, y, pop]);

  const flingOut = (dirX: number, dirY: number) => {
    'worklet';
    scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Medium);
    // the soar: out sideways and UP, like it leaves for their phone
    x.value = withTiming(dirX, { duration: 300 });
    y.value = withTiming(dirY - 620, { duration: 340 }, (finished) => {
      if (finished) scheduleOnRN(onSend, mood.key);
    });
  };

  const pan = Gesture.Pan()
    .enabled(top && !reduced)
    .activeOffsetX([-12, 12]) // sideways only — vertical drags scroll the page
    .failOffsetY([-24, 24])
    .onBegin(() => {
      scheduleOnRN(Haptics.selectionAsync);
      hint.value = withTiming(0, { duration: motion.fadeMs });
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      // one tick the moment the drag becomes a committed throw
      if (armed.value === 0 && Math.abs(e.translationX) > FLING_DIST) {
        armed.value = 1;
        scheduleOnRN(Haptics.selectionAsync);
      }
    })
    .onEnd((e) => {
      armed.value = 0;
      const thrown =
        Math.abs(e.translationX) > FLING_DIST ||
        Math.abs(e.velocityX) > FLING_VELOCITY ||
        e.translationY < THROW_UP;
      if (thrown) {
        const dir = e.translationX !== 0 ? Math.sign(e.translationX) : Math.sign(e.velocityX || 1);
        flingOut(dir * 560, e.translationY);
      } else {
        x.value = withSpring(0, motion.spring);
        y.value = withSpring(0, motion.spring);
      }
    });

  const tap = Gesture.Tap().enabled(top).onEnd(() => {
    if (reduced) {
      scheduleOnRN(onSend, mood.key);
    } else {
      flingOut(560, 0);
    }
  });

  const style = useAnimatedStyle(() => {
    const p = pos.value;
    const fanSide = index % 2 === 0 ? -1 : 1;
    const baseTransform = [
      { translateY: p * SLOT_Y },
      { translateX: fanSide * p * 3 },
      { rotate: `${fanSide * p * (SLOT_TILT / 2)}deg` },
      { scale: Math.max(0.8, 1 - p * SLOT_SCALE) },
    ];
    const baseOpacity = interpolate(p, [VISIBLE - 1, VISIBLE], [1, 0], Extrapolation.CLAMP);
    if (!top) {
      return { transform: baseTransform, opacity: baseOpacity };
    }
    // the flight read: sideways tilt from x, soar shrink+fade from y
    const soaring = y.value < -1;
    return {
      transform: [
        { perspective: 800 },
        ...baseTransform,
        { translateX: x.value },
        { translateY: y.value },
        { rotate: `${interpolate(x.value, [-240, 240], [-12, 12], Extrapolation.CLAMP)}deg` },
        {
          rotateY: `${interpolate(x.value, [-240, 240], [-14, 14], Extrapolation.CLAMP)}deg`,
        },
        {
          rotateX: `${interpolate(y.value, [-240, 240], [10, -10], Extrapolation.CLAMP)}deg`,
        },
        { scale: pop.value * interpolate(y.value, [-560, 0], [0.72, 1], Extrapolation.CLAMP) },
      ],
      opacity:
        baseOpacity *
        (soaring ? interpolate(y.value, [-560, -420, 0], [0, 1, 1], Extrapolation.CLAMP) : 1),
    };
  });

  const dimStyle = useAnimatedStyle(() => ({
    opacity: Math.min(0.5, pos.value * SLOT_DIM),
  }));

  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));

  const face = (
    <>
      <MoodBunny mood={mood.key} size={cardW * 0.4} />
      <Text
        variant="body"
        weight="displaySemi"
        color={top ? colors.ink : colors.muted}
        style={{ letterSpacing: 0.3 }}
      >
        {mood.label}
      </Text>
      {top ? (
        <Animated.View style={hintStyle}>
          <Text variant="caption" color={colors.faint} style={{ marginTop: spacing.xs }}>
            flick or tap to send
          </Text>
        </Animated.View>
      ) : null}
      {/* depth dim: deeper slots sink further into the page */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.bg, borderRadius: radius.lg },
          dimStyle,
        ]}
      />
    </>
  );

  const cardBox = {
    width: cardW,
    height: cardH,
    alignSelf: 'center' as const,
  };

  const cardFace = top ? (
    // the top card is metal — one shine on the deck, like the MoodCard
    <MetallicFrame
      cornerRadius={radius.lg}
      stops={SILVER_METAL}
      fill={colors.raised}
      shine={!reduced}
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        {face}
      </View>
    </MetallicFrame>
  ) : (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      {face}
    </View>
  );

  // undercards are pure visuals — no gesture machinery attached at all
  if (!top) {
    return <Animated.View style={[StyleSheet.absoluteFill, cardBox, style]}>{cardFace}</Animated.View>;
  }

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`send mood ${mood.label}`}
        style={[StyleSheet.absoluteFill, cardBox, style]}
      >
        {cardFace}
      </Animated.View>
    </GestureDetector>
  );
}

export function MoodDeck({
  onSend,
  cardW = 220,
}: {
  onSend: (k: MoodKey) => void;
  cardW?: number;
}) {
  const [order, setOrder] = useState<MoodKey[]>(MOODS.map((m) => m.key));
  const cardH = cardW * 1.18;
  // the deck's box: card + the deepest visible slot's drop
  const stackH = cardH + (VISIBLE - 1) * SLOT_Y;

  const completeSend = (key: MoodKey) => {
    onSend(key);
    // thrown card goes to the back; every other card rises a slot (each card's
    // `pos` spring animates the restack; its x/y offsets reset in the effect)
    setOrder((prev) => {
      const next = prev.filter((k) => k !== key);
      return [...next, key];
    });
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: cardW, height: stackH }}>
        {/* deepest card paints first so the top card sits on top naturally */}
        {order
          .map((key, i) => {
            const mood = MOODS.find((m) => m.key === key) as (typeof MOODS)[number];
            return (
              <DeckCard
                key={key}
                mood={mood}
                index={i}
                top={i === 0}
                cardW={cardW}
                cardH={cardH}
                onSend={completeSend}
              />
            );
          })
          .reverse()}
      </View>
    </View>
  );
}
