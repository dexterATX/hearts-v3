// app/(tabs)/index.tsx — home: the choreographed dashboard (presence, days hero, live mood) above the grouped story; FeedList is the one scroller, the hero recedes into a mini pill on scroll.
import { useMemo } from 'react';
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
import { MoodBunny, Text } from '../../ui';
import { useSession, usePartnerName } from '../../lib/session/store';
import {
  DaysTogether,
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
  MoodChips,
  latestPerAuthor,
  useMoods,
  useMoodSync,
  useSendMood,
} from '../../features/mood';
import { PresenceChip, usePartnerPresence, usePublishPresence } from '../../features/presence';
import type { StoryLine } from '../../features/home';

// Scroll distance over which the hero counter fades/shrinks into the pill.
const HERO_RANGE = 160;

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

  const onPressRow = (line: StoryLine) => {
    if (line.kind === 'letter') router.push(`/letters/${line.id}`);
    else router.push('/(tabs)/us'); // voice + photo both live on the us tab
  };

  // Hero recede: the big counter quietly falls back as the story takes over.
  const heroStyle = useAnimatedStyle(() =>
    reduced
      ? {}
      : {
          opacity: interpolate(scrollY.value, [0, HERO_RANGE * 0.75], [1, 0.15], Extrapolation.CLAMP),
          transform: [
            { scale: interpolate(scrollY.value, [0, HERO_RANGE], [1, 0.88], Extrapolation.CLAMP) },
            { translateY: interpolate(scrollY.value, [0, HERO_RANGE], [0, -14], Extrapolation.CLAMP) },
          ],
        },
  );

  // Mini status pill: the counter's understudy, fading in as the hero exits.
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

  const headerElement = useMemo(
    () => (
      <View style={{ gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl }}>
        <OutboxBanner />
        <PresenceChip />
        <Animated.View style={heroStyle}>
          <DaysTogether anniversary={couple.data?.anniversary_date ?? null} loading={couple.isPending} />
        </Animated.View>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <MoodCard
            rows={moods.data ?? []}
            partnerId={partnerId}
            partnerName={partnerName}
            loading={moods.isPending}
          />
        </View>
        <View>
          <Text
            variant="overline"
            color={colors.faint}
            style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: -spacing.xs }}
          >
            how are you right now
          </Text>
          <MoodChips onPick={(k) => void sendMood(k)} />
        </View>
      </View>
    ),
    [
      couple.data?.anniversary_date,
      couple.isPending,
      moods.data,
      moods.isPending,
      partnerId,
      partnerName,
      myId,
      feed.error,
      feed.isPending,
      sendMood,
      heroStyle,
    ],
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <FeedList
        days={feed.story ?? []}
        loading={feed.isLoading}
        error={feed.error ? 'the feed would not load' : null}
        partnerName={partnerName}
        myId={myId}
        header={headerElement}
        scrollY={scrollY}
        refreshing={feed.isRefetching}
        onRefresh={() => void feed.refetch()}
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
