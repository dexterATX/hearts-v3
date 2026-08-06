// features/games/ui/art/DeckArt.tsx — the cards game's artifact: a mini deck
// of four that shuffles itself forever, on a ~3.2s cadence.
//
// THE MATERIAL — each card is drawn in SVG: a vertical face gradient (raised
// → surface, lit by the arcade's shared top-left key light), a hairline rim,
// a 1px silver catch-light along the top edge, and ONE blue pip — radial
// body (blue → blueDeep, lit high-left), a pinpoint specular dot, and a soft
// radial halo that only the front card wears. A depth dim (the deck's
// SLOT_DIM in miniature) shades cards toward the back, and a soft dark
// ellipse under the stack grounds it, widening and darkening while the
// shuffle is in flight.
//
// THE SHUFFLE — animation principles, not a swap: the front card ANTICIPATES
// (lifts 2dp, counter-tilts −2° for 150ms), then travels to the back
// slow-in/slow-out, fading as it pulls down-and-away so it never flashes
// across the front; the followers CASCADE forward with 70ms of overlap per
// slot; and the new front card rises with the deck's pop overshoot, then
// lands on a tiny 0.5dp two-frame settle-bounce. The contact shadow answers
// the whole cycle. Mount deals the four upward in a stagger. Reduced motion:
// a static fan of four, front pip lit.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../../../theme/theme';

// local spring characters, copied from the deck (theme tokens stay untouched)
const RESTACK_SPRING = { damping: 16, stiffness: 210, mass: 0.9 }; // the followers' step forward
const POP_SPRING = { damping: 14, stiffness: 260, mass: 0.8 }; // the rise-to-front bounce
const SETTLE_SPRING = { damping: 11, stiffness: 340, mass: 0.45 }; // two-frame landing bounce
// slow-in/slow-out curves for the organic moves (never linear)
const EASE_OUT = Easing.out(Easing.quad);
const EASE_IN_OUT = Easing.inOut(Easing.cubic);

const SHUFFLE_MS = 3200; // one full shuffle cadence
const ANTIC_MS = 150; // the front card's lift-and-tilt beat before the move
const ANTIC_LIFT = 2; // dp upward
const ANTIC_TILT = 2; // degrees counter-clockwise
const TRAVEL_MS = 480; // front → back, slow-in/slow-out
const CASCADE_MS = 70; // per-slot overlap as the followers step forward
const SETTLE_DP = 0.5; // the landing bounce's depth
const DEAL_LEAD_MS = 140; // mount deal-in: lead…
const DEAL_STAGGER_MS = 70; // …and per-card stagger
const CARDS = [0, 1, 2, 3];

// gradient ids resolve per Svg document; every card mints its own set
let uid = 0;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ShuffleCard({
  id,
  slot,
  cardW,
  cardH,
  left,
  top,
  slotX,
  slotY,
  corner,
  frontPop,
  reduced,
}: {
  /** stable identity across shuffles; sets the pip's blue intensity */
  id: number;
  /** 0 = front … 3 = back, springs between slots on every shuffle */
  slot: number;
  cardW: number;
  cardH: number;
  left: number;
  top: number;
  slotX: number;
  slotY: number;
  corner: number;
  /** mirrors the front card's rise so the parent's contact shadow can answer it */
  frontPop: SharedValue<number>;
  reduced: boolean;
}) {
  const [ids] = useState(() => {
    const n = uid++;
    return { face: `dkf${n}`, glow: `dkg${n}`, pip: `dkp${n}` };
  });
  const pos = useSharedValue(slot + 2.5); // deep on mount: the four deal upward
  const pop = useSharedValue(1); // rise-to-the-front overshoot
  const o = useSharedValue(1);
  const drop = useSharedValue(0); // extra downward drift while fading out
  const glow = useSharedValue(slot === 0 ? 1 : 0); // the front pip's halo
  const antic = useSharedValue(0); // anticipation: lift + counter-tilt before the throw
  const settle = useSharedValue(0); // the new front card's landing bounce
  const prev = useRef(slot);
  const entered = useRef(false);

  useEffect(() => {
    if (slot - prev.current > 1) {
      // thrown to the back. ANTICIPATION: lift 2dp and counter-tilt −2° for a
      // beat, then release into the travel…
      antic.value = withTiming(1, { duration: ANTIC_MS, easing: EASE_OUT }, (finished) => {
        if (finished) antic.value = withTiming(0, { duration: TRAVEL_MS * 0.55, easing: EASE_IN_OUT });
      });
      // …the travel: slow-in/slow-out down-right into the back slot, fading
      // out along the way, then a soft reappearance behind the stack — no
      // flash at the front. `drop` resets while the card is invisible.
      pos.value = withDelay(ANTIC_MS, withTiming(slot, { duration: TRAVEL_MS, easing: EASE_IN_OUT }));
      o.value = withDelay(
        ANTIC_MS,
        withTiming(0, { duration: 200 }, (finished) => {
          if (finished) o.value = withDelay(200, withTiming(1, { duration: 340 }));
        }),
      );
      drop.value = withDelay(
        ANTIC_MS,
        withTiming(1, { duration: 240 }, (finished) => {
          if (finished) drop.value = 0;
        }),
      );
    } else {
      const first = !entered.current;
      entered.current = true;
      // the followers cascade forward, overlapped by slot, only after the
      // thrown card's anticipation beat has played
      const delay = first
        ? DEAL_LEAD_MS + slot * DEAL_STAGGER_MS
        : ANTIC_MS + slot * CASCADE_MS;
      pos.value = reduced ? slot : withDelay(delay, withSpring(slot, RESTACK_SPRING));
      if (slot === 0 && !reduced && !first) {
        // just became the front card — rise to meet the eye, then land on a
        // two-frame settle-bounce: 0.5dp down, spring back
        pop.value = 0.9;
        pop.value = withDelay(ANTIC_MS, withSpring(1, POP_SPRING));
        frontPop.value = 0.9;
        frontPop.value = withDelay(ANTIC_MS, withSpring(1, POP_SPRING));
        settle.value = withDelay(
          ANTIC_MS + 230,
          withSequence(
            withTiming(SETTLE_DP, { duration: 90, easing: EASE_OUT }),
            withSpring(0, SETTLE_SPRING),
          ),
        );
      }
    }
    // the front card's pip glows; a plain fade everywhere else
    glow.value = reduced
      ? slot === 0
        ? 1
        : 0
      : withTiming(slot === 0 ? 1 : 0, { duration: slot === 0 ? 350 : 200 });
    prev.current = slot;
  }, [slot, reduced, pos, pop, o, drop, glow, antic, settle, frontPop]);

  // every driver cancels on unmount
  useEffect(
    () => () => {
      cancelAnimation(pos);
      cancelAnimation(pop);
      cancelAnimation(o);
      cancelAnimation(drop);
      cancelAnimation(glow);
      cancelAnimation(antic);
      cancelAnimation(settle);
    },
    [pos, pop, o, drop, glow, antic, settle],
  );

  const style = useAnimatedStyle(() => {
    const p = pos.value;
    return {
      opacity: o.value,
      transform: [
        { translateX: p * slotX },
        {
          translateY:
            p * slotY +
            (1 - pop.value) * 6 +
            drop.value * cardH * 0.18 -
            ANTIC_LIFT * antic.value +
            settle.value,
        },
        { rotate: `${p * 3 - ANTIC_TILT * antic.value}deg` },
        { scale: Math.max(0.78, 1 - p * 0.06) * pop.value },
      ],
    };
  });

  // depth dim, the deck's SLOT_DIM in miniature
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pos.value, [0, 3], [0, 0.3], Extrapolation.CLAMP),
  }));

  const glowProps = useAnimatedProps(() => ({ opacity: glow.value }));

  const pip = Math.max(4, Math.round(cardW * 0.26));
  const glowR = pip * 1.4;
  // each card keeps its own pip intensity, front to back by identity
  const pipBase = Math.min(0.95, 0.55 + id * 0.13);
  const cx = cardW / 2;
  const cy = cardH / 2;

  return (
    <Animated.View
      style={[{ position: 'absolute', left, top, width: cardW, height: cardH }, style]}
    >
      <Svg width={cardW} height={cardH}>
        <Defs>
          {/* the face: vertical gradient, raised at the key-light top → surface */}
          <LinearGradient id={ids.face} x1={0} y1={0} x2={0} y2={1}>
            <Stop offset={0} stopColor={colors.raised} />
            <Stop offset={1} stopColor={colors.surface} />
          </LinearGradient>
          {/* the front pip's halo */}
          <RadialGradient id={ids.glow} cx={0.5} cy={0.5} r={0.5}>
            <Stop offset={0} stopColor={colors.blue} stopOpacity={0.5} />
            <Stop offset={1} stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
          {/* the pip body: lit high-left by the shared key light */}
          <RadialGradient id={ids.pip} cx={0.38} cy={0.32} r={0.85}>
            <Stop offset={0} stopColor={colors.blue} />
            <Stop offset={1} stopColor={colors.blueDeep} />
          </RadialGradient>
        </Defs>
        {/* face + hairline rim */}
        <Rect
          x={0.5}
          y={0.5}
          width={cardW - 1}
          height={cardH - 1}
          rx={corner}
          fill={`url(#${ids.face})`}
          stroke={colors.lineBright}
          strokeOpacity={0.6}
          strokeWidth={1}
        />
        {/* 1px silver catch-light along the top edge, inset past the corners */}
        <Rect
          x={corner * 0.75}
          y={1}
          width={cardW - corner * 1.5}
          height={1}
          rx={0.5}
          fill={colors.silver}
          opacity={0.55}
        />
        {/* the front pip's glow halo, behind the pip itself */}
        <AnimatedCircle cx={cx} cy={cy} r={glowR} fill={`url(#${ids.glow})`} animatedProps={glowProps} />
        {/* one blue pip, centered, with its own key-light shading */}
        <Circle cx={cx} cy={cy} r={pip / 2} fill={`url(#${ids.pip})`} opacity={pipBase} />
        {/* specular pinpoint, top-left of the pip */}
        <Circle
          cx={cx - pip * 0.14}
          cy={cy - pip * 0.16}
          r={Math.max(0.6, pip * 0.09)}
          fill={colors.silver}
          opacity={0.85 * pipBase}
        />
      </Svg>
      {/* depth dim toward the back of the stack */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.bg, borderRadius: corner },
          dimStyle,
        ]}
      />
    </Animated.View>
  );
}

export function DeckArt({ size = 56 }: { size?: number }) {
  const reduced = useReducedMotion();
  // order[0] is the front card; each shuffle moves it to the back
  const [order, setOrder] = useState<number[]>(CARDS);
  const frontPop = useSharedValue(1); // the front card's rise, shared with the shadow
  const cycle = useSharedValue(0); // 0 rest → 1 mid-shuffle; drives the contact shadow

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      // the shadow follows the shuffle: swell as the cards travel, settle at rest
      cycle.value = 0;
      cycle.value = withSequence(
        withTiming(1, { duration: ANTIC_MS + TRAVEL_MS * 0.7, easing: EASE_IN_OUT }),
        withTiming(0, { duration: 650, easing: EASE_IN_OUT }),
      );
      setOrder((prev) => {
        const [front, ...rest] = prev;
        return front === undefined ? prev : [...rest, front];
      });
    }, SHUFFLE_MS);
    return () => clearInterval(t);
  }, [reduced, cycle]);

  useEffect(
    () => () => {
      cancelAnimation(frontPop);
      cancelAnimation(cycle);
    },
    [frontPop, cycle],
  );

  const cardW = Math.round(size * 0.44);
  const cardH = Math.round(cardW * 1.38);
  const slotX = size * 0.085; // each slot back steps right…
  const slotY = size * 0.07; // …and down, like cards settling into a hand
  const corner = Math.max(4, Math.round(cardW * 0.22));
  // center the whole four-slot spread, not just the front slot
  const left = Math.round((size - cardW) / 2 - slotX * 1.5);
  const top = Math.round((size - cardH) / 2 - slotY * 1.5);

  const shadowW = Math.round(cardW * 1.7);
  const shadowH = Math.max(4, Math.round(size * 0.075));

  // the contact shadow answers the shuffle: wider and darker while cards are
  // in flight, plus the rise's pinch at the overshoot, settled at rest
  const shadowStyle = useAnimatedStyle(() => {
    const c = cycle.value;
    const p = frontPop.value;
    return {
      opacity:
        interpolate(c, [0, 1], [0.3, 0.42], Extrapolation.CLAMP) +
        interpolate(p, [0.9, 1, 1.08], [0.08, 0, -0.02], Extrapolation.CLAMP),
      transform: [
        {
          scaleX:
            interpolate(c, [0, 1], [1, 1.12], Extrapolation.CLAMP) *
            interpolate(p, [0.9, 1, 1.08], [1.06, 1, 0.97], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    // back slot paints first so the front card sits on top naturally
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: Math.round(left + (cardW + 3 * slotX) / 2 - shadowW / 2),
            top: Math.round(top + cardH + 3 * slotY - shadowH * 0.55),
            width: shadowW,
            height: shadowH,
            borderRadius: 999,
            backgroundColor: '#000000',
          },
          shadowStyle,
        ]}
      />
      {order
        .map((id, slot) => (
          <ShuffleCard
            key={id}
            id={id}
            slot={slot}
            cardW={cardW}
            cardH={cardH}
            left={left}
            top={top}
            slotX={slotX}
            slotY={slotY}
            corner={corner}
            frontPop={frontPop}
            reduced={reduced}
          />
        ))
        .reverse()}
    </View>
  );
}
