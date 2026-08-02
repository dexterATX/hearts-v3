// features/home/ui/FeedList.tsx — the calm timeline: everything either of us
// did, condensed into story days, newest day first.
// The `header` slot carries the dashboard above the list, so the route never
// nests this list inside a ScrollView (which would kill virtualization).
// Rows are deliberately static: no entering animations and no shine in a
// recycling list — the page's one accent surface is the MoodCard up top.
import { Fragment } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';
import { Button, Card, Icon, MoodBunny, Reveal, Skeleton, Text, type IconName } from '../../../ui';
import { colors, radius, spacing } from '../../../theme/theme';
import { feedLine, timeAgo, type StoryDay, type StoryLine } from '../model';

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<FlashListProps<StoryDay>>,
);

const keyExtractor = (d: StoryDay) => d.day;

/** Emojis past this cap in one mood run collapse into a faint ` +n`. */
const MOOD_TRAIL_CAP = 6;

function iconFor(kind: StoryLine['kind']): IconName {
  switch (kind) {
    case 'moods':
      return 'sparkle';
    case 'letter':
      return 'letter';
    case 'voice':
      return 'mic';
    case 'photo':
      return 'image';
  }
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
}) {
  // Unconditional: the route's hero-recede reads scrollY even for empty states,
  // so this hook can never sit behind an early return.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

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
              could not refresh — showing what this phone has
            </Text>
          ) : null}
          {days.length > 0 && !loading ? (
            <Text
              variant="overline"
              color={colors.faint}
              style={{
                textTransform: 'uppercase',
                paddingHorizontal: spacing.lg,
                marginBottom: spacing.md,
              }}
            >
              our story
            </Text>
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
      renderItem={({ item }) => (
        <DayCard day={item} partnerName={partnerName} myId={myId} onPressRow={onPressRow} />
      )}
    />
  );
}

/** One quiet card per day: an overline label, then bare rows split by hairlines. */
function DayCard({
  day,
  partnerName,
  myId,
  onPressRow,
}: {
  day: StoryDay;
  partnerName: string;
  myId: string | null;
  onPressRow?: (line: StoryLine) => void;
}) {
  return (
    <Card variant="quiet" style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }}>
      <Text
        variant="overline"
        color={colors.silver}
        style={{ textTransform: 'uppercase', marginBottom: spacing.xs }}
      >
        {day.label}
      </Text>
      {day.lines.map((line, i) => (
        <Fragment key={line.id}>
          {i > 0 ? (
            <View
              style={{
                height: 1,
                backgroundColor: colors.line,
                marginLeft: spacing.lg + 16 + spacing.md,
              }}
            />
          ) : null}
          <StoryRow line={line} partnerName={partnerName} myId={myId} onPressRow={onPressRow} />
        </Fragment>
      ))}
    </Card>
  );
}

function StoryRow({
  line,
  partnerName,
  myId,
  onPressRow,
}: {
  line: StoryLine;
  partnerName: string;
  myId: string | null;
  onPressRow?: (line: StoryLine) => void;
}) {
  const who = line.authorId === myId ? 'you' : partnerName;
  // The list's single accent: a voice note from them, unheard — new, for you,
  // playable now. Blue icon tile + chevron; every other row stays steel.
  const fresh = line.kind === 'voice' && line.authorId !== myId && !line.heard;
  // mood trails are ambient — nothing to open; gifts deep-link somewhere real
  const tappable = line.kind !== 'moods' && !!onPressRow;

  const row = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      {fresh ? (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.sm,
            backgroundColor: colors.blueTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="mic" size={16} color={colors.blue} />
        </View>
      ) : (
        <Icon name={iconFor(line.kind)} size={16} color={colors.muted} />
      )}
      {line.kind === 'moods' ? (
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            overflow: 'hidden',
          }}
        >
          <Text variant="small" color={colors.muted} numberOfLines={1}>
            <Text variant="small" weight="medium" color={colors.ink}>
              {who}
            </Text>
            {' felt'}
          </Text>
          <MoodTrail steps={line.steps} />
        </View>
      ) : (
        <Text variant="small" color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>
          <Text variant="small" weight="medium" color={colors.ink}>
            {who}
          </Text>
          {feedRest(line, partnerName, myId, who)}
        </Text>
      )}
      <Text variant="caption" color={colors.faint}>
        {timeAgo(line.at)}
      </Text>
      {fresh ? (
        <Icon name="chevronRight" size={16} color={colors.blue} />
      ) : tappable ? (
        <Icon name="chevronRight" size={16} color={colors.faint} />
      ) : null}
    </View>
  );

  if (!tappable) return row;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPressRow(line)}
      style={({ pressed }) => [
        { marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
      ]}
    >
      {row}
    </Pressable>
  );
}

/** the trail of bunnies showing the run; long runs cap at 6 and a faint ` +n`. */
function MoodTrail({ steps }: { steps: string[] }) {
  const shown = steps.slice(0, MOOD_TRAIL_CAP);
  const extra = steps.length - shown.length;
  return (
    <>
      {shown.map((s, i) => (
        <MoodBunny key={`${s}-${i}`} mood={s} size={18} />
      ))}
      {extra > 0 ? (
        <Text variant="small" color={colors.faint}>{` +${extra}`}</Text>
      ) : null}
    </>
  );
}

/** feedLine returns the whole sentence; the row already renders `who` as its
 *  own emphasized prefix, so strip the subject off the front — the same
 *  name-then-rest split PresenceChip composes by hand. */
function feedRest(line: StoryLine, partnerName: string, myId: string | null, who: string): string {
  const full = feedLine(line, partnerName, myId ?? '');
  return full.startsWith(who) ? full.slice(who.length) : ` ${full}`;
}

/** Loading silhouette: the day label, then three quiet-card ghosts. */
function FeedSkeleton() {
  return (
    <View>
      <Skeleton
        width={90}
        height={11}
        style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
      />
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.line,
            padding: spacing.lg,
            marginHorizontal: spacing.lg,
            marginBottom: spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <Skeleton width={28} height={28} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="40%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card
      variant="quiet"
      style={{
        marginHorizontal: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Icon name="alert" size={20} color={colors.muted} />
      <Text variant="small" color={colors.muted} style={{ flex: 1 }}>
        the story would not load — nothing of yours is gone
      </Text>
      <Button label="try again" tone="secondary" onPress={onRetry} />
    </Card>
  );
}

const EMPTY_TILE_ICONS: IconName[] = ['sparkle', 'letter', 'mic'];

function FeedEmpty({ partnerName }: { partnerName: string }) {
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.huge,
        paddingHorizontal: spacing.xl,
        gap: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {EMPTY_TILE_ICONS.map((name, i) => (
          <Reveal key={name} delay={150 + i * 90}>
            <View
              style={{
                width: spacing.xxl,
                height: spacing.xxl,
                borderRadius: radius.sm,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ translateY: i === 1 ? -spacing.sm : 0 }],
              }}
            >
              <Icon name={name} size={16} color={colors.faint} />
            </View>
          </Reveal>
        ))}
      </View>
      <Text variant="overline" color={colors.muted} style={{ textTransform: 'uppercase' }}>
        the story so far
      </Text>
      <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
        nothing here yet — send a mood, seal a letter, leave {partnerName} a voice note. this
        becomes the little history of us.
      </Text>
    </View>
  );
}
