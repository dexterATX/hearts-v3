// features/ai/api.ts — streaming Edge Function → RN (research pattern):
// supabase.functions.invoke can't stream bodies on RN's fetch; expo/fetch is
// the WinterCG-compliant native fetch with a real ReadableStream body.
import { fetch } from 'expo/fetch';
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import { parseSseDelta, type CompanionMode } from './model';

/** §7.16 monthly recap: build the honest context from this month's shared
 *  activity — counts only, never letter/journal bodies (those are ours). */
export async function buildRecapContext(coupleId: string): Promise<Result<string>> {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const since = monthStart.toISOString();

    const count = async (table: string, extra?: (q: unknown) => unknown): Promise<number> => {
      let q = supabase
        .from(table as never)
        .select('id', { count: 'exact', head: true })
        .eq('couple_id', coupleId)
        .gte('created_at', since);
      if (extra) q = extra(q) as typeof q;
      const res = await q;
      return res.count ?? 0;
    };

    const [moods, letters, openedLetters, voice, photos, games, journal, bucketDone] =
      await Promise.all([
        count('moods'),
        count('letters'),
        count('letters', (q) => (q as { not: (c: string, o: string, v: null) => unknown }).not('opened_at', 'is', null)),
        count('voice_notes'),
        count('photos'),
        count('game_sessions'),
        count('journal_entries'),
        count('bucket_list', (q) => (q as { not: (c: string, o: string, v: null) => unknown }).not('done_at', 'is', null)),
      ]);

    const month = monthStart.toLocaleDateString(undefined, { month: 'long' });
    const parts = [
      `In ${month} so far: ${moods} mood pings, ${letters} letters sealed` +
        (openedLetters > 0 ? ` (${openedLetters} opened)` : '') +
        `, ${voice} voice notes, ${photos} photos, ${games} games played, ${journal} journal entries` +
        (bucketDone > 0 ? `, ${bucketDone} bucket-list dreams completed` : '') +
        '.',
    ];
    return ok(parts.join(''));
  } catch (e) {
    return err(toAppError(e, 'could not gather the month'));
  }
}

export async function streamCompanion(
  mode: CompanionMode,
  context: string,
  names: { me: string; partner: string },
  onDelta: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<Result<string>> {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return err({ code: 'auth', message: 'sign in first' });

    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-companion`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mode, context, names }),
      signal,
    });

    if (!resp.ok || !resp.body) {
      return err({ code: 'network', message: 'the companion is not answering right now' });
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const delta = parseSseDelta(line.trim());
        if (delta) {
          full += delta;
          onDelta(full);
        }
      }
    }
    return ok(full);
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') {
      return err({ code: 'unknown', message: 'stopped mid-thought', cause: e });
    }
    return err(toAppError(e, 'the companion drifted off — try again'));
  }
}
