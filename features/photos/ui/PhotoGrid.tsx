// features/photos/ui/PhotoGrid.tsx — albums + grid + viewer + on-this-day.
import { useState } from 'react';
import { View, Pressable, Modal, Dimensions, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Text, Card, Skeleton, Icon } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { usePhotos, usePhotoUrl, usePhotoUrlMap } from '../hooks';
import { photosInAlbum, onThisDay } from '../model';
import type { PhotoRow } from '../../../lib/db/database.types';

// One gutter value everywhere. Each cell carries half of it on every side, and
// the list's horizontal padding is short by that same half — so the outer edge
// lands exactly on spacing.lg and every interior gap is exactly GUTTER.
const GUTTER = spacing.xs;
const EDGE = spacing.lg - GUTTER / 2;
const COLS = 3;
const MEMORY_SIZE = spacing.huge * 2;

/** Image width for a COLS-wide grid inside `width` px of screen. */
function cellSize(width: number): number {
  return Math.floor((width - EDGE * 2) / COLS) - GUTTER;
}

function Thumb({
  size,
  url,
  onPress,
}: {
  size: number;
  url: string | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel="open this photo" onPress={onPress}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{
            width: size,
            height: size,
            borderRadius: radius.sm,
            borderWidth: 3,
            borderColor: colors.line,
            backgroundColor: colors.surfaceAlt,
          }}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <Skeleton width={size} height={size} style={{ borderRadius: radius.sm }} />
      )}
    </Pressable>
  );
}

/** Grid cell: the half-gutter frame that makes the columns line up. */
function Cell({ children }: { children: React.ReactNode }) {
  return <View style={{ padding: GUTTER / 2 }}>{children}</View>;
}

function Viewer({ photo, onClose }: { photo: PhotoRow; onClose: () => void }) {
  const url = usePhotoUrl(photo.storage_path);
  const { width } = Dimensions.get('window');
  return (
    <Modal visible transparent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="close photo"
        style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingVertical: spacing.xl }}
        onPress={onClose}
      >
        {url ? (
          <Image source={{ uri: url }} style={{ width, height: width * 1.25 }} contentFit="contain" />
        ) : (
          <Skeleton width={width - spacing.xxl} height={width} style={{ alignSelf: 'center' }} />
        )}
        {photo.caption ? (
          <Text
            variant="body"
            style={{ textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.xl }}
          >
            {photo.caption}
          </Text>
        ) : null}
        <Text
          variant="overline"
          color={colors.muted}
          style={{ textAlign: 'center', marginTop: spacing.xl, textTransform: 'uppercase' }}
        >
          tap anywhere to close
        </Text>
      </Pressable>
    </Modal>
  );
}

export function PhotoGrid({ albumId }: { albumId: string | null }) {
  const photos = usePhotos();
  const [viewing, setViewing] = useState<PhotoRow | null>(null);
  const { width } = Dimensions.get('window');
  const size = cellSize(width);

  // hooks first, early returns after — the batch sign happens ONCE per data
  // change for the whole grid (round-8 perf finding)
  const all = photos.data ?? [];
  const rows = photosInAlbum(all, albumId);
  const memory = albumId === null ? onThisDay(all) : [];
  const urlMap = usePhotoUrlMap(rows.map((p) => p.storage_path));
  const memoryUrlMap = usePhotoUrlMap(memory.map((p) => p.storage_path));

  if (photos.isLoading) {
    return (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: EDGE,
          paddingVertical: spacing.lg - GUTTER / 2,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Cell key={i}>
            <Skeleton width={size} height={size} style={{ borderRadius: radius.sm }} />
          </Cell>
        ))}
      </View>
    );
  }

  if (photos.error && !photos.data) {
    return (
      <Card
        variant="danger"
        style={{ margin: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        <Icon name="alert" size={spacing.xl} color={colors.danger} />
        <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
          the photos would not load, check your signal and pull down to try again
        </Text>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card style={{ margin: spacing.lg, alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
        <Icon name="image" size={spacing.xxl} color={colors.muted} />
        <Text variant="small" color={colors.muted} style={{ textAlign: 'center' }}>
          {albumId
            ? 'this album is still empty. add the first photo of it'
            : 'no photos yet. the first one you add becomes page one of us'}
        </Text>
      </Card>
    );
  }

  return (
    <>
      <FlashList
        data={rows}
        numColumns={COLS}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: EDGE, paddingVertical: spacing.lg - GUTTER / 2 }}
        ListHeaderComponent={
          memory.length > 0 ? (
            <Card variant="accent" style={{ margin: GUTTER / 2, marginBottom: spacing.xl }}>
              <Text
                variant="overline"
                color={colors.blue}
                style={{ marginBottom: spacing.md, textTransform: 'uppercase' }}
              >
                on this day
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {memory.map((p) => (
                  <Thumb
                    key={p.id}
                    size={MEMORY_SIZE}
                    url={memoryUrlMap[p.storage_path]}
                    onPress={() => setViewing(p)}
                  />
                ))}
              </ScrollView>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Cell>
            <Thumb size={size} url={urlMap[item.storage_path]} onPress={() => setViewing(item)} />
          </Cell>
        )}
      />
      {viewing ? <Viewer photo={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
