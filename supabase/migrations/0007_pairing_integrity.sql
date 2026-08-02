-- hearts v3 · 0007_pairing_integrity.sql
-- LIVE-INCIDENT FIX. create_couple inserted the couples row, then ran
--   update public.profiles set couple_id = ... where id = auth.uid()
-- and RETURNED SUCCESS even when that UPDATE matched ZERO rows (a plpgsql
-- UPDATE hitting nothing is not an error). The client persisted a couple id
-- the server never recorded, so private.my_couple_id() stayed NULL and every
-- couple-scoped INSERT failed with 42501 — "new row violates row-level
-- security policy" — while the UI believed it was paired. Three orphaned
-- couples accumulated in public.couples before this was caught.
--
-- Both RPCs now: (1) require a signed-in caller, (2) refuse to re-pair someone
-- who already belongs to a couple (which is what orphaned the old rows), and
-- (3) assert the profile UPDATE actually touched a row — raising instead of
-- returning, so the couples INSERT rolls back in the same transaction and no
-- orphan can be created.

create or replace function public.create_couple(p_invite_code text, p_display_name text default '')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_couple_id uuid;
  v_uid uuid := (select auth.uid());
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_invite_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'invite code must be 6 chars, A-Z 2-9';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'no profile row for this account — cannot pair';
  end if;
  if (select couple_id from public.profiles where id = v_uid) is not null then
    raise exception 'already paired';
  end if;

  insert into public.couples (invite_code) values (p_invite_code) returning id into v_couple_id;

  update public.profiles
     set couple_id = v_couple_id,
         display_name = case when p_display_name <> '' then p_display_name else display_name end
   where id = v_uid;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    -- rolls back the couples insert too: never leave an orphaned couple
    raise exception 'pairing did not take (% profile rows updated)', v_rows;
  end if;

  return v_couple_id;
end;
$$;

create or replace function public.join_couple(p_invite_code text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_couple_id uuid;
  v_members int;
  v_uid uuid := (select auth.uid());
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'no profile row for this account — cannot pair';
  end if;
  if (select couple_id from public.profiles where id = v_uid) is not null then
    raise exception 'already paired';
  end if;

  select id into v_couple_id from public.couples where invite_code = upper(p_invite_code);
  if v_couple_id is null then
    raise exception 'no couple for that code';
  end if;

  -- a couple is exactly two people; anything else breaks loadProfiles'
  -- maybeSingle() partner lookup, which errors on more than one row
  select count(*) into v_members from public.profiles
   where couple_id = v_couple_id and id <> v_uid;
  if v_members >= 2 then
    raise exception 'that couple is already full';
  end if;

  update public.profiles set couple_id = v_couple_id where id = v_uid;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'pairing did not take (% profile rows updated)', v_rows;
  end if;

  return v_couple_id;
end;
$$;

revoke all on function public.create_couple(text, text) from public, anon;
revoke all on function public.join_couple(text) from public, anon;
grant execute on function public.create_couple(text, text) to authenticated;
grant execute on function public.join_couple(text) to authenticated;
