// features/home/ui/StoryStates.tsx — the feed's three non-story states:
// loading skeleton, load error, and the empty page. None of them is a
// recycled row (they live in ListEmptyComponent), so entrances key off mount —
// but every loop here is an idle loop that cancels on unmount, and reduced
// motion renders every state statically with identical content. The empty
// page keeps its staggered tile deal and then lets the tiles levitate,
// whisper-quiet, forever — the one place the feed is allowed a living loop.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
} from 'react-native-reanimated';
import { Button, Card, Icon, Reveal, Skeleton, Text, type IconName } from '../../../ui';
import { colors, radius, spacing } from '../../../theme/theme';

// local spring character, copied from the deck (theme tokens stay untouched)
const STATE_SPRING = { damping: 22, stiffness: 140, mass: 1 }; // a soft landing — the springSoft character

// empty-state tiles: entrance stagger (150 + i·90) then the levitate starts
// once the deal has settled, each tile 240ms out of phase with its neighbour
const TILE_BOB_DY = -3;
const TILE_SETTLE_MS = 700;
const TILE_PHASE_MS = 240;

/** One quiet entrance for a state block: fade + a 10dp rise on the soft
 *  spring, staggered by `delay`. Reduced motion: rendered at rest. */
function DealIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(reduced ? 1 : 0);
  const y = useSharedValue(reduced ? 0 : 10);

  useEffect(() => {
    if (reduced) return;
    o.value = withDelay(delay, withSpring(1, STATE_SPRING));
    y.value = withDelay(delay, withSpring(0, STATE_SPRING));
  }, [reduced, delay, o, y]);

  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The empty page's idle life: a tile rises 3dp and sinks back on a slow
 *  reversed spring, phased per tile so the trio breathes like a wave, not a
 *  slab. The loop cancels on unmount; reduced motion never starts it. */
function FloatingTile({ index, children }: { index: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    // wait out the Reveal deal (150 + i·90) plus a settle beat before lifting
    const start = TILE_SETTLE_MS + index * 90 + index * TILE_PHASE_MS;
    bob.value = withDelay(start, withRepeat(withSpring(TILE_BOB_DY, STATE_SPRING), -1, true));
    return () => cancelAnimation(bob);
  }, [reduced, index, bob]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Loading silhouette: the day label, then three quiet-card ghosts, dealt in
 *  on a soft stagger. The shimmer itself is Skeleton's own loop. */
export function FeedSkeleton() {
  return (
    <View>
      <DealIn>
        <Skeleton
          width={90}
          height={11}
          style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
        />
      </DealIn>
      {[0, 1, 2].map((i) => (
        <DealIn key={i} delay={90 + i * 90}>
          <View
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
        </DealIn>
      ))}
    </View>
  );
}

export function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <DealIn>
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
          the story would not load, but nothing is missing
        </Text>
        <Button label="try again" tone="secondary" onPress={onRetry} />
      </Card>
    </DealIn>
  );
}

const EMPTY_TILE_ICONS: IconName[] = ['sparkle', 'letter', 'mic'];

export function FeedEmpty({ partnerName }: { partnerName: string }) {
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
            {/* the bob rides an inner wrapper, so the middle tile's static
                -sm offset below composes instead of being overwritten */}
            <FloatingTile index={i}>
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
            </FloatingTile>
          </Reveal>
        ))}
      </View>
      <Text variant="overline" color={colors.muted} style={{ textTransform: 'uppercase' }}>
        the story so far
      </Text>
      <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
        nothing here yet. send a mood, seal a letter, or leave {partnerName} a voice note. it
        all shows up here.
      </Text>
    </View>
  );
}
