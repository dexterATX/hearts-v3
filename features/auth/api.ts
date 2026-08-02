// features/auth/api.ts — the only file in this slice touching lib/db (§2.2).
import { supabase } from '../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../lib/result';
import type { ProfileRow } from '../../lib/db/database.types';
import { generateInviteCode, normalizeInviteCode } from './model';

/** Turn a signUp failure into something true and in-voice. Every failure used
 *  to collapse into "that email or password did not work", so a rate-limit, a
 *  disabled provider and an actual typo were indistinguishable — which sent a
 *  real debugging session chasing the wrong thing. */
function signUpMessage(e: { message?: string; status?: number }): string {
  const m = (e.message ?? '').toLowerCase();
  if (e.status === 429 || m.includes('rate limit') || m.includes('too many')) {
    return 'too many tries just now — wait a minute, then try again';
  }
  if (m.includes('password')) return 'that password is too short — six characters at least';
  if (m.includes('not allowed') || m.includes('disabled')) {
    return 'new accounts are turned off for this app';
  }
  if (m.includes('invalid') && m.includes('email')) return 'that email does not look right';
  return 'could not sign you in, and could not make an account either';
}

export async function signIn(email: string, password: string): Promise<Result<string>> {
  try {
    const res = await supabase.auth.signInWithPassword({ email, password });
    if (!res.error) {
      // a sign-in without a session is not a sign-in
      if (!res.data.session || !res.data.user) {
        return err({ code: 'auth', message: 'sign in did not complete' });
      }
      return ok(res.data.user.id);
    }

    // Supabase deliberately returns the same invalid_credentials for "wrong
    // password" and "no such account", so first-run account creation still has
    // to be attempted — but its outcome must never be reported as a sign-in.
    const up = await supabase.auth.signUp({ email, password });
    if (up.error) {
      return err({ code: 'auth', message: signUpMessage(up.error), cause: up.error });
    }
    // No session here means one of two things, and NEITHER is success: the
    // address needs confirming, or it already exists and Supabase obfuscated
    // the response to prevent enumeration. Returning ok() in that case made the
    // UI report a successful sign-in while the user was never signed in.
    if (!up.data.session || !up.data.user) {
      return err({
        code: 'auth',
        message: 'that address already has an account, or it needs confirming — check your email',
        cause: up.error,
      });
    }
    return ok(up.data.user.id);
  } catch (e) {
    return err(toAppError(e, 'could not reach the server — try again on wifi'));
  }
}

export async function signOut(): Promise<Result<null>> {
  try {
    await supabase.auth.signOut();
    return ok(null);
  } catch (e) {
    return err(toAppError(e, 'sign out failed'));
  }
}

/** I start us: create the couple row + show her the code. */
export async function createCouple(displayName: string): Promise<Result<{ coupleId: string; code: string }>> {
  const code = generateInviteCode();
  try {
    const res = await supabase.rpc('create_couple', {
      p_invite_code: code,
      p_display_name: displayName,
    });
    if (res.error) return err(toAppError(res.error, 'could not create us — try again'));
    return ok({ coupleId: res.data, code });
  } catch (e) {
    return err(toAppError(e, 'could not create us — try again'));
  }
}

/** She joins (or I join her): enter the 6-char code. */
export async function joinCouple(code: string): Promise<Result<string>> {
  try {
    const res = await supabase.rpc('join_couple', {
      p_invite_code: normalizeInviteCode(code),
    });
    if (res.error) {
      const msg = res.error.message.includes('full')
        ? 'that couple already has two people in it'
        : 'no us found for that code — check each letter';
      return err({ code: 'validation', message: msg, cause: res.error });
    }
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'could not join — try again'));
  }
}

/** Load me + my partner for the session store. */
export async function loadProfiles(
  userId: string,
  coupleId: string | null,
): Promise<Result<{ me: ProfileRow; partner: ProfileRow | null }>> {
  try {
    const meRes = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (meRes.error) return err(toAppError(meRes.error, 'could not load your profile'));
    let partner: ProfileRow | null = null;
    if (coupleId) {
      const pRes = await supabase
        .from('profiles')
        .select('*')
        .eq('couple_id', coupleId)
        .neq('id', userId)
        .maybeSingle();
      if (pRes.error) return err(toAppError(pRes.error, 'could not load their profile'));
      partner = pRes.data;
    }
    return ok({ me: meRes.data, partner });
  } catch (e) {
    return err(toAppError(e, 'could not load profiles'));
  }
}

export async function touchLastSeen(userId: string): Promise<void> {
  await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
}
