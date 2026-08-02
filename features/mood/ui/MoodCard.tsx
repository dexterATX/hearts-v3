// features/mood/ui/MoodCard.tsx — her live mood on my home screen (§7.2).
// The one highlighted thing on the page, so it takes the accent surface:
// a big emoji over a breathing radial glow, popping in whenever the mood changes.
import { useEffect, useState } from 'react';
import { StyleSheet, Text as RNText, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Card, Reveal, Skeleton, Text } from '../../../ui';
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

// gradient ids resolve per document; a shared literal collides once several
// glows are on screen at once, so every instance mints its own (see MetallicFrame)
let uid = 0;

// one box for all three states, so the card never changes shape under you
const BOX: ViewStyle = { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm };

export function MoodCard({
  rows,
  partnerId,
  partnerName,
  loading = false,
}: {
  rows: MoodRow[];
  partnerId: string | null;
  partnerName: string;
  loading?: boolean;
}) {
  const latest = partnerId ? latestPerAuthor(rows).get(partnerId) : undefined;

  const pop = useSharedValue(1);
  const glow = useSharedValue(0.55);
  const breathe = useSharedValue(1);
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

  // the glow breathes until the next mood arrives; gated on motion preference
  useEffect(() => {
    if (!reduced) breathe.value = withRepeat(withTiming(0.85, { duration: 2400 }), -1, true);
    return () => cancelAnimation(breathe);
    // eslint-disable-next-line react-hooks/exhaustive-deps — shared values are stable
  }, [reduced]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * breathe.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  if (!partnerId) return null;

  if (loading) {
    return (
      <Reveal delay={160} dy={14} scale>
        <Card variant="accent" style={BOX}>
          <Skeleton width={44} height={44} style={{ borderRadius: radius.pill }} />
          <Skeleton width="60%" height={22} />
          <Skeleton width={80} height={11} />
        </Card>
      </Reveal>
    );
  }

  if (!latest) {
    return (
      <Reveal delay={160} dy={14} scale>
        <Card variant="quiet" style={BOX}>
          {/* emoji is content, not chrome — plain RNText so no fontFamily fights it */}
          <RNText style={{ fontSize: 56, lineHeight: 64, opacity: 0.45 }}>💭</RNText>
          <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
            {partnerName} has not sent a mood yet — the first one lands here the moment they tap it.
          </Text>
        </Card>
      </Reveal>
    );
  }

  const meta = moodMeta(latest.mood);
  return (
    <Reveal delay={160} dy={14} scale>
      <Card variant="accent" style={BOX}>
        <View style={{ width: 160, height: 144, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, glowStyle]}
          >
            <Svg width={160} height={144}>
              <Defs>
                <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={colors.blue} stopOpacity={0.55} />
                  <Stop offset="60%" stopColor={colors.blue} stopOpacity={0.18} />
                  <Stop offset="100%" stopColor={colors.blue} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={80} cy={72} r={72} fill={`url(#${glowId})`} />
            </Svg>
          </Animated.View>
          {/* the mood emoji IS the content here — plain RNText, no themed primitive */}
          <Animated.View style={popStyle}>
            <RNText style={{ fontSize: 76, lineHeight: 88 }}>{meta.emoji}</RNText>
          </Animated.View>
        </View>
        <Text variant="heading" color={colors.ink} style={{ textAlign: 'center' }}>
          {partnerName} feels {meta.label}
        </Text>
        <Text variant="caption" color={colors.faint}>
          {timeAgo(latest.created_at)}
        </Text>
      </Card>
    </Reveal>
  );
}
