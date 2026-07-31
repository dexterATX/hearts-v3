// features/letters/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { LetterRow, MoodRow } from '../../lib/db/database.types';

export async function fetchLetters(coupleId: string): Promise<Result<LetterRow[]>> {
  try {
    const res = await supabase
      .from('letters')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });
    if (res.error) return err(toAppError(res.error, 'letters would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'letters would not load'));
  }
}

/** Mood history, queried through THIS slice (§2.1 — no cross-feature imports).
 *  CRITICAL: same query key as the mood feature (['moods', coupleId]) means a
 *  SHARED cache entry — so the row shape MUST match fetchMoods exactly, or
 *  whichever feature fetches last corrupts the other's reads (context review
 *  finding). Keep the columns identical: full rows, not a subset. */
export async function fetchMoodHistory(coupleId: string): Promise<Result<MoodRow[]>> {
  try {
    const res = await supabase
      .from('moods')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (res.error) return err(toAppError(res.error, 'moods would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'moods would not load'));
  }
}

/** Signed read URL for an audio letter (bucket is private, path-scoped to couple). */
export async function audioUrl(storagePath: string): Promise<Result<string>> {
  try {
    const res = await supabase.storage.from('letter-audio').createSignedUrl(storagePath, 60 * 30);
    if (res.error) return err(toAppError(res.error, 'could not load the recording'));
    return ok(res.data.signedUrl);
  } catch (e) {
    return err(toAppError(e, 'could not load the recording'));
  }
}
