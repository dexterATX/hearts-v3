// features/home/ui/StoryDayCard.tsx — one story day as a physical page.
//
// The card still springs in once and its rows still cascade behind it — but
// now a timeline spine draws itself down the card's left edge as the deal
// lands, and every row's artifact sits on it like a bead. TODAY is the feed's
// living surface: a silver MetallicFrame whose shine keeps sweeping, an
// ambient blue glow breathing behind the content, and a live dot next to the
// label. Yesterday and older are perfectly still — the hierarchy reads on
// purpose: today is alive, the past is at rest.
//
// FlashList recycles these views, so every entrance keys off the caller's
// seenRef id-set, never off mount — a recycled body whose day was already
// shown renders 100% static (loops included: they only run on today, and
// they cancel on unmount).
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Card, MetallicFrame, SILVER_METAL, Text } from '../../../ui';
import { colors, motion, radius, spacing } from '../../../theme/theme';
import type { StoryDay, StoryLine } from '../model';
import { StoryRow, ARTIFACT_SLOT } from './StoryRow';

// local spring characters (theme tokens stay untouched)
const CARD_SPRING = { damping: 22, stiffness: 140, mass: 1 }; // a soft landing — the springSoft character

// stagger grammar: cards 70ms apart, rows follow their card by 120ms, 45ms apart
const CARD_STAGGER_MS = 70;
const ROW_LEAD_MS = 120;
const ROW_STAGGER_MS = 45;
// the today label rides a beat (80ms) behind its card
const LABEL_LAG_MS = 80;
// the spine draws just after the card starts moving, ahead of the row cascade
const SPINE_LAG_MS = 100;

// gradient ids resolve per document; every instance mints its own
let uid = 0;

/** Local 'YYYY-MM-DD' for the is-this-today check — computed here on purpose:
 *  the model's day-key helper isn't exported and the UI owns this one comparison. */
function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The timeline: a 1dp line down the artifact column that draws itself
 *  top-to-bottom as the deal lands (scaleY, origin pinned to the top).
 *  Seen/recycled: full height, static. Bright on today, quiet on the past. */
function Spine({ delay, animate, bright }: { delay: number; animate: boolean; bright: boolean }) {
  const reduced = useReducedMotion();
  const draw = useSharedValue(1);

  useLayoutEffect(() => {
    if (animate && !reduced) {
      draw.value = 0;
      draw.value = withDelay(delay, withSpring(1, CARD_SPRING));
    } else {
      draw.value = 1;
    }
  }, [animate, delay, reduced, draw]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: draw.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: spacing.lg + ARTIFACT_SLOT / 2,
          top: spacing.lg + 18,
          bottom: spacing.lg,
          width: 1,
          backgroundColor: bright ? colors.lineBright : colors.line,
          transformOrigin: '50% 0%',
        },
        style,
      ]}
    />
  );
}

export const StoryDayCard = memo(function StoryDayCard({
  day,
  partnerName,
  myId,
  onPressRow,
  cardIndex,
  newLineIds,
  seenRef,
  thumbs,
}: {
  day: StoryDay;
  partnerName: string;
  myId: string | null;
  onPressRow?: (line: StoryLine) => void;
  cardIndex: number;
  newLineIds: Set<string>;
  seenRef: { current: Set<string> };
  thumbs: Record<string, string>;
}) {
  const reduced = useReducedMotion();
  const isToday = day.day === todayKey();
  const delay = cardIndex * CARD_STAGGER_MS;
  const [glowId] = useState(() => `dayglow${uid++}`);

  // rest-state initials: a card mounts looking settled, and only the layout
  // effect below hides a fresh one before its first paint — no flash, and a
  // seen/recycled card never moves at all
  const o = useSharedValue(1);
  const y = useSharedValue(0);
  const s = useSharedValue(1);
  const labelO = useSharedValue(1);
  // today's living loops
  const glowBreathe = useSharedValue(1);
  const dotBreathe = useSharedValue(1);

  // THE recycling rule: the entrance decision is made once per day-key, at
  // render, by claiming the id in the caller's set. A re-render with the same
  // id is idempotent; a recycled view claiming a NEW id animates again, and
  // one whose id was claimed before stays static.
  const decision = useRef<{ id: string | null; unseen: boolean }>({ id: null, unseen: false });
  if (decision.current.id !== day.day) {
    const unseen = !seenRef.current.has(day.day);
    seenRef.current.add(day.day);
    decision.current = { id: day.day, unseen };
  }
  const animate = decision.current.unseen && !reduced;

  const enteredFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (animate) {
      if (enteredFor.current === day.day) return; // one entrance per id — never a replay
      enteredFor.current = day.day;
      o.value = 0;
      y.value = 16;
      s.value = 0.985;
      o.value = withDelay(delay, withSpring(1, CARD_SPRING));
      y.value = withDelay(delay, withSpring(0, CARD_SPRING));
      s.value = withDelay(delay, withSpring(1, CARD_SPRING));
      if (isToday) {
        // the living card's label fades in just after the card starts moving
        labelO.value = 0;
        labelO.value = withDelay(
          delay + LABEL_LAG_MS,
          withTiming(1, { duration: motion.fadeMs }),
        );
      }
    } else {
      // seen / recycled / reduced: snap to rest, no shared-value replays
      o.value = 1;
      y.value = 0;
      s.value = 1;
      labelO.value = 1;
    }
  }, [animate, day.day, delay, isToday, o, y, s, labelO]);

  // today's ambient life: the glow breathes 1 ↔ 0.55 and the live dot 1 ↔ 0.4,
  // both on slow reverses, both cancelled on unmount. The shine loop is
  // MetallicFrame's own and cancels the same way. Reduced motion never starts.
  useEffect(() => {
    if (isToday && !reduced) {
      glowBreathe.value = withRepeat(withTiming(0.55, { duration: 2400 }), -1, true);
      dotBreathe.value = withRepeat(withTiming(0.4, { duration: 1200 }), -1, true);
    }
    return () => {
      cancelAnimation(glowBreathe);
      cancelAnimation(dotBreathe);
    };
  }, [isToday, reduced, glowBreathe, dotBreathe]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }, { scale: s.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelO.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.07 * glowBreathe.value }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotBreathe.value }));

  const label = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
      {isToday ? (
        <Animated.View
          style={[
            {
              width: 6,
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: colors.blue,
            },
            dotStyle,
          ]}
        />
      ) : null}
      <Text
        variant="overline"
        color={isToday ? colors.silver : colors.faint}
        style={{ textTransform: 'uppercase' }}
      >
        {day.label}
      </Text>
    </View>
  );

  const content = (
    <>
      {isToday ? <Animated.View style={labelStyle}>{label}</Animated.View> : label}
      {day.lines.map((line, i) => (
        <Fragment key={line.id}>
          <StoryRow
            line={line}
            partnerName={partnerName}
            myId={myId}
            onPressRow={onPressRow}
            entranceDelay={delay + ROW_LEAD_MS + i * ROW_STAGGER_MS}
            isNew={newLineIds.has(line.id)}
            seenRef={seenRef}
            thumbUrl={line.kind === 'photo' ? thumbs[line.id] : undefined}
          />
        </Fragment>
      ))}
    </>
  );

  return (
    <Animated.View style={cardStyle}>
      {isToday ? (
        // the living card: metal, a slow shine, light pooling behind the page
        <MetallicFrame
          cornerRadius={radius.md}
          stops={SILVER_METAL}
          fill={colors.surface}
          shine={!reduced}
          style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
        >
          <View style={{ padding: spacing.lg }}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
              <Svg width="100%" height="100%">
                <Defs>
                  <RadialGradient id={glowId} cx="0.3" cy="0.15" r="0.75">
                    <Stop offset="0" stopColor={colors.blue} stopOpacity={0.9} />
                    <Stop offset="0.6" stopColor={colors.blue} stopOpacity={0.25} />
                    <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={110} cy={30} r={150} fill={`url(#${glowId})`} />
              </Svg>
            </Animated.View>
            <Spine delay={delay + SPINE_LAG_MS} animate={animate} bright />
            {content}
          </View>
        </MetallicFrame>
      ) : (
        <Card variant="quiet" style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <Spine delay={delay + SPINE_LAG_MS} animate={animate} bright={false} />
          {content}
        </Card>
      )}
    </Animated.View>
  );
});
