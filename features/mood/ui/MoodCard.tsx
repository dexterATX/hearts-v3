// features/mood/ui/MoodCard.tsx — her live mood as an overview panel.
// The page's one accent surface: a lit left panel carrying the bunny over a
// breathing radial glow (popping in whenever the mood changes), and a right
// rail with the read-out — what she feels, when it landed, and the trail of
// her day so far.
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text as RNText, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Card, MoodBunny, Reveal, Skeleton, Text } from '../../../ui';
import { colors, motion, radius, spacing } from '../../../theme/theme';
import { moodMeta, latestPerAuthor } from '../model';
import type { MoodRow } from '../../../lib/db/database.types';

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// gradient ids resolve per document; every instance mints its own
let uid = 0;

// the emoji's slow drift — one symmetric cycle every 5 seconds
const BOB = { duration: 2500, easing: Easing.inOut(Easing.quad) };

const PANEL: ViewStyle = { flexDirection: 'row', alignItems: 'stretch', padding: 0 };

export function MoodCard({
  rows,
  partnerId,
  partnerName,
  loading = false,
  daysText = null,
  presenceText = null,
}: {
  rows: MoodRow[];
  partnerId: string | null;
  partnerName: string;
  loading?: boolean;
  /** "212 days of us" — the counter, folded into the panel */
  daysText?: string | null;
  /** "on the home screen" — live presence, folded into the panel */
  presenceText?: string | null;
}) {
  const latest = partnerId ? latestPerAuthor(rows).get(partnerId) : undefined;

  // her trail today, oldest → newest (the current mood included, capped at 5)
  const today = useMemo(() => {
    if (!partnerId) return [];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return rows
      .filter((r) => r.author_id === partnerId && new Date(r.created_at).getTime() >= start)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-5);
  }, [rows, partnerId]);

  const pop = useSharedValue(1);
  const glow = useSharedValue(0.55);
  const breathe = useSharedValue(1);
  const bob = useSharedValue(0);
  const reduced = useReducedMotion();
  const [glowId] = useState(() => `moodglow${uid++}`);
  const [, setTick] = useState(0);

  // keep the "xm ago" caption honest — re-render once a minute
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // a new mood pops in and the glow flares, then settles back to idle
  useEffect(() => {
    if (!latest || reduced) return;
    pop.value = 0.4;
    pop.value = withSpring(1, motion.spring);
    glow.value = withSequence(
      withTiming(1, { duration: motion.fadeMs }),
      withTiming(0.55, { duration: 600 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps — shared values are stable
  }, [latest?.id, reduced]);

  // the glow breathes and the bunny drifts, until the next mood arrives
  useEffect(() => {
    if (!reduced) {
      breathe.value = withRepeat(withTiming(0.85, { duration: 2400 }), -1, true);
      bob.value = withRepeat(withSequence(withTiming(1, BOB), withTiming(0, BOB)), -1, false);
    }
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(bob);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps — shared values are stable
  }, [reduced]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * breathe.value }));
  const popStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pop.value },
      { translateY: interpolate(bob.value, [0, 1], [0, -3]) },
    ],
  }));

  if (!partnerId) return null;

  if (loading) {
    return (
      <Reveal delay={160} dy={14} scale>
        <Card variant="accent" style={PANEL}>
          <View style={{ width: 132, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl }}>
            <Skeleton width={64} height={64} style={{ borderRadius: radius.pill }} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', gap: spacing.sm, padding: spacing.lg }}>
            <Skeleton width="45%" height={11} />
            <Skeleton width="70%" height={22} />
            <Skeleton width="35%" height={11} />
          </View>
        </Card>
      </Reveal>
    );
  }

  if (!latest) {
    return (
      <Reveal delay={160} dy={14} scale>
        <Card variant="quiet" style={PANEL}>
          <View style={{ width: 132, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl }}>
            <RNText style={{ fontSize: 44, lineHeight: 52, opacity: 0.45 }}>💭</RNText>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg }}>
            <Text variant="body" color={colors.muted}>
              {partnerName} has not sent a mood yet — the first one lands here the moment they tap it.
            </Text>
          </View>
        </Card>
      </Reveal>
    );
  }

  const meta = moodMeta(latest.mood);
  return (
    <Reveal delay={160} dy={14} scale>
      <Card variant="accent" style={PANEL}>
        {/* the left panel: the bunny, lit, on its own stage */}
        <View
          style={{
            width: 132,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: spacing.lg,
            borderRightWidth: 1,
            borderRightColor: colors.lineBright,
            backgroundColor: colors.blueSoft,
            borderTopLeftRadius: radius.md - 3.5,
            borderBottomLeftRadius: radius.md - 3.5,
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, glowStyle]}
          >
            <Svg width={132} height={120}>
              <Defs>
                <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={colors.blue} stopOpacity={0.55} />
                  <Stop offset="60%" stopColor={colors.blue} stopOpacity={0.18} />
                  <Stop offset="100%" stopColor={colors.blue} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={66} cy={60} r={60} fill={`url(#${glowId})`} />
            </Svg>
          </Animated.View>
          <Animated.View style={popStyle}>
            <MoodBunny mood={latest.mood} size={88} />
          </Animated.View>
        </View>

        {/* the right rail: the read-out + her trail today */}
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xs, padding: spacing.lg }}>
          <Text variant="overline" color={colors.faint} style={{ textTransform: 'uppercase' }}>
            right now
          </Text>
          <Text variant="heading" color={colors.ink}>
            {partnerName} feels{' '}
            <Text variant="heading" weight="bold" color={colors.blue}>
              {meta.label}
            </Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text variant="caption" color={colors.faint}>
              {timeAgo(latest.created_at)}
            </Text>
            {presenceText ? (
              <>
                <Text variant="caption" color={colors.faint}>
                  {' · '}
                </Text>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: radius.pill,
                    backgroundColor: colors.blue,
                  }}
                />
                <Text variant="caption" color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {presenceText}
                </Text>
              </>
            ) : null}
          </View>
          {daysText ? (
            <>
              <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.sm }} />
              <Text variant="title" weight="displaySemi" color={colors.ink}>
                {daysText}
              </Text>
            </>
          ) : null}
          {today.length > 1 ? (
            <>
              <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.sm }} />
              <Text variant="overline" color={colors.faint} style={{ textTransform: 'uppercase' }}>
                earlier today
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                {today.slice(0, -1).map((r) => (
                  <MoodBunny key={r.id} mood={r.mood} size={22} />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </Card>
    </Reveal>
  );
}
