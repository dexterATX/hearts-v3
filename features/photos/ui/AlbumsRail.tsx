// features/photos/ui/AlbumsRail.tsx — §7.11: browse by album.
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { useAlbums, usePhotos } from '../hooks';

export function AlbumsRail({
  activeAlbumId,
  onPick,
}: {
  activeAlbumId: string | null;
  onPick: (albumId: string | null) => void;
}) {
  const albums = useAlbums();
  const photos = usePhotos();
  const rows = albums.data ?? [];
  if (rows.length === 0) return null;

  return (
    <View style={{ paddingBottom: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
        <Pressable onPress={() => onPick(null)} style={{ marginRight: spacing.sm }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: activeAlbumId === null ? colors.rose : colors.line,
              borderRadius: radius.lg,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text variant="small" color={activeAlbumId === null ? colors.rose : colors.muted}>
              everything
            </Text>
          </View>
        </Pressable>
        {rows.map((a) => {
          const count = (photos.data ?? []).filter((p) => p.album_id === a.id).length;
          const active = activeAlbumId === a.id;
          return (
            <Pressable key={a.id} onPress={() => onPick(a.id)} style={{ marginRight: spacing.sm }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: active ? colors.rose : colors.line,
                  borderRadius: radius.lg,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text variant="small" color={active ? colors.rose : colors.muted}>
                  {a.title} {count > 0 ? `· ${count}` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
