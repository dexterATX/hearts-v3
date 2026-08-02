// features/photos/ui/AlbumsRail.tsx — §7.11: browse by album.
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { useAlbums, usePhotos } from '../hooks';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}>
      <View
        style={{
          borderWidth: 3,
          borderColor: active ? colors.blue : colors.line,
          backgroundColor: active ? colors.blueSoft : colors.surface,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text variant="caption" weight={active ? 'semibold' : 'medium'} color={active ? colors.blue : colors.muted}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

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
    <View style={{ paddingBottom: spacing.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
      >
        <Chip label="everything" active={activeAlbumId === null} onPress={() => onPick(null)} />
        {rows.map((a) => {
          const count = (photos.data ?? []).filter((p) => p.album_id === a.id).length;
          return (
            <Chip
              key={a.id}
              label={`${a.title} ${count > 0 ? `· ${count}` : ''}`}
              active={activeAlbumId === a.id}
              onPress={() => onPick(a.id)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
