// features/photos/hooks.ts — albums, upload progress, on-this-day.
// Offline display of fetched photos comes from expo-image's memory-disk cache.
import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useSession } from '../../lib/session/store';
import { enqueue } from '../../lib/sync/outbox';
import { emit, on } from '../../lib/sync/bus';
import { supabase } from '../../lib/db/client';
import {
  fetchAlbums,
  fetchPhotos,
  uploadSmall,
  uploadWithProgress,
  signedPhotoUrl,
  signedPhotoUrls,
} from './api';
import { storagePathFor, newPhotoId, exifDateToIso } from './model';
import { newUuid } from '../../lib/id';
import type { PhotoRow, AlbumRow } from '../../lib/db/database.types';

const ALBUMS_KEY = ['albums'] as const;
const PHOTOS_KEY = ['photos'] as const;

export function useAlbums() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...ALBUMS_KEY, coupleId],
    queryFn: async () => {
      const res = await fetchAlbums(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

export function usePhotos() {
  const coupleId = useSession((s) => s.coupleId);
  return useQuery({
    queryKey: [...PHOTOS_KEY, coupleId],
    queryFn: async () => {
      const res = await fetchPhotos(coupleId as string);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!coupleId,
  });
}

/** Live wiring: photo:new fast path + postgres_changes catch-up. */
export function usePhotoSync() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!coupleId) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: [...PHOTOS_KEY, coupleId] });
    };
    const off = on('photo:new', invalidate);
    const channel = supabase
      .channel(`photos-catchup:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos', filter: `couple_id=eq.${coupleId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      off();
      supabase.removeChannel(channel);
    };
  }, [coupleId, queryClient]);
}

export type UploadState = { photoId: string; progress: number; status: 'uploading' | 'queued' | 'done' | 'failed' };

export function useAddPhoto() {
  const coupleId = useSession((s) => s.coupleId);
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const setProgress = useCallback((photoId: string, patch: Partial<UploadState>) => {
    setUploads((prev) => {
      const found = prev.some((u) => u.photoId === photoId);
      return found
        ? prev.map((u) => (u.photoId === photoId ? { ...u, ...patch } : u))
        : [...prev, { photoId, progress: 0, status: 'uploading', ...patch }];
    });
  }, []);

  const pickAndUpload = useCallback(
    async (albumId: string | null, caption: string): Promise<boolean> => {
      if (!coupleId || !userId) return false;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        exif: true,
      });
      if (result.canceled || !result.assets[0]) return false;
      const asset = result.assets[0];

      const photoId = newPhotoId();
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const storagePath = storagePathFor(coupleId, photoId, ext);

      setProgress(photoId, { status: 'uploading', progress: 0 });

      // big files (>6MB) get resumable upload with real progress (research);
      // small ones take the plain ArrayBuffer path
      const big = (asset.fileSize ?? 0) > 6 * 1024 * 1024;
      let uploaded;
      if (big) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token ?? '';
        uploaded = await uploadWithProgress(storagePath, asset.uri, mimeType, token, (f) =>
          setProgress(photoId, { progress: f }),
        );
      } else {
        uploaded = await uploadSmall(storagePath, asset.uri, mimeType);
        setProgress(photoId, { progress: 1 });
      }

      if (!uploaded.ok) {
        // the file itself needs signal — nothing is queued; the UI shows the
        // failure honestly and she can retry from the picker
        setProgress(photoId, { status: 'failed' });
        return false;
      }

      const optimistic: PhotoRow = {
        id: photoId,
        couple_id: coupleId,
        author_id: userId,
        album_id: albumId,
        storage_path: storagePath,
        caption,
        taken_at: exifDateToIso(asset.exif?.DateTimeOriginal),
        op_id: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<PhotoRow[]>([...PHOTOS_KEY, coupleId], (old) => [optimistic, ...(old ?? [])]);

      const { op_id: _drop, created_at: _keep, ...row } = optimistic;
      await enqueue({
        coupleId,
        kind: 'upsert',
        table: 'photos',
        payload: { ...row, created_at: optimistic.created_at },
      });
      setProgress(photoId, { status: 'done', progress: 1 });
      emit({ t: 'photo:new', photoId, albumId });
      return true;
    },
    [coupleId, userId, queryClient, setProgress],
  );

  return { pickAndUpload, uploads };
}

/** Signed URL, cached per path (private bucket → expo-image needs a token). */
export function usePhotoUrl(storagePath: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!storagePath) {
      setUrl(null);
      return;
    }
    void signedPhotoUrl(storagePath).then((res) => {
      if (alive && res.ok) setUrl(res.data);
    });
    return () => {
      alive = false;
    };
  }, [storagePath]);
  return url;
}

/** Batch-signed URL map for a whole grid: one call, one render pass. */
export function usePhotoUrlMap(storagePaths: string[]): Record<string, string> {
  const key = storagePaths.join('|');
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    if (storagePaths.length === 0) {
      setMap({});
      return;
    }
    void signedPhotoUrls(storagePaths).then((res) => {
      if (alive && res.ok) setMap(res.data);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  }, [key]);
  return map;
}

export function useAddAlbum() {
  const coupleId = useSession((s) => s.coupleId);
  const queryClient = useQueryClient();
  return useCallback(
    async (title: string) => {
      if (!coupleId || !title.trim()) return;
      const optimistic: AlbumRow = {
        id: newUuid(), // consistent with every other slice: client-kept ids
        couple_id: coupleId,
        title: title.trim(),
        cover_photo_id: null,
        op_id: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<AlbumRow[]>([...ALBUMS_KEY, coupleId], (old) => [optimistic, ...(old ?? [])]);
      await enqueue({
        coupleId,
        kind: 'upsert',
        table: 'albums',
        payload: { id: optimistic.id, couple_id: coupleId, title: title.trim(), created_at: optimistic.created_at },
      });
      void queryClient.invalidateQueries({ queryKey: [...ALBUMS_KEY, coupleId] });
    },
    [coupleId, queryClient],
  );
}
