// features/photos/model.ts — pure photo logic. No RN imports.
import type { PhotoRow, AlbumRow } from '../../lib/db/database.types';
import { newUuid } from '../../lib/id';

export function photosInAlbum(photos: readonly PhotoRow[], albumId: string | null): PhotoRow[] {
  return photos
    .filter((p) => (albumId === null ? p.album_id === null : p.album_id === albumId))
    .sort((a, b) => (b.taken_at ?? b.created_at).localeCompare(a.taken_at ?? a.created_at));
}

/** "On this day" (§7.11): photos taken this month-day in any earlier year. */
export function onThisDay(photos: readonly PhotoRow[], now = new Date()): PhotoRow[] {
  const mmdd = now.toISOString().slice(5, 10);
  const thisYear = now.getFullYear();
  return photos.filter((p) => {
    const at = p.taken_at ?? p.created_at;
    return at.slice(5, 10) === mmdd && new Date(at).getFullYear() < thisYear;
  });
}

export function coverFor(album: AlbumRow, photos: readonly PhotoRow[]): PhotoRow | null {
  if (album.cover_photo_id) {
    const found = photos.find((p) => p.id === album.cover_photo_id);
    if (found) return found;
  }
  const inAlbum = photosInAlbum(photos, album.id);
  return inAlbum[0] ?? null;
}

/** Storage path convention: {couple_id}/{photo_id}.jpg — RLS on
 *  storage.objects scopes segment 1 to the couple (0001_init.sql §7). */
export function storagePathFor(coupleId: string, photoId: string, ext = 'jpg'): string {
  return `${coupleId}/${photoId}.${ext}`;
}

/** EXIF DateTimeOriginal is "YYYY:MM:DD HH:MM:SS" — NOT ISO. Normalise or
 *  drop it; anything else breaks on-this-day and sorting. */
export function exifDateToIso(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function newPhotoId(): string {
  return newUuid();
}
