// features/mood/ui/MoodDeck.tsx — the mood picker as a hand of cards.
//
// Seven metal cards, fanned: each undercard sits a slot lower, smaller,
// dimmer, tilted a degree further (tilt side is stable per card — the fan
// never churns on restack). The top card is live: it tilts in 3D under your
// finger, rubber-bands past 200px, ticks a detent at the throw threshold, and
// a committed flick soars away inheriting your velocity (withDecay on x,
// computed timing on y). The mood sends at commit; the deck restacks the
// moment the card leaves the screen. One mood per flight (flying lock +
// 700ms cooldown); a cancelled drag always springs home (onFinalize). Tap
// throws too; reduced motion taps send instantly with every animation off.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { MetallicFrame, MoodBunny, SILVER_METAL, Text } from '../../../ui';
import { colors, elevation, motion, radius, spacing } from '../../../theme/theme';
import { MOODS, type MoodKey } from '../model';

// throw rules: distance AND velocity paths both require real travel
const FLING_DIST = 90;
const FLING_VELOCITY = 1000;
const MIN_TRAVEL = 32;
const THROW_UP = -120;
const THROW_UP_VY = -400;
// drag feel: past this, the card argues with you
const RUBBER_X = 200;
const RUBBER_X_FACTOR = 0.32;
const RUBBER_Y_DOWN = 80;
const MAX_Y_DOWN = 140;
// fan geometry per slot back
const SLOT_Y = 13;
const SLOT_X = 7;
const SLOT_TILT = 2.2; // degrees per slot, side stable per card
const SLOT_SCALE = 0.045;
const SLOT_DIM = 0.08;
const VISIBLE = 4;
// open-fan geometry per slot from center (k = index − 3, so ±3 at the edges):
// tuned so all 7 cards stay on a 360dp screen — the outermost card EDGE sits
// at 3·27 + cardW·0.58/2 ≈ 146px from center (limit: 360/2 − 8 = 172), and
// even its rotated top corner reaches only ≈170px, 10px inside the screen
// the open state: a tabletop scatter — 7 fixed spots around the deck center,
// jittered rotations, messy like cards tossed on a table. Positions are dp
// offsets from the deck's center; big enough that every face stays readable.
const FAN_SCALE = 0.55;
const SCATTER: readonly { x: number; y: number; r: number }[] = [
  { x: -112, y: -165, r: -7 },
  { x: 108, y: -150, r: 6 },
  { x: -35, y: -45, r: -3 },
  { x: 118, y: -15, r: 8 },
  { x: -125, y: 95, r: 5 },
  { x: 25, y: 85, r: -6 },
  { x: 130, y: 130, r: -8 },
];
// local spring characters (theme tokens stay untouched)
const RESTACK_SPRING = { damping: 16, stiffness: 210, mass: 0.9 }; // quick, small overshoot
const POP_SPRING = { damping: 14, stiffness: 260, mass: 0.8 }; // the rise-to-top bounce
const SEND_COOLDOWN_MS = 700;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

type DeckCardProps = {
  mood: (typeof MOODS)[number];
  index: number;
  top: boolean;
  cardW: number;
  cardH: number;
  onThrow: (k: MoodKey) => void;
  onRestack: (k: MoodKey) => void;
};

function DeckCard({
  mood,
  index,
  top,
  spread,
  spreadOpen,
  onOpenSpread,
  cardW,
  cardH,
  centerLeft,
  onThrow,
  onRestack,
}: {
  mood: (typeof MOODS)[number];
  index: number;
  top: boolean;
  /** 0 collapsed deck → 1 fanned hand, animated */
  spread: ReturnType<typeof useSharedValue<number>>;
  /** React mirror of spread for gesture enabling */
  spreadOpen: boolean;
  onOpenSpread: () => void;
  cardW: number;
  cardH: number;
  /** left inset that centers the card on screen — alignSelf is a no-op on
      absolute children, so the deck computes this from the window width */
  centerLeft: number;
  onThrow: (k: MoodKey) => void;
  onRestack: (k: MoodKey) => void;
}) {
  const reduced = useReducedMotion();
  const pos = useSharedValue(index + 4); // +4 on mount: the deck deals upward
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const spin = useSharedValue(0);
  const flying = useSharedValue(0); // 1 from throw commit until the flight ends
  const armed = useSharedValue(0); // detent tick fires once per drag
  const pop = useSharedValue(1); // rise-to-the-top overshoot on restack
  const prevIndex = useRef(index);
  const entered = useRef(false);
  const [ids] = useState(() => ({ sheen: `dks${uid++}`, pool: `dkp${uid++}` }));

  useEffect(() => {
    // never touch a live flight's offsets — the restack happens UNDER it
    if (flying.value === 0) {
      x.value = 0;
      y.value = 0;
      spin.value = 0;
    }
    if (index - prevIndex.current > 1) {
      // thrown to the back: reappear silently behind the stack — no flash at
      // the top of the deck, no travel down through everyone
      pos.value = index;
    } else {
      const first = !entered.current;
      entered.current = true;
      pos.value = reduced
        ? index
        : withDelay(first ? 360 + index * 70 : index * 30, withSpring(index, RESTACK_SPRING));
      if (top && !reduced && !first) {
        // just became the top card — step up to meet the finger
        pop.value = 0.94;
        pop.value = withSpring(1, POP_SPRING);
      }
    }
    prevIndex.current = index;
  }, [index, top, reduced, pos, x, y, spin, flying, pop]);

  const flingOut = (dirX: number, vx: number, vy: number) => {
    'worklet';
    if (flying.value === 1) return; // one flight per card at a time
    flying.value = 1;
    // send at COMMIT — a cancelled animation can never eat the mood
    scheduleOnRN(onThrow, mood.key);
    // inherit the finger: decay on x, never slower than a clean toss
    const throwVx = Math.max(Math.abs(vx), 1000) * Math.sign(vx !== 0 ? vx : dirX);
    x.value = withDecay({
      velocity: Math.max(-2800, Math.min(2800, throwVx)),
      deceleration: 0.985,
    });
    spin.value = withTiming(dirX > 0 ? 20 : -20, { duration: 340 });
    // the soar: fast throws finish faster; ease-out so it decelerates rising
    const speed = Math.max(Math.abs(vx), Math.abs(vy), 1000);
    const dur = Math.max(280, Math.min(430, 320_000 / speed));
    y.value = withTiming(y.value - 680, { duration: dur, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) {
        flying.value = 0;
        // restack only once the card is gone — its flight visual stays intact,
        // and the rise overlaps the last frames of the soar, not the first
        scheduleOnRN(onRestack, mood.key);
      }
    });
  };

  const pan = Gesture.Pan()
    .enabled(top && !reduced && !spreadOpen)
    .activeOffsetX([-12, 12]) // sideways only — vertical drags scroll the page
    .failOffsetY([-24, 24])
    .onStart(() => {
      if (flying.value === 1) return;
      scheduleOnRN(Haptics.selectionAsync);
    })
    .onUpdate((e) => {
      if (flying.value === 1) return;
      // rubber-band: past RUBBER the card keeps following but argues
      const tx = e.translationX;
      const ax = Math.abs(tx);
      x.value = ax > RUBBER_X ? Math.sign(tx) * (RUBBER_X + (ax - RUBBER_X) * RUBBER_X_FACTOR) : tx;
      const ty = e.translationY;
      y.value =
        ty > RUBBER_Y_DOWN ? Math.min(MAX_Y_DOWN, RUBBER_Y_DOWN + (ty - RUBBER_Y_DOWN) * 0.3) : ty;
      if (armed.value === 0 && Math.abs(e.translationX) > FLING_DIST) {
        armed.value = 1;
        scheduleOnRN(Haptics.selectionAsync);
      }
    })
    .onEnd((e) => {
      if (flying.value === 1) return;
      // raw gesture values, not the rubber-banded ones
      const thrown =
        Math.abs(e.translationX) > FLING_DIST ||
        (Math.abs(e.velocityX) > FLING_VELOCITY && Math.abs(e.translationX) > MIN_TRAVEL) ||
        (e.translationY < THROW_UP && e.velocityY < THROW_UP_VY);
      if (thrown) {
        const dir = e.translationX !== 0 ? Math.sign(e.translationX) : Math.sign(e.velocityX || 1);
        flingOut(dir * 560, e.velocityX, e.velocityY);
      } else {
        x.value = withSpring(0, motion.spring);
        y.value = withSpring(0, motion.spring);
      }
    })
    .onFinalize(() => {
      armed.value = 0;
      if (flying.value === 0) {
        // cancelled before a throw (app backgrounded, scroll steal): settle home
        x.value = withSpring(0, motion.spring);
        y.value = withSpring(0, motion.spring);
      }
    });

  // tap: collapsed → the deck opens into a fan; fanned → this card is the pick
  const tap = Gesture.Tap()
    .enabled(top || spreadOpen)
    .onEnd(() => {
      if (flying.value === 1) return; // mid-flight: inert
      if (!spreadOpen) {
        scheduleOnRN(onOpenSpread);
      } else {
        scheduleOnRN(onThrow, mood.key);
        scheduleOnRN(onRestack, mood.key);
      }
    });

  // tilt direction is card identity, not slot — the fan never churns on restack
  const fanSide = (mood.key.charCodeAt(0) + mood.key.length) % 2 === 0 ? -1 : 1;

  const style = useAnimatedStyle(() => {
    const p = pos.value;
    const s = spread.value;
    // collapsed: the slot in the deck
    const slotY = p * SLOT_Y;
    const slotX = fanSide * p * SLOT_X;
    const slotR = fanSide * p * SLOT_TILT;
    const slotS = Math.max(0.85, 1 - p * SLOT_SCALE);
    // fanned: a tabletop scatter — every card thrown loose across the screen,
    // jittered like a messy shuffle, big enough to read the mood on its face
    const sc = SCATTER[index] as { x: number; y: number; r: number };
    const fanX = sc.x;
    const fanY = sc.y;
    const fanR = sc.r;
    const fanS = FAN_SCALE;
    const baseTransform = [
      { translateY: slotY * (1 - s) + fanY * s },
      { translateX: slotX * (1 - s) + fanX * s },
      { rotate: `${slotR * (1 - s) + fanR * s}deg` },
      { scale: slotS * (1 - s) + fanS * s },
    ];
    const baseOpacity = interpolate(p, [VISIBLE - 1, VISIBLE], [1, 0], Extrapolation.CLAMP);
    const opacity = baseOpacity * (1 - s) + s; // the fan reveals every card
    if (!top) return { transform: baseTransform, opacity };
    return {
      transform: [
        { perspective: 800 },
        ...baseTransform,
        { translateX: x.value },
        { translateY: y.value + (1 - pop.value) * 12 },
        { rotate: `${interpolate(x.value, [-240, 240], [-12, 12], Extrapolation.CLAMP) + spin.value}deg` },
        { rotateY: `${interpolate(x.value, [-240, 240], [-14, 14], Extrapolation.CLAMP)}deg` },
        { rotateX: `${interpolate(y.value, [-240, 240], [10, -10], Extrapolation.CLAMP)}deg` },
        { scale: pop.value * interpolate(y.value, [-620, 0], [0.6, 1], Extrapolation.CLAMP) },
      ],
      // a live flight keeps flying while the deck restacks underneath it
      opacity:
        flying.value === 1
          ? interpolate(y.value, [-620, -470, 0], [0, 1, 1], Extrapolation.CLAMP)
          : opacity,
    };
  });

  const dimStyle = useAnimatedStyle(() => ({
    opacity: Math.min(0.25, pos.value * SLOT_DIM) * (1 - spread.value), // the fan lifts every face
  }));

  const FACE_W = cardW - 7; // MetallicFrame thickness 3.5 × 2 — the fill-mask rule
  const FACE_H = cardH - 7;

  const face = top ? (
    <View style={{ width: FACE_W, height: FACE_H }}>
      {/* static light: lit top-left, settled bottom + a silver pool seating the
          bunny — the frame's sweep stays the only moving light on the card */}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={FACE_W} height={FACE_H}>
        <Defs>
          <LinearGradient id={ids.sheen} x1="0" y1="0" x2="0.7" y2="1">
            <Stop offset="0" stopColor={colors.ink} stopOpacity={0.07} />
            <Stop offset="0.45" stopColor={colors.ink} stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.22} />
          </LinearGradient>
          <RadialGradient id={ids.pool} cx="0.5" cy="0.42" r="0.42">
            <Stop offset="0" stopColor={colors.silver} stopOpacity={0.16} />
            <Stop offset="0.7" stopColor={colors.silver} stopOpacity={0.05} />
            <Stop offset="1" stopColor={colors.silver} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={FACE_W} height={FACE_H} fill={`url(#${ids.sheen})`} />
        <Rect x={0} y={0} width={FACE_W} height={FACE_H} fill={`url(#${ids.pool})`} />
      </Svg>
      {/* keyline: the hairline a real metal card has between rim and face */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            margin: 10,
            borderWidth: 1,
            borderColor: colors.lineBright,
            borderRadius: radius.lg - 10,
            opacity: 0.5,
          },
        ]}
      />
      {/* corner pips, like a playing card — second one rotated 180° */}
      <MoodBunny mood={mood.key} size={15} style={{ position: 'absolute', top: 16, left: 16, opacity: 0.45 }} />
      <View style={{ position: 'absolute', bottom: 16, right: 16, opacity: 0.45, transform: [{ rotate: '180deg' }] }}>
        <MoodBunny mood={mood.key} size={15} />
      </View>
      {/* art zone + caption rail */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <MoodBunny mood={mood.key} size={cardW * 0.55} />
      </View>
      <View style={{ alignItems: 'center', paddingBottom: spacing.lg }}>
        <Text variant="title" color={colors.ink}>
          {mood.label}
        </Text>
      </View>
    </View>
  ) : (
    <View style={{ width: FACE_W, height: FACE_H, alignItems: 'center', justifyContent: 'center' }}>
      {/* collapsed: silhouettes, only the next-up whispers its name.
          scattered: every face is the pick — full bunny, full label */}
      <MoodBunny mood={mood.key} size={cardW * 0.5} style={{ opacity: spreadOpen ? 1 : 0.45 }} />
      {index === 1 || spreadOpen ? (
        <Text
          variant={spreadOpen ? 'title' : 'caption'}
          color={spreadOpen ? colors.ink : colors.faint}
          style={{ position: 'absolute', bottom: spacing.lg }}
        >
          {mood.label}
        </Text>
      ) : null}
    </View>
  );

  // deterministic center: absoluteFill + alignSelf hugged the container's
  // left edge (Yoga ignores alignSelf when left/right insets are set), so the
  // whole fan spread from the wrong origin
  const cardBox = {
    position: 'absolute' as const,
    top: 0,
    left: centerLeft,
    width: cardW,
    height: cardH,
  };

  const frame = (
    <MetallicFrame
      cornerRadius={radius.lg}
      stops={SILVER_METAL}
      fill={top ? colors.raised : colors.surface}
      shine={top && !reduced}
      style={{ flex: 1 }}
    >
      {face}
    </MetallicFrame>
  );

  // undercards are pure visuals — until the fan opens, then they're pickable
  if (!top) {
    const card = (
      <Animated.View style={[cardBox, style]}>
        {frame}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, borderRadius: radius.lg }, dimStyle]}
        />
      </Animated.View>
    );
    if (!spreadOpen) return card;
    return <GestureDetector gesture={tap}>{card}</GestureDetector>;
  }

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`send mood ${mood.label}`}
        accessibilityHint="double tap to send this mood — the deck cycles after each send"
        style={[
          cardBox,
          // a real shadow needs an opaque surface to cast from on Android
          { backgroundColor: colors.raised, borderRadius: radius.lg },
          elevation.card,
          style,
        ]}
      >
        {frame}
      </Animated.View>
    </GestureDetector>
  );
}

export function MoodDeck({
  onSend,
  partnerName,
}: {
  onSend: (k: MoodKey) => void;
  partnerName?: string;
}) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const cardW = Math.max(208, Math.min(248, Math.round(width * 0.62)));
  const cardH = Math.round(cardW * 1.24);
  const stackH = cardH + (VISIBLE - 1) * SLOT_Y + 8;
  // the deck container spans the full screen width, so every card (and the
  // shadow/ripple below) centers at this left inset — deterministic, unlike
  // alignSelf on an absolutely-positioned child
  const centerLeft = Math.round((width - cardW) / 2);

  const [order, setOrder] = useState<MoodKey[]>(MOODS.map((m) => m.key));
  const [note, setNote] = useState<string | null>(null);
  const burst = useSharedValue(0);
  const noteO = useSharedValue(1);
  const lastSendAt = useRef(0);
  const [contactId] = useState(() => `dkc${uid++}`);

  // the fan: tap the deck → every card spreads into a pickable hand
  const spread = useSharedValue(0);
  const [spreadOpen, setSpreadOpen] = useState(false);
  const openSpread = () => {
    if (spreadOpen) return;
    void Haptics.selectionAsync();
    setSpreadOpen(true);
    spread.value = reduced ? 1 : withSpring(1, motion.springSoft);
  };
  const closeSpread = () => {
    if (!spreadOpen) return;
    setSpreadOpen(false);
    spread.value = reduced ? 0 : withSpring(0, motion.springSoft);
  };

  const throwMood = (key: MoodKey) => {
    const now = Date.now();
    if (now - lastSendAt.current < SEND_COOLDOWN_MS) return; // one mood per flight
    lastSendAt.current = now;
    onSend(key);
    closeSpread();
    setNote(partnerName ? `on its way to ${partnerName}` : 'on its way');
    if (!reduced) {
      burst.value = 0;
      burst.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
    }
  };

  // thrown card goes to the back; every other card rises a slot (each card's
  // `pos` spring animates the restack; the thrown card snaps silently deep)
  const restack = (key: MoodKey) => {
    setOrder((prev) => [...prev.filter((k) => k !== key), key]);
  };

  // the confirmation caption: swap in fast, clear on a timer (cleaned up so
  // rapid sends never stack timers)
  useEffect(() => {
    if (!note) return;
    noteO.value = 0;
    noteO.value = withTiming(1, { duration: motion.fadeMs });
    const t = setTimeout(() => setNote(null), 2200);
    return () => clearTimeout(t);
  }, [note, noteO]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.15, 1], [0, 0.55, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(burst.value, [0, 1], [0.5, 1.45], Extrapolation.CLAMP) }],
  }));
  const noteStyle = useAnimatedStyle(() => ({ opacity: noteO.value }));

  return (
    <View style={{ alignItems: 'center' }}>
      {/* headroom: the open fan rises ~44dp above the deck's top edge */}
      <View style={{ width: '100%', height: stackH, alignItems: 'center', marginTop: spacing.huge }}>
        {/* tap-away backdrop while the fan is open */}
        {spreadOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="close the fan"
            onPress={closeSpread}
            style={[StyleSheet.absoluteFill, { top: -600, bottom: -600 }]}
          />
        ) : null}
        {/* contact shadow: the stack sits ON the page, not floating over it;
            centered on the same math as the cards, not on alignItems */}
        <Svg
          pointerEvents="none"
          width={cardW * 1.15}
          height={26}
          style={{ position: 'absolute', left: (width - cardW * 1.15) / 2, bottom: -spacing.xs }}
        >
          <Defs>
            <RadialGradient id={contactId} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.5} />
              <Stop offset="0.7" stopColor="#000000" stopOpacity={0.18} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={cardW * 1.15} height={26} fill={`url(#${contactId})`} />
        </Svg>
        {/* the send ripple: one ring, once, from the deck's center */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: cardH / 2 - cardW / 2,
              left: centerLeft,
              width: cardW,
              height: cardW,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: colors.blue,
            },
            ringStyle,
          ]}
        />
        {/* deepest card paints first so the top card sits on top naturally;
            deep slots (index > VISIBLE) render as empty boxes — the thrown
            card keeps flying through them invisibly */}
        {order
          .map((key, i) => {
            const mood = MOODS.find((m) => m.key === key) as (typeof MOODS)[number];
            return (
              <DeckCard
                key={key}
                mood={mood}
                index={i}
                top={i === 0}
                spread={spread}
                spreadOpen={spreadOpen}
                onOpenSpread={openSpread}
                cardW={cardW}
                cardH={cardH}
                centerLeft={centerLeft}
                onThrow={throwMood}
                onRestack={restack}
              />
            );
          })
          .reverse()}
      </View>
      {/* fixed-height caption: text swaps never shift the layout */}
      <View style={{ height: 17, marginTop: spacing.sm, alignItems: 'center' }}>
        <Animated.View style={noteStyle}>
          <Text variant="caption" color={note ? colors.blue : colors.faint}>
            {note ??
              (spreadOpen
                ? 'pick the one that fits — tap anywhere else to close'
                : reduced
                  ? 'how are you feeling? tap the deck to see them all'
                  : 'how are you feeling? flick a card — or tap the deck to see them all')}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
