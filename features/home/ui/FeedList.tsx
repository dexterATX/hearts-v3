// features/home/ui/FeedList.tsx — everything either of us did, newest first.
// The `header` slot carries the screen above the list, so the route never
// nests this list inside a ScrollView (which would kill virtualization).
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Card, Text, Icon, SkeletonCard, type IconName } from '../../../ui';
import { colors, radius, spacing } from '../../../theme/theme';
import { feedLine, type FeedItem } from '../model';

function iconFor(kind: FeedItem['kind']): IconName {
  switch (kind) {
    case 'mood':
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
  items,
  loading,
  error,
  partnerName,
  myId,
  header,
}: {
  items: FeedItem[];
  loading: boolean;
  error?: string | null;
  partnerName: string;
  myId: string | null;
  header?: React.ReactNode;
}) {
  if (loading) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} lines={1} />
        ))}
      </View>
    );
  }
  if (error && items.length === 0) {
    return (
      <View>
        {header}
        <Card
          variant="danger"
          style={{
            marginHorizontal: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <Icon name="alert" size={20} color={colors.danger} />
          <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
            {error} — pull down to try again
          </Text>
        </Card>
      </View>
    );
  }
  return (
    <FlashList
      data={items}
      keyExtractor={(item) => `${item.kind}-${item.id}`}
      ListHeaderComponent={
        <>
          {header}
          {items.length === 0 ? (
            <Card style={{ marginHorizontal: spacing.lg }}>
              <Text variant="body" color={colors.muted}>
                nothing here yet — send a mood, seal a letter, leave {partnerName} a voice
                note. this becomes the little history of us.
              </Text>
            </Card>
          ) : null}
        </>
      }
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      renderItem={({ item }) => (
        // quiet: thirty shadows stacked down a list turn the page to mush
        <Card
          variant="quiet"
          style={{
            marginHorizontal: spacing.lg,
            marginBottom: spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <View
            style={{
              width: spacing.xxl,
              height: spacing.xxl,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 3,
              borderColor: colors.line,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={iconFor(item.kind)} size={16} color={colors.muted} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="small" color={colors.ink}>
              {feedLine(item, partnerName, myId ?? '')}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {new Date(item.at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </Card>
      )}
    />
  );
}
