-- hearts v3 · 0003_profile_couple_guard.sql
-- Round-7 (security) finding: "profile update own" lets ANY authenticated
-- user set their own couple_id directly — knowing a couple's uuid would be
-- enough to join it, no invite code needed. Pairing must flow through the
-- create_couple/join_couple RPCs only.
--
-- The RPCs are SECURITY DEFINER, so inside them current_user is the function
-- owner — NOT 'authenticated'. Direct client writes run as 'authenticated'.
-- The trigger function must NOT be security definer itself (swarm finding:
-- as definer, current_user was ALWAYS the owner and the guard was dead
-- code). It reads only NEW/OLD, so it needs no extra privileges.

create or replace function private.guard_couple_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.couple_id is distinct from old.couple_id
     and current_user = 'authenticated' then
    raise exception 'pairing goes through the invite code only';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_couple_guard on public.profiles;
create trigger profiles_couple_guard
  before update on public.profiles
  for each row execute function private.guard_couple_assignment();
