// features/home/ui/FeedList.tsx — everything either of us did, newest first.
// The `header` slot carries the screen above the list, so the route never
// nests this list inside a ScrollView (which would kill virtualization).
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Card, Text, Skeleton } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { feedLine, type FeedItem } from '../model';

function iconFor(kind: FeedItem['kind']): string {
  switch (kind) {
    case 'mood':
      return '💭';
    case 'letter':
      return '💌';
    case 'voice':
      return '🎙️';
    case 'photo':
      return '📷';
  }
}

export function FeedList({
  items,
  loading,
  error,
  names,
  myId,
  header,
}: {
  items: FeedItem[];
  loading: boolean;
  error?: string | null;
  names: { me: string; her: string };
  myId: string | null;
  header?: React.ReactNode;
}) {
  if (loading) {
    return (
      <View style={{ padding: spacing.lg }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={52} style={{ marginBottom: spacing.md }} />
        ))}
      </View>
    );
  }
  if (error && items.length === 0) {
    return (
      <View>
        {header}
        <Card style={{ margin: spacing.lg, borderColor: colors.rose }}>
          <Text variant="small" color={colors.rose}>
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
            <Card style={{ margin: spacing.lg }}>
              <Text variant="small" color={colors.muted}>
                nothing here yet — send a mood, seal a letter, leave her a voice note.
                this becomes the little history of us.
              </Text>
            </Card>
          ) : null}
        </>
      }
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      renderItem={({ item }) => (
        <Card style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingVertical: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="body" style={{ marginRight: spacing.sm }}>
              {iconFor(item.kind)}
            </Text>
            <View style={{ flex: 1 }}>
              <Text variant="small">{feedLine(item, names, myId ?? '')}</Text>
              <Text variant="caption" color={colors.muted}>
                {new Date(item.at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        </Card>
      )}
    />
  );
}
