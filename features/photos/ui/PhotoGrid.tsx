// features/photos/ui/PhotoGrid.tsx — albums + grid + viewer + on-this-day.
import { useState } from 'react';
import { View, Pressable, Modal, Dimensions, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Text, Card, Skeleton } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { usePhotos, usePhotoUrl, usePhotoUrlMap } from '../hooks';
import { photosInAlbum, onThisDay } from '../model';
import type { PhotoRow } from '../../../lib/db/database.types';

const GAP = 4;
const COLS = 3;

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
    <Pressable onPress={onPress}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, margin: GAP / 2, borderRadius: radius.sm }}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <Skeleton width={size} height={size} style={{ margin: GAP / 2 }} />
      )}
    </Pressable>
  );
}

function Viewer({ photo, onClose }: { photo: PhotoRow; onClose: () => void }) {
  const url = usePhotoUrl(photo.storage_path);
  const { width } = Dimensions.get('window');
  return (
    <Modal visible transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(15,10,18,0.96)', justifyContent: 'center' }}
        onPress={onClose}
      >
        {url ? (
          <Image source={{ uri: url }} style={{ width, height: width * 1.25 }} contentFit="contain" />
        ) : (
          <Skeleton width={width - 32} height={width} style={{ alignSelf: 'center' }} />
        )}
        {photo.caption ? (
          <Text variant="body" style={{ textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.xl }}>
            {photo.caption}
          </Text>
        ) : null}
        <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.sm }}>
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
  const size = (width - spacing.lg * 2 - GAP * COLS) / COLS;

  // hooks first, early returns after — the batch sign happens ONCE per data
  // change for the whole grid (round-8 perf finding)
  const all = photos.data ?? [];
  const rows = photosInAlbum(all, albumId);
  const memory = albumId === null ? onThisDay(all) : [];
  const urlMap = usePhotoUrlMap(rows.map((p) => p.storage_path));
  const memoryUrlMap = usePhotoUrlMap(memory.map((p) => p.storage_path));

  if (photos.isLoading) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: spacing.lg }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} width={size} height={size} style={{ margin: GAP / 2 }} />
        ))}
      </View>
    );
  }

  if (photos.error && !photos.data) {
    return (
      <Card style={{ margin: spacing.lg, borderColor: colors.rose }}>
        <Text variant="small" color={colors.rose}>
          the photos would not load — check your signal and pull down to try again
        </Text>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card style={{ margin: spacing.lg }}>
        <Text variant="small" color={colors.muted}>
          {albumId
            ? 'this album is still empty — add the first photo of it'
            : 'no photos yet — the first one you add becomes page one of us'}
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
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          memory.length > 0 ? (
            <Card style={{ marginBottom: spacing.lg, borderColor: colors.gold }}>
              <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.xs }}>
                on this day
              </Text>
              <ScrollView horizontal>
                {memory.map((p) => (
                  <Thumb key={p.id} size={96} url={memoryUrlMap[p.storage_path]} onPress={() => setViewing(p)} />
                ))}
              </ScrollView>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Thumb size={size} url={urlMap[item.storage_path]} onPress={() => setViewing(item)} />
        )}
      />
      {viewing ? <Viewer photo={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
