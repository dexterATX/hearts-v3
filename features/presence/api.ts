// features/presence/api.ts — presence itself rides the realtime channel;
// the only DB touch is the last_seen fallback for when she's offline.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';

export async function fetchPartnerLastSeen(
  coupleId: string,
  myId: string,
): Promise<Result<string | null>> {
  try {
    const res = await supabase
      .from('profiles')
      .select('last_seen_at')
      .eq('couple_id', coupleId)
      .neq('id', myId)
      .maybeSingle();
    if (res.error) return err(toAppError(res.error, 'could not check when she was last here'));
    return ok(res.data?.last_seen_at ?? null);
  } catch (e) {
    return err(toAppError(e, 'could not check when she was last here'));
  }
}
