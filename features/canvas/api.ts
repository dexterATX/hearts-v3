// features/canvas/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { CanvasStrokeRow } from '../../lib/db/database.types';

export async function fetchStrokes(coupleId: string): Promise<Result<CanvasStrokeRow[]>> {
  try {
    const res = await supabase
      .from('canvas_strokes')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: true })
      .limit(2000);
    if (res.error) return err(toAppError(res.error, 'the canvas would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'the canvas would not load'));
  }
}

/** Clearing is couple-wide and live, so it goes direct (not via the outbox):
 *  a queued clear could wipe strokes drawn after it was queued. */
export async function clearCanvas(coupleId: string): Promise<Result<null>> {
  try {
    const res = await supabase.from('canvas_strokes').delete().eq('couple_id', coupleId);
    if (res.error) return err(toAppError(res.error, 'could not clear the canvas'));
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'could not clear the canvas'));
  }
}
