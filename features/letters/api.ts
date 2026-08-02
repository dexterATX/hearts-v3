// features/letters/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { LetterRow, MoodRow } from '../../lib/db/database.types';

/** Every column EXCEPT body. 0008 revoked table-level SELECT and re-granted
 *  these, so `select('*')` would now fail with "permission denied for column
 *  body" — which is the point: a sealed letter's text must not reach the
 *  recipient's device before it unlocks. */
const LIST_COLUMNS =
  'id,couple_id,author_id,label,audio_url,lock_type,unlock_at,unlock_mood,opened_at,op_id,created_at';

/** A letter as it appears in the pile and on the shelf — no body. */
export type LetterListRow = Omit<LetterRow, 'body'>;

export async function fetchLetters(coupleId: string): Promise<Result<LetterListRow[]>> {
  try {
    const res = await supabase
      .from('letters')
      .select(LIST_COLUMNS)
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });
    if (res.error) return err(toAppError(res.error, 'letters would not load'));
    return ok(res.data as LetterListRow[]);
  } catch (e) {
    return err(toAppError(e, 'letters would not load'));
  }
}

/** The body, served only if the server agrees the letter is open (0008).
 *  Raises "still sealed" otherwise — the seal is enforced in Postgres now,
 *  not by whether the UI happens to render it. */
export async function fetchLetterBody(letterId: string): Promise<Result<string>> {
  try {
    const res = await supabase.rpc('letter_body', { p_letter_id: letterId });
    if (res.error) {
      const sealed = res.error.message.includes('still sealed');
      return err({
        code: sealed ? 'validation' : 'rls',
        message: sealed ? 'not yet — this one is still sealed' : 'could not open the letter',
        cause: res.error,
      });
    }
    return ok((res.data as string | null) ?? '');
  } catch (e) {
    return err(toAppError(e, 'could not open the letter'));
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
