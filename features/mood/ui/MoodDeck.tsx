// features/mood/ui/MoodDeck.tsx — the mood picker as a deck of cards.
//
// Seven cards, stacked and slightly fanned. The top card is live: drag it,
// and when the flick is committed (distance or velocity, in any direction) it
// flies off-screen, the mood is sent, and the card re-enters at the back of
// the deck — every card rises one slot on a soft spring. Tap works too, for
// anyone who never discovers the flick. All motion on the UI thread; the
// gesture never fights the page's vertical scroll (horizontal activation only,
// a strong upward flick also sends).
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
import { MoodBunny, Text } from '../../../ui';
import { colors, elevation, motion, radius, spacing } from '../../../theme/theme';
import { MOODS, type MoodKey } from '../model';

// how far/fast a drag must travel before it counts as a throw
const FLING_DIST = 90;
const FLING_VELOCITY = 800;
const THROW_UP = -120;
// deck depth cues per slot back from the top
const SLOT_Y = 14;
const SLOT_SCALE = 0.05;
const SLOT_FADE = 0.22;
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
  // gesture offsets (top card only)
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  useEffect(() => {
    pos.value = withSpring(index, motion.springSoft);
    // a new slot means a clean slate: the thrown card's flight offsets must
    // not follow it to the back of the deck
    x.value = 0;
    y.value = 0;
  }, [index, pos, x, y]);

  const flingOut = (dirX: number, dirY: number) => {
    'worklet';
    x.value = withTiming(dirX, { duration: 260 });
    y.value = withTiming(dirY, { duration: 260 }, (finished) => {
      if (finished) scheduleOnRN(onSend, mood.key);
    });
  };

  const pan = Gesture.Pan()
    .enabled(top && !reduced)
    // sideways-only activation: vertical drags belong to the page's scroll
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onBegin(() => {
      scheduleOnRN(Haptics.selectionAsync);
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
    })
    .onEnd((e) => {
      const thrown =
        Math.abs(e.translationX) > FLING_DIST ||
        Math.abs(e.velocityX) > FLING_VELOCITY ||
        e.translationY < THROW_UP;
      if (thrown) {
        const dir = e.translationX !== 0 ? Math.sign(e.translationX) : Math.sign(e.velocityX || 1);
        flingOut(dir * 560, e.translationY * 2 - 60);
      } else {
        x.value = withSpring(0, motion.spring);
        y.value = withSpring(0, motion.spring);
      }
    });

  const tap = Gesture.Tap().enabled(top).onEnd(() => {
    if (reduced) {
      scheduleOnRN(onSend, mood.key);
    } else {
      flingOut(560, -80);
    }
  });

  const style = useAnimatedStyle(() => {
    const p = pos.value;
    const base = {
      transform: [
        { translateY: p * SLOT_Y },
        { scale: Math.max(0.8, 1 - p * SLOT_SCALE) },
      ],
      opacity: interpolate(p, [VISIBLE - 1, VISIBLE], [1, 0], Extrapolation.CLAMP),
    };
    if (!top) return base;
    return {
      ...base,
      transform: [
        ...base.transform,
        { translateX: x.value },
        { translateY: y.value },
        { rotate: `${interpolate(x.value, [-200, 200], [-10, 10], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        accessible={top}
        accessibilityRole="button"
        accessibilityLabel={top ? `send mood ${mood.label}` : undefined}
        style={[
          StyleSheet.absoluteFill,
          {
            width: cardW,
            height: cardH,
            alignSelf: 'center',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            backgroundColor: top ? colors.raised : colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: top ? colors.lineBright : colors.line,
          },
          top ? elevation.card : null,
          style,
        ]}
      >
        <MoodBunny mood={mood.key} size={cardW * 0.42} />
        <Text variant="body" weight="displaySemi" color={top ? colors.ink : colors.muted} style={{ letterSpacing: 0.3 }}>
          {mood.label}
        </Text>
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
  // the deck's box: card + the deepest visible slot's drop + the caption
  const stackH = cardH + (VISIBLE - 1) * SLOT_Y + spacing.xl;

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
      <Text variant="caption" color={colors.faint} style={{ marginTop: spacing.sm }}>
        throw one their way — a tap works too
      </Text>
    </View>
  );
}
