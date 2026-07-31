// features/photos/index.ts — public surface only.
export {
  useAlbums,
  usePhotos,
  usePhotoSync,
  useAddPhoto,
  useAddAlbum,
  usePhotoUrl,
  usePhotoUrlMap,
  type UploadState,
} from './hooks';
export { photosInAlbum, onThisDay, coverFor, storagePathFor, exifDateToIso } from './model';
export { PhotoGrid } from './ui/PhotoGrid';
export { AlbumsRail } from './ui/AlbumsRail';
