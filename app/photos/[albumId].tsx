// app/photos/[albumId].tsx — thin route; the slice owns the grid.
import { useLocalSearchParams } from 'expo-router';
import { PhotoGrid, usePhotoSync } from '../../../features/photos';
import { usePublishPresence } from '../../../features/presence';

export default function AlbumRoute() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  usePublishPresence('photos');
  usePhotoSync();
  return <PhotoGrid albumId={albumId ?? null} />;
}
