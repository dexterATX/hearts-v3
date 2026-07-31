// features/photos/api.ts — the only file in this slice touching lib/db.
// Research: storage-js has NO upload progress callback → progress comes from
// tus-js-client resumable uploads (6MB chunks exactly) for large files, and
// the plain ArrayBuffer upload for small ones.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { AlbumRow, PhotoRow } from '../../lib/db/database.types';

export async function fetchAlbums(coupleId: string): Promise<Result<AlbumRow[]>> {
  try {
    const res = await supabase
      .from('albums')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });
    if (res.error) return err(toAppError(res.error, 'albums would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'albums would not load'));
  }
}

export async function fetchPhotos(coupleId: string): Promise<Result<PhotoRow[]>> {
  try {
    const res = await supabase
      .from('photos')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (res.error) return err(toAppError(res.error, 'photos would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'photos would not load'));
  }
}

/** Small-file path: official expo-image-picker pattern (research-verified). */
export async function uploadSmall(
  storagePath: string,
  fileUri: string,
  mimeType: string,
): Promise<Result<null>> {
  try {
    const arraybuffer = await fetch(fileUri).then((r) => r.arrayBuffer());
    const res = await supabase.storage.from('photos').upload(storagePath, arraybuffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (res.error) return err(toAppError(res.error, 'the photo did not upload'));
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'the photo did not upload'));
  }
}

/** Large-file path WITH progress: tus resumable upload (6MB chunks exactly). */
export async function uploadWithProgress(
  storagePath: string,
  fileUri: string,
  mimeType: string,
  accessToken: string,
  onProgress: (fraction: number) => void,
): Promise<Result<null>> {
  try {
    const tus = await import('tus-js-client');
    const blob = await fetch(fileUri).then((r) => r.blob());
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(blob, {
        endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000],
        headers: {
          authorization: `Bearer ${accessToken}`,
          'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024, // must be exactly 6MB (research)
        metadata: {
          bucketName: 'photos',
          objectName: storagePath,
          contentType: mimeType,
          cacheControl: '3600',
        },
        onProgress: (bytesUploaded, bytesTotal) => onProgress(bytesUploaded / bytesTotal),
        onSuccess: () => resolve(),
        onError: (e) => reject(e),
      });
      upload.start();
    });
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'the photo did not upload'));
  }
}

export async function signedPhotoUrl(storagePath: string): Promise<Result<string>> {
  try {
    const res = await supabase.storage.from('photos').createSignedUrl(storagePath, 60 * 60);
    if (res.error) return err(toAppError(res.error, 'could not load the photo'));
    return ok(res.data.signedUrl);
  } catch (e) {
    return err(toAppError(e, 'could not load the photo'));
  }
}

/** Batch sign (round-8 perf finding): one call for a whole grid instead of
 *  one per thumbnail — 100 photos used to mean 100 round trips. */
export async function signedPhotoUrls(
  storagePaths: string[],
): Promise<Result<Record<string, string>>> {
  try {
    if (storagePaths.length === 0) return ok({});
    const res = await supabase.storage.from('photos').createSignedUrls(storagePaths, 60 * 60);
    if (res.error) return err(toAppError(res.error, 'could not load the photos'));
    const map: Record<string, string> = {};
    for (const row of res.data) {
      if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
    }
    return ok(map);
  } catch (e) {
    return err(toAppError(e, 'could not load the photos'));
  }
}
