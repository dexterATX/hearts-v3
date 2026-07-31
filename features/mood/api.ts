// features/mood/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { MoodRow } from '../../lib/db/database.types';

export async function fetchMoods(coupleId: string, limit = 200): Promise<Result<MoodRow[]>> {
  try {
    const res = await supabase
      .from('moods')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (res.error) return err(toAppError(res.error, 'moods would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'moods would not load'));
  }
}
