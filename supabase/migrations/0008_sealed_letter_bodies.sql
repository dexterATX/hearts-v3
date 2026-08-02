-- hearts v3 · 0008_sealed_letter_bodies.sql
-- The app's headline promise — a sealed letter opens only at the right moment —
-- was enforced ONLY by client-side rendering. `letters couple read` (0001) has
-- no unlock predicate and the client did select('*'), so the full plaintext
-- `body` of every still-sealed letter sat on the recipient's phone from the
-- instant it was written. Anyone with a debugger, or any other client holding
-- that session, could read it. The seal was cosmetic.
--
-- RLS is row-level and cannot hide a single column, and hiding the ROW is wrong
-- (the sealed pile is meant to be visible — §7.5, "a promise, not a number").
-- So: take table-level SELECT away from `authenticated` and grant back every
-- column EXCEPT body, then serve the body through a SECURITY DEFINER function
-- that enforces the unlock rules server-side.
--
-- NOTE: in Postgres a table-level SELECT grant covers every column, so
-- `revoke select (body)` alone is a no-op. The revoke-then-regrant below is
-- what actually removes access.

revoke select on public.letters from authenticated;

grant select (
  id, couple_id, author_id, label, audio_url,
  lock_type, unlock_at, unlock_mood, opened_at, op_id, created_at
) on public.letters to authenticated;

-- INSERT/UPDATE are untouched: writing a letter and stamping opened_at still
-- work, and the outbox upsert does not read the row back.

create or replace function public.letter_body(p_letter_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.letters%rowtype;
  v_uid uuid := (select auth.uid());
  v_couple uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select couple_id into v_couple from public.profiles where id = v_uid;

  select * into l from public.letters where id = p_letter_id;
  if not found then
    raise exception 'no such letter';
  end if;
  if v_couple is null or l.couple_id is distinct from v_couple then
    raise exception 'not your letter';
  end if;

  -- the author can always reread what they wrote
  if l.author_id = v_uid then
    return l.body;
  end if;

  -- once broken, a seal stays broken
  if l.opened_at is not null then
    return l.body;
  end if;

  if l.lock_type = 'anytime' then
    return l.body;
  end if;

  if l.lock_type = 'date'
     and l.unlock_at is not null
     and l.unlock_at <= now() then
    return l.body;
  end if;

  if l.lock_type = 'mood'
     and l.unlock_mood is not null
     and exists (
       select 1 from public.moods m
        where m.couple_id = l.couple_id
          and m.mood = l.unlock_mood
     ) then
    return l.body;
  end if;

  raise exception 'still sealed';
end;
$$;

revoke all on function public.letter_body(uuid) from public, anon;
grant execute on function public.letter_body(uuid) to authenticated;
