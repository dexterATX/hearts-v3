// features/games/ui/ActiveSessions.tsx — the live strip: games already in
// progress, dealt FIRST so the entrance stagger continues into the arcade
// grid below (index starts at 0 here). Each session is an accent ArcadeCard
// whose blurb says when it started. The sonar beacon rides the card's stage
// corner — overlaid absolute at the artifact tile's top-right, an 8dp blue
// core under one expanding ring every 2s (PresenceChip grammar) — fading and
// rising on the same lead/stagger as the card so the pair lands as one deal.
// ArcadeCard has no slot, so the beacon is a positioned sibling, never a
// child, and it never touches the card's gestures (pointerEvents none).
// Put-away keeps the exact §6 behavior: first tap arms ('sure?'), 3s to
// decide, never a modal.
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon, Text } from '../../../ui';
import { colors, motion, radius, spacing } from '../../../theme/theme';
import { ArcadeCard } from './ArcadeCard';
import { ARCADE_GAMES } from './arcadeMeta';

type LiveSession = { id: string; kind: string; created_at: string };

// the beacon's deal copies the card's own (ArcadeCard keeps its constants
// local): same lead, same stagger, same soft spring, so dot and card land
// as one deal
const DEAL_LEAD_MS = 120;
const DEAL_STAGGER_MS = 80;
const DEAL_RISE = 14;
// the beacon's pace: one ring expands and fades per 2s
const PING_MS = 2000;
// §6: a destructive tap stays armed exactly this long, then forgets
const ARM_MS = 3000;
// the put-away coin: a 28dp ghost circle at the card's top-right
const PUT_AWAY_SIZE = 28;

// where the beacon sits: the card's stage is a flush, full-height 96dp
// column on the left, so its top-right corner lands at (96, 0) — centering
// the 16dp beacon box on that point puts the core right on the corner, half
// badge, half overlay (it straddles the card's top edge on purpose; the
// wrapper never clips, and the list gap keeps it clear of the card above)
const STAGE_W = 96; // ArcadeCard's stage width (it keeps its own copy)
const BEACON_LEFT = STAGE_W - 8; // corner x − half the beacon box
const BEACON_TOP = -8; // corner y − half the beacon box

/** The live beacon: an 8dp blue core under one sonar ring on a one-way ramp,
 *  looping — the ring resets to its core while invisible, so the loop never
 *  jolts. Reduced motion shows the dormant static ring (PresenceChip's
 *  grammar) and the loop never starts; unmount cancels it. */
function SonarDot() {
  const reduced = useReducedMotion();
  const ping = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    ping.value = withRepeat(withTiming(1, { duration: PING_MS }), -1, false);
    return () => cancelAnimation(ping);
  }, [reduced, ping]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ping.value, [0, 1], [0.55, 0]),
    transform: [{ scale: interpolate(ping.value, [0, 1], [1, 2.1]) }],
  }));

  return (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius.pill,
            borderWidth: 1.5,
            borderColor: colors.blueGlow,
            backgroundColor: 'transparent',
          },
          reduced ? { opacity: 0.35 } : ringStyle,
        ]}
      />
      <View
        style={{
          width: spacing.sm,
          height: spacing.sm,
          borderRadius: radius.pill,
          backgroundColor: colors.blue,
        }}
      />
    </View>
  );
}

/** One in-progress game: the accent card, the beacon overlaid at its stage
 *  corner, and the two-tap put-away floating at the card's own top-right.
 *  The beacon deals in with its card — same lead, same stagger, same soft
 *  spring — so the overlay never appears before the face it marks. The
 *  armed state lives here: each card owns its own 3s fuse. */
function LiveSessionCard({
  session,
  index,
  onOpen,
  onPutAway,
}: {
  session: LiveSession;
  index: number;
  onOpen: (s: LiveSession) => void;
  onPutAway: (id: string) => void;
}) {
  const meta = ARCADE_GAMES.find((g) => g.kind === session.kind);
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false); // two-tap destructive (§6), owned here
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the put-away button floats over the card's own tap area, so the card's
  // RNGH Tap would ALSO end on that release and open the very game being
  // put away. Raised on touch-down — Pressable's onPressIn always beats the
  // card tap's onEnd (which only fires on release) — and consumed by the
  // card's onPress wrapper, which then swallows that one tap. One flag
  // covers both the arm tap and the confirm tap: they share the Pressable.
  const suppressOpen = useRef(false);

  // the beacon deals in on its card: fade + the 14dp rise on the deal spring
  const o = useSharedValue(reduced ? 1 : 0);
  const y = useSharedValue(reduced ? 0 : DEAL_RISE);

  useEffect(() => {
    if (reduced) return;
    const delay = DEAL_LEAD_MS + index * DEAL_STAGGER_MS;
    o.value = withDelay(delay, withSpring(1, motion.springSoft));
    y.value = withDelay(delay, withSpring(0, motion.springSoft));
  }, [reduced, index, o, y]);

  // never leave a live fuse behind an unmounted card
  useEffect(
    () => () => {
      if (disarm.current) clearTimeout(disarm.current);
    },
    [],
  );

  const dealStyle = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));

  const arm = () => {
    void Haptics.selectionAsync();
    setArmed(true);
    if (disarm.current) clearTimeout(disarm.current);
    disarm.current = setTimeout(() => setArmed(false), ARM_MS);
  };

  const putAway = () => {
    if (disarm.current) clearTimeout(disarm.current);
    setArmed(false);
    void Haptics.selectionAsync();
    onPutAway(session.id);
  };

  // the card tap's one gate: a release that began on the put-away button
  // raised suppressOpen on touch-down, so this tap is swallowed and the
  // flag consumed. No double-fire path remains: the flag is set before the
  // tap gesture can end (touch-down precedes release), and the only other
  // way onPress runs is a genuine card tap with the flag clear. A press
  // that drags off the button never fires its onPress, so the flag is
  // cleared on release too — deferred, so it still covers the card tap's
  // onEnd landing in the same release burst.
  const openIfNotSuppressed = () => {
    if (suppressOpen.current) {
      suppressOpen.current = false;
      return;
    }
    onOpen(session);
  };

  if (!meta) return null;

  return (
    <View>
      <ArcadeCard
        kind={meta.kind}
        title={meta.title}
        blurb={`started ${new Date(session.created_at).toLocaleDateString()}, tap to jump back in`}
        index={index}
        accent
        onPress={openIfNotSuppressed}
      />
      {/* the beacon: pure signal, straddling the stage's top-right corner —
          it overlaps the card, so it must never intercept the tilt or tap */}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ position: 'absolute', left: BEACON_LEFT, top: BEACON_TOP }, dealStyle]}
      >
        <SonarDot />
      </Animated.View>
      {/* the put-away: a ghost coin at the card's own top-right, clear of the
          beacon's stage corner. The 'sure?' confirm replaces the close icon
          in the same button — the circle stretches into a pill so the word
          stays inside the hairline rim */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={armed ? 'tap again to put this game away' : 'put this game away'}
        hitSlop={6}
        onPressIn={() => {
          suppressOpen.current = true;
        }}
        onPressOut={() => {
          setTimeout(() => {
            suppressOpen.current = false;
          }, 150);
        }}
        onPress={armed ? putAway : arm}
        style={{
          position: 'absolute',
          top: spacing.sm,
          right: spacing.sm,
          minWidth: PUT_AWAY_SIZE,
          height: PUT_AWAY_SIZE,
          paddingHorizontal: armed ? spacing.sm : 0,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.lineBright,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {armed ? (
          <Text variant="caption" weight="semibold" color={colors.danger}>
            sure?
          </Text>
        ) : (
          <Icon name="close" size={spacing.md} color={colors.muted} />
        )}
      </Pressable>
    </View>
  );
}

export function ActiveSessions({
  sessions,
  onOpen,
  onPutAway,
}: {
  sessions: { id: string; kind: string; created_at: string }[];
  onOpen: (s: { id: string; kind: string; created_at: string }) => void;
  onPutAway: (id: string) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    // the section owns its rhythm: aligned with the grid's inset, breathing
    // below the header like the grid does below this strip
    <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
      <Text variant="overline" color={colors.muted} style={{ textTransform: 'uppercase' }}>
        games in progress
      </Text>
      {sessions.map((s, i) => (
        <LiveSessionCard key={s.id} session={s} index={i} onOpen={onOpen} onPutAway={onPutAway} />
      ))}
    </View>
  );
}
