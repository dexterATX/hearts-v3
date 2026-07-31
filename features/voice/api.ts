// features/voice/api.ts — the only file in this slice touching lib/db.
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { VoiceNoteRow } from '../../lib/db/database.types';

export async function fetchVoiceNotes(coupleId: string): Promise<Result<VoiceNoteRow[]>> {
  try {
    const res = await supabase
      .from('voice_notes')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (res.error) return err(toAppError(res.error, 'voice notes would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'voice notes would not load'));
  }
}

export async function uploadAudio(
  storagePath: string,
  fileUri: string,
): Promise<Result<null>> {
  try {
    const arraybuffer = await fetch(fileUri).then((r) => r.arrayBuffer());
    const res = await supabase.storage.from('voice').upload(storagePath, arraybuffer, {
      contentType: 'audio/m4a',
      upsert: true,
    });
    if (res.error) return err(toAppError(res.error, 'the voice note did not upload'));
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'the voice note did not upload'));
  }
}

export async function signedAudioUrl(storagePath: string): Promise<Result<string>> {
  try {
    const res = await supabase.storage.from('voice').createSignedUrl(storagePath, 60 * 30);
    if (res.error) return err(toAppError(res.error, 'could not load the recording'));
    return ok(res.data.signedUrl);
  } catch (e) {
    return err(toAppError(e, 'could not load the recording'));
  }
}
