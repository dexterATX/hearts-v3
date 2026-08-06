// features/presence/ui/PresenceChip.tsx — who's in the app, which screen (§7.4).
// A live status, so: pill, hairline, one small blue dot. Never shouty.
// Offline → render nothing (stale presence is a lie); absent → dormant pill
// with last_seen; present → breathing halo, poke ripples.
import { useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { Reveal, Text } from '../../../ui';
import { colors, spacing, radius, motion } from '../../../theme/theme';
import { usePartnerPresence, usePartnerLastSeen, usePoke } from '../hooks';
import { describePresence, lastSeenText } from '../model';
import { usePartnerName } from '../../../lib/session/store';
import { useOnline } from '../../../lib/sync/online';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SENT_COPY_MS = 2_200;
const RECEIVED_COPY_MS = 2_500;

const pill = {
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'center',
  gap: spacing.sm,
  maxWidth: '90%',
  backgroundColor: colors.surfaceAlt,
  borderRadius: radius.pill,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.lg,
  borderWidth: 1,
  borderColor: colors.line,
} as const;

const ring = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: radius.pill,
  borderWidth: 1.5,
  borderColor: colors.blueGlow,
  backgroundColor: 'transparent',
} as const;

export function PresenceChip() {
  const partner = usePartnerPresence();
  const partnerName = usePartnerName();
  const { poke, received } = usePoke();
  const online = useOnline();
  const reduced = useReducedMotion();
  const lastSeen = usePartnerLastSeen(!partner);

  // Key effects on derived primitives — the partner object is a fresh
  // identity on every presence snapshot.
  const desc = partner ? describePresence(partner) : '';
  const typing = !!partner?.typing_in;

  const scale = useSharedValue(1);
  const breathe = useSharedValue(0);
  const typingRing = useSharedValue(0);
  const sentRipple = useSharedValue(0);
  const dotPop = useSharedValue(1);
  const [sentAt, setSentAt] = useState(0);
  const [receivedAt, setReceivedAt] = useState(0);
  const firstReceived = useRef(true);

  // Halo sonar: one-way ramp, looping. Reduced motion → static ring (below).
  useEffect(() => {
    if (reduced) return;
    breathe.value = withRepeat(withTiming(1, { duration: 2400 }), -1, false);
    return () => cancelAnimation(breathe);
  }, [reduced, breathe]);

  // Typing ring: faster ramp, delayed so it reads as a second pulse.
  useEffect(() => {
    if (!typing || reduced) return;
    typingRing.value = withRepeat(withDelay(300, withTiming(1, { duration: 900 })), -1, false);
    return () => {
      cancelAnimation(typingRing);
      typingRing.value = 0;
    };
  }, [typing, reduced, typingRing]);

  // Sent-copy dwell: each poke re-triggers, the cleanup keeps timers unstacked.
  useEffect(() => {
    if (!sentAt) return;
    const t = setTimeout(() => setSentAt(0), SENT_COPY_MS);
    return () => clearTimeout(t);
  }, [sentAt]);

  useEffect(() => {
    if (!receivedAt) return;
    const t = setTimeout(() => setReceivedAt(0), RECEIVED_COPY_MS);
    return () => clearTimeout(t);
  }, [receivedAt]);

  // A poke came in: pop the dot, one ripple, swap the copy.
  useEffect(() => {
    if (firstReceived.current) {
      firstReceived.current = false;
      return;
    }
    setReceivedAt(Date.now());
    sentRipple.value = 0;
    sentRipple.value = withTiming(1, { duration: 600 });
    dotPop.value = withSequence(withSpring(1.6, motion.spring), withSpring(1, motion.spring));
  }, [received, sentRipple, dotPop]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.55, 0]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1, 2.1]) }],
  }));
  const typingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(typingRing.value, [0, 1], [0.55, 0]),
    transform: [{ scale: interpolate(typingRing.value, [0, 1], [1, 2.1]) }],
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sentRipple.value, [0, 0.2, 1], [0, 0.9, 0]),
    transform: [{ scale: interpolate(sentRipple.value, [0, 1], [1, 2.6]) }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotPop.value }] }));

  if (!online) return null;

  if (!partner) {
    // Dormant: she's not here. Until last_seen lands, drop out cleanly.
    if (lastSeen.isPending) return null;
    return (
      <Reveal delay={90} dy={10}>
        <View style={pill}>
          {/* hollow dot — no fill, no animation, nothing to shout about */}
          <View
            style={{
              width: spacing.sm,
              height: spacing.sm,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: colors.faint,
            }}
          />
          <Text variant="small" color={colors.faint} numberOfLines={1} style={{ flexShrink: 1 }}>
            {partnerName} · {lastSeenText(lastSeen.data ?? null)}
          </Text>
        </View>
      </Reveal>
    );
  }

  return (
    <Reveal delay={90} dy={10}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`${partnerName} is ${desc}. Tap to say thinking of you.`}
        onPressIn={() => {
          scale.value = withSpring(motion.pressScale, motion.spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
        }}
        onPress={() => {
          poke();
          setSentAt(Date.now());
          sentRipple.value = 0;
          sentRipple.value = withTiming(1, { duration: 600 });
          dotPop.value = withSequence(withSpring(1.6, motion.spring), withSpring(1, motion.spring));
        }}
        style={[pill, pressStyle]}
      >
        {/* the live dot: blue core under sonar rings — a signal, not a badge */}
        <Animated.View
          style={[{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }, dotStyle]}
        >
          <Animated.View pointerEvents="none" style={[ring, reduced ? { opacity: 0.35 } : haloStyle]} />
          {typing && (
            <Animated.View
              pointerEvents="none"
              style={[ring, reduced ? { opacity: 0.35 } : typingStyle]}
            />
          )}
          <Animated.View pointerEvents="none" style={[ring, rippleStyle]} />
          <View
            style={{
              width: spacing.sm,
              height: spacing.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.blue,
            }}
          />
        </Animated.View>
        <Text variant="small" color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
          {receivedAt > 0 ? (
            <>
              <Text variant="small" weight="medium" color={colors.silver}>
                {partnerName}
              </Text>
              {' is thinking of you ♥'}
            </>
          ) : sentAt > 0 ? (
            <>
              {'sent to '}
              <Text variant="small" weight="medium" color={colors.silver}>
                {partnerName}
              </Text>
            </>
          ) : (
            <>
              <Text variant="small" weight="medium" color={colors.silver}>
                {partnerName}
              </Text>
              {' is '}
              {desc}
            </>
          )}
        </Text>
      </AnimatedPressable>
    </Reveal>
  );
}
