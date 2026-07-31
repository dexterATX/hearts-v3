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
