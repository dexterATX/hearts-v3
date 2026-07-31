// features/bucket/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { BucketItemRow } from '../../lib/db/database.types';

export async function fetchBucketList(coupleId: string): Promise<Result<BucketItemRow[]>> {
  try {
    const res = await supabase
      .from('bucket_list')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });
    if (res.error) return err(toAppError(res.error, 'the list would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'the list would not load'));
  }
}

/** Server-side vote merge (0004_bucket_vote.sql): jsonb || patch, never a
 *  whole-object replace — both partners' votes can coexist. */
export async function bucketVote(itemId: string, on: boolean): Promise<Result<null>> {
  try {
    const res = await supabase.rpc('bucket_vote', { p_item_id: itemId, p_on: on });
    if (res.error) return err(toAppError(res.error, 'the vote did not land'));
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'the vote did not land'));
  }
}
