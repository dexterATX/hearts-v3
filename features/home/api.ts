// features/home/api.ts — the only file in this slice touching lib/db.
// Home reads several tables directly rather than importing sibling slices (§2.1).
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { CoupleRow, LetterRow, PhotoRow, VoiceNoteRow, MoodRow } from '../../lib/db/database.types';

export async function fetchCouple(coupleId: string): Promise<Result<CoupleRow>> {
  try {
    const res = await supabase.from('couples').select('*').eq('id', coupleId).single();
    if (res.error) return err(toAppError(res.error, 'could not load us'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'could not load us'));
  }
}

export type FeedRows = {
  moods: MoodRow[];
  letters: Omit<LetterRow, 'body'>[]; // the feed shows labels, never text
  voice: VoiceNoteRow[];
  photos: PhotoRow[];
};

export async function fetchFeedRows(coupleId: string): Promise<Result<FeedRows>> {
  try {
    const [moods, letters, voice, photos] = await Promise.all([
      supabase.from('moods').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(20),
      // no `body`: 0008 keeps a sealed letter's text on the server, and
      // select('*') would now fail with "permission denied for column body"
      supabase
        .from('letters')
        .select('id,couple_id,author_id,label,audio_url,lock_type,unlock_at,unlock_mood,opened_at,op_id,created_at')
        .eq('couple_id', coupleId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('voice_notes').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(20),
      supabase.from('photos').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(20),
    ]);
    const firstErr = moods.error ?? letters.error ?? voice.error ?? photos.error;
    if (firstErr) return err(toAppError(firstErr, 'the feed would not load'));
    return ok({
      moods: moods.data ?? [],
      letters: letters.data ?? [],
      voice: voice.data ?? [],
      photos: photos.data ?? [],
    });
  } catch (e) {
    return err(toAppError(e, 'the feed would not load'));
  }
}

/** Batch-sign feed photo thumbnails (the round-8 lesson: N photos never means
 *  N round trips). Storage access lives here because api.ts is the slice's
 *  only db-touching file. One hour, same as the photos slice. */
export async function signedPhotoThumbs(
  paths: string[],
): Promise<Result<Record<string, string>>> {
  try {
    if (paths.length === 0) return ok({});
    const res = await supabase.storage.from('photos').createSignedUrls(paths, 3600);
    if (res.error) return err(toAppError(res.error, 'the photos would not load'));
    const map: Record<string, string> = {};
    for (const row of res.data ?? []) {
      if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
    }
    return ok(map);
  } catch (e) {
    return err(toAppError(e, 'the photos would not load'));
  }
}
