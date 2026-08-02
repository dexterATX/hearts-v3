// features/settings/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { NotificationPrefsRow } from '../../lib/db/database.types';

export async function updateProfile(
  userId: string,
  patch: { display_name?: string; nickname?: string },
): Promise<Result<null>> {
  try {
    const res = await supabase.from('profiles').update(patch).eq('id', userId);
    if (res.error) return err(toAppError(res.error, 'could not save your name'));
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'could not save your name'));
  }
}

export async function updateAnniversary(coupleId: string, date: string): Promise<Result<null>> {
  try {
    const res = await supabase.from('couples').update({ anniversary_date: date }).eq('id', coupleId);
    if (res.error) return err(toAppError(res.error, 'could not save the day'));
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'could not save the day'));
  }
}

export async function fetchPrefs(userId: string): Promise<Result<NotificationPrefsRow | null>> {
  try {
    const res = await supabase.from('notification_prefs').select('*').eq('profile_id', userId).maybeSingle();
    if (res.error) return err(toAppError(res.error, 'prefs would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'prefs would not load'));
  }
}

export async function savePrefs(userId: string, prefs: Record<string, boolean>): Promise<Result<null>> {
  try {
    const res = await supabase
      .from('notification_prefs')
      .upsert({ profile_id: userId, prefs }, { onConflict: 'profile_id' });
    if (res.error) return err(toAppError(res.error, 'could not save toggles'));
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'could not save toggles'));
  }
}

/** Sign out of this phone. Lives here (not imported from the auth slice) so
 *  settings never reaches across into a sibling feature (§2.1). */
export async function signOut(): Promise<Result<null>> {
  try {
    await supabase.auth.signOut();
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'sign out failed'));
  }
}

/** Full data export (§7.17): everything the couple owns, one JSON object. */
export async function exportAllData(coupleId: string): Promise<Result<Record<string, unknown>>> {
  try {
    const tables = [
      'couples',
      'profiles',
      'moods',
      'letters',
      'albums',
      'photos',
      'voice_notes',
      'canvas_strokes',
      'game_sessions',
      'game_moves',
      'quiz_questions',
      'quiz_answers',
      'bucket_list',
      'events',
      'journal_entries',
    ] as const;
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const table of tables) {
      // game_moves and quiz_answers have no couple_id column — filter by their
      // parent rows instead of erroring the whole export (swarm finding)
      const query =
        table === 'couples'
          ? supabase.from(table).select('*').eq('id', coupleId)
          : table === 'letters'
            // 0008 revoked SELECT on letters.body, so select('*') fails here.
            // The export carries the pile's metadata; a sealed letter's text
            // is not the exporter's to take out of the app.
            ? supabase
                .from(table)
                .select('id,couple_id,author_id,label,audio_url,lock_type,unlock_at,unlock_mood,opened_at,op_id,created_at')
                .eq('couple_id', coupleId)
          : table === 'game_moves'
            ? supabase.from(table).select('*').in(
                'session_id',
                (await supabase.from('game_sessions').select('id').eq('couple_id', coupleId)).data?.map((s) => s.id) ?? ['00000000-0000-0000-0000-000000000000'],
              )
            : table === 'quiz_answers'
              ? supabase.from(table).select('*').in(
                  'question_id',
                  (await supabase.from('quiz_questions').select('id').eq('couple_id', coupleId)).data?.map((q) => q.id) ?? ['00000000-0000-0000-0000-000000000000'],
                )
              : supabase.from(table).select('*').eq('couple_id', coupleId);
      const res = await query;
      if (res.error) return err(toAppError(res.error, `export failed at ${table}`));
      out[table] = res.data;
    }
    return ok(out);
  } catch (e) {
    return err(toAppError(e, 'the export failed'));
  }
}
