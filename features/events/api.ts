// features/events/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { EventRow } from '../../lib/db/database.types';

export async function fetchEvents(coupleId: string): Promise<Result<EventRow[]>> {
  try {
    const res = await supabase
      .from('events')
      .select('*')
      .eq('couple_id', coupleId)
      .order('date', { ascending: true });
    if (res.error) return err(toAppError(res.error, 'the calendar would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'the calendar would not load'));
  }
}
