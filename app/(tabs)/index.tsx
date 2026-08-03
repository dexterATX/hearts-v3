// app/(tabs)/index.tsx — home: one overview panel (mood + days + presence) and
// the mood deck above the grouped story; FeedList is the one scroller, a mini
// status pill fades in on scroll so the dashboard never fully leaves.
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '../../theme/theme';
import { MoodBunny, Reveal, Text } from '../../ui';
import { useSession, usePartnerName } from '../../lib/session/store';
import {
  FeedList,
  OutboxBanner,
  daysTogether,
  daysLabel,
  useCouple,
  useFeed,
  useHomeSync,
} from '../../features/home';
import {
  MoodCard,
  MoodDeck,
  latestPerAuthor,
  useMoods,
  useMoodSync,
  useSendMood,
} from '../../features/mood';
import { describePresence, usePartnerPresence, usePublishPresence } from '../../features/presence';
import type { StoryLine } from '../../features/home';

// Scroll distance over which the hero counter fades/shrinks into the pill.
const HERO_RANGE = 160;

// stable empty reference — a fresh [] per render re-renders the feed for nothing
const EMPTY_STORY: StoryLine[] = [];

export default function HomeTab() {
  usePublishPresence('index');
  useHomeSync();
  useMoodSync();
  const couple = useCouple();
  const feed = useFeed();
  const moods = useMoods();
  const sendMood = useSendMood();
  const partnerId = useSession((s) => s.partner?.id ?? null);
  const myId = useSession((s) => s.userId);
  const partnerName = usePartnerName();
  const partnerHere = usePartnerPresence();

  const scrollY = useSharedValue(0);
  const reduced = useReducedMotion();

  // the mini pill's payload: days, plus who's here and how they feel right now
  const partnerMood = partnerId
    ? latestPerAuthor(moods.data ?? []).get(partnerId)?.mood
    : undefined;

  // the overview panel's folded-in read-outs
  const days = daysTogether(couple.data?.anniversary_date ?? null);
  const daysText = days === null ? null : days === 0 ? 'day one. today. ♥' : `${days} days of us`;
  const presenceText = partnerHere ? describePresence(partnerHere) : null;

  const onPressRow = useCallback((line: StoryLine) => {
    if (line.kind === 'letter') router.push(`/letters/${line.id}`);
    else router.push('/(tabs)/us'); // voice + photo both live on the us tab
  }, []);

  const onSendMood = useCallback((k: Parameters<typeof sendMood>[0]) => void sendMood(k), [sendMood]);
  const onRefreshFeed = useCallback(() => void feed.refetch(), [feed.refetch]);

  // Mini status pill: the counter's understudy, fading in as you scroll past the panel.
  const miniStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: 0 }
      : {
          opacity: interpolate(
            scrollY.value,
            [HERO_RANGE - 20, HERO_RANGE + 20],
            [0, 1],
            Extrapolation.CLAMP,
          ),
          transform: [
            {
              translateY: interpolate(
                scrollY.value,
                [HERO_RANGE - 20, HERO_RANGE + 20],
                [-8, 0],
                Extrapolation.CLAMP,
              ),
            },
          ],
        },
  );

  // Two memos, deliberately split: the panel rebuilds when mood data lands,
  // but the deck must NOT re-render mid-flight because of it (P0 jank).
  const panelElement = useMemo(
    () => (
      <View style={{ gap: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
        <OutboxBanner />
        <View style={{ paddingHorizontal: spacing.lg }}>
          <MoodCard
            rows={moods.data ?? []}
            partnerId={partnerId}
            partnerName={partnerName}
            loading={moods.isPending}
            daysText={daysText}
            presenceText={presenceText}
          />
        </View>
      </View>
    ),
    [moods.data, moods.isPending, partnerId, partnerName, daysText, presenceText],
  );

  const deckElement = useMemo(
    () => (
      <Reveal delay={300} dy={16} soft>
        <MoodDeck onSend={onSendMood} partnerName={partnerName} />
      </Reveal>
    ),
    [onSendMood, partnerName],
  );

  const headerElement = useMemo(
    () => (
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
        {panelElement}
        {deckElement}
      </View>
    ),
    [panelElement, deckElement],
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <FeedList
        days={feed.story ?? EMPTY_STORY}
        loading={feed.isLoading}
        error={feed.error ? 'the feed would not load' : null}
        partnerName={partnerName}
        myId={myId}
        header={headerElement}
        scrollY={scrollY}
        refreshing={feed.isRefetching}
        onRefresh={onRefreshFeed}
        onPressRow={onPressRow}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: spacing.sm, left: 0, right: 0, alignItems: 'center' },
          miniStyle,
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.surface,
            borderRadius: radius.pill,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.lg,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          {partnerHere ? (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: radius.pill,
                backgroundColor: colors.blue,
              }}
            />
          ) : null}
          <Text variant="overline" color={colors.silver} style={{ textTransform: 'uppercase' }}>
            {daysLabel(daysTogether(couple.data?.anniversary_date ?? null))}
          </Text>
          {partnerMood ? (
            <MoodBunny mood={partnerMood} size={16} />
          ) : null}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
