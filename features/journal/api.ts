// features/journal/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { JournalEntryRow } from '../../lib/db/database.types';

export async function fetchEntries(coupleId: string): Promise<Result<JournalEntryRow[]>> {
  try {
    const res = await supabase
      .from('journal_entries')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (res.error) return err(toAppError(res.error, 'the journal would not open'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'the journal would not open'));
  }
}
