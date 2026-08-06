// features/home/ui/FeedList.tsx — the calm timeline: everything either of us
// did, condensed into story days, newest day first.
// The `header` slot carries the dashboard above the list, so the route never
// nests this list inside a ScrollView (which would kill virtualization).
// This file is the shell: scroll plumbing, pull-refresh, the header/empty
// branching, and the seen-set every entrance keys off. The animation grammar
// lives beside it — StoryDayCard (the deal cascade, row presses, the
// fresh-voice accent), StoryStates (skeleton/empty/error), useStoryArrivals
// (which lines just landed).
import { useEffect, useRef } from 'react';
import { RefreshControl } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../../ui';
import { colors, motion, spacing } from '../../../theme/theme';
import type { StoryDay, StoryLine } from '../model';
import { StoryDayCard } from './StoryDayCard';
import { FeedEmpty, FeedError, FeedSkeleton } from './StoryStates';
import { useStoryArrivals } from './useStoryArrivals';

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<FlashListProps<StoryDay>>,
);

const keyExtractor = (d: StoryDay) => d.day;

// local spring character, copied from the deck (theme tokens stay untouched)
const ROW_SPRING = { damping: 16, stiffness: 210, mass: 0.9 }; // quick, small overshoot

/** Reserved seenRef id for the header's own entrance — flagged like a row. */
const OVERLINE_KEY = '__overline__';

/** 'our story' arrives once, quietly: a fade plus a 6dp rise, 200ms late so
 *  it lands after the dashboard, then never moves again. The seenRef flag —
 *  not the mount — decides, so a remount with history renders at rest. */
function OverlineEntrance({
  seenRef,
  children,
}: {
  seenRef: { current: Set<string> };
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const entered = useRef(seenRef.current.has(OVERLINE_KEY));
  const o = useSharedValue(reduced || entered.current ? 1 : 0);
  const y = useSharedValue(reduced || entered.current ? 0 : 6);

  useEffect(() => {
    if (reduced || entered.current) return;
    entered.current = true;
    seenRef.current.add(OVERLINE_KEY);
    // opacity may take the short fade; the rise is always a spring
    o.value = withDelay(200, withTiming(1, { duration: motion.fadeMs }));
    y.value = withDelay(200, withSpring(0, ROW_SPRING));
  }, [reduced, seenRef, o, y]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

export function FeedList({
  days,
  loading,
  error,
  partnerName,
  myId,
  header,
  scrollY,
  refreshing,
  onRefresh,
  onPressRow,
  thumbs,
}: {
  days: StoryDay[];
  loading: boolean;
  error?: string | null;
  partnerName: string;
  myId: string | null;
  header?: React.ReactNode;
  scrollY: SharedValue<number>;
  refreshing: boolean;
  onRefresh: () => void;
  onPressRow?: (line: StoryLine) => void;
  /** photo id → signed thumbnail url, from useFeed */
  thumbs?: Record<string, string>;
}) {
  // Unconditional: the route's hero-recede reads scrollY even for empty states,
  // so this hook can never sit behind an early return.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // ids the feed has already shown. Entrances key off this set, never off
  // mount — FlashList recycles rows, and a recycled row holding a seen id
  // must render 100% statically, with no shared-value replay.
  const seenRef = useRef(new Set<string>());

  // lines that arrived since the previous payload — only those rows pop
  const newLineIds = useStoryArrivals(days);

  const daysEmpty = days.length === 0;
  useEffect(() => {
    // Only a from-scratch load (fresh query identity, nothing cached) forgets
    // what has been seen, so the next first paint deals again. Pull-refresh
    // and realtime refetches keep the set: history never replays its entrance
    // and only genuinely new ids animate in.
    if (loading && !refreshing && daysEmpty) seenRef.current.clear();
  }, [loading, refreshing, daysEmpty]);

  return (
    <AnimatedFlashList
      data={days}
      keyExtractor={keyExtractor}
      getItemType={() => 'day'}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.blue}
          colors={[colors.blue]}
          progressBackgroundColor={colors.surface}
        />
      }
      contentContainerStyle={{ paddingBottom: spacing.xxl, flexGrow: 1 }}
      ListHeaderComponent={
        <>
          {header}
          {error && days.length > 0 ? (
            <Text
              variant="caption"
              color={colors.muted}
              style={{ textAlign: 'center', marginBottom: spacing.md }}
            >
              could not refresh, showing the saved copy
            </Text>
          ) : null}
          {days.length > 0 && !loading ? (
            <OverlineEntrance seenRef={seenRef}>
              <Text
                variant="overline"
                color={colors.faint}
                style={{
                  textTransform: 'uppercase',
                  paddingHorizontal: spacing.lg,
                  marginBottom: spacing.lg,
                }}
              >
                our story
              </Text>
            </OverlineEntrance>
          ) : null}
        </>
      }
      ListEmptyComponent={
        loading ? (
          <FeedSkeleton />
        ) : error ? (
          <FeedError onRetry={onRefresh} />
        ) : (
          <FeedEmpty partnerName={partnerName} />
        )
      }
      renderItem={({ item, index }) => (
        <StoryDayCard
          day={item}
          partnerName={partnerName}
          myId={myId}
          onPressRow={onPressRow}
          cardIndex={index}
          newLineIds={newLineIds}
          seenRef={seenRef}
          thumbs={thumbs ?? {}}
        />
      )}
    />
  );
}
