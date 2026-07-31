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
  letters: LetterRow[];
  voice: VoiceNoteRow[];
  photos: PhotoRow[];
};

export async function fetchFeedRows(coupleId: string): Promise<Result<FeedRows>> {
  try {
    const [moods, letters, voice, photos] = await Promise.all([
      supabase.from('moods').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(20),
      supabase.from('letters').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(20),
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
