-- hearts v3 · 0001_init.sql
-- Tables, RLS (couple-scoped), indexes, triggers, realtime publication.
-- Research basis: docs/research in hearts repo — (select auth.uid()) initPlan
-- wrapping, security-definer membership helper (recursion-safe), indexed
-- policy columns, `to authenticated` on every policy.

-- ──────────────────────────────────────────────────────────────────────
-- 0. extensions + private schema
-- ──────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid
create extension if not exists pg_net;     -- edge-function fan-out from triggers
create schema if not exists private;

-- ──────────────────────────────────────────────────────────────────────
-- 1. tables (data contract §3; op_id added to content tables for replay-safe
--    upserts — the idempotency key the outbox flusher upserts on)
-- ──────────────────────────────────────────────────────────────────────
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  anniversary_date date,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  couple_id uuid references public.couples on delete set null,
  display_name text not null default '',
  nickname text not null default '',
  avatar_url text,
  push_token text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Recursion-safe membership helper: runs as table owner, bypasses RLS on
-- profiles, so policies on profiles never query profiles directly.
-- MUST be created after profiles exists — SQL-language functions validate
-- their body's relations at CREATE time (db push finding).
create or replace function private.my_couple_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select couple_id from public.profiles where id = (select auth.uid())
$$;
revoke all on function private.my_couple_id() from public, anon;
grant execute on function private.my_couple_id() to authenticated;

create table public.moods (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  mood text not null,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  label text not null,
  body text not null default '',
  audio_url text,
  lock_type text not null default 'anytime' check (lock_type in ('anytime','date','mood')),
  unlock_at timestamptz,
  unlock_mood text,
  opened_at timestamptz,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  title text not null,
  cover_photo_id uuid,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  album_id uuid references public.albums on delete set null,
  storage_path text not null,
  caption text not null default '',
  taken_at timestamptz,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  storage_path text not null,
  duration_ms integer not null default 0,
  heard_at timestamptz,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.canvas_strokes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  seq integer not null,
  points jsonb not null,
  color text not null,
  width real not null,
  op_id uuid unique,
  created_at timestamptz not null default now()
);
-- seq is per-author (two phones draw concurrently); replay orders by created_at
create unique index canvas_strokes_author_seq on public.canvas_strokes (couple_id, author_id, seq);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  kind text not null check (kind in ('hangman','battleship','quiz','cards')),
  status text not null default 'active' check (status in ('active','finished','abandoned')),
  turn_user_id uuid references public.profiles,
  state jsonb not null default '{}',
  score_a integer not null default 0,
  score_b integer not null default 0,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.game_moves (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  seq integer not null,
  payload jsonb not null,
  op_id uuid unique,
  created_at timestamptz not null default now()
);
-- the load-bearing optimistic-concurrency constraint for the turn engine
-- (unique, so it doubles as the (session_id, seq) lookup index)
create unique index game_moves_session_seq on public.game_moves (session_id, seq);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  prompt text not null,
  options jsonb not null,
  answer_index integer not null,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  choice_index integer not null,
  op_id uuid unique,
  created_at timestamptz not null default now(),
  unique (question_id, author_id)
);

create table public.bucket_list (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  title text not null,
  category text not null default 'us',
  done_at timestamptz,
  done_photo_id uuid,
  votes jsonb not null default '{}',
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  title text not null,
  date date not null,
  recurring boolean not null default false,
  remind_days_before integer not null default 1,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  body text not null default '',
  mood text,
  visibility text not null default 'shared' check (visibility in ('shared','private')),
  photo_id uuid,
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create table public.notification_prefs (
  profile_id uuid primary key references public.profiles on delete cascade,
  prefs jsonb not null default '{}'
);

-- (the server-side op log table was retired in 0005 — idempotency lives on
--  the content tables' unique op_id columns, no central log needed)

-- ──────────────────────────────────────────────────────────────────────
-- 2. indexes — every couple_id + (couple_id, created_at desc) per contract
-- ──────────────────────────────────────────────────────────────────────
create index profiles_couple on public.profiles (couple_id);
create index moods_couple on public.moods (couple_id, created_at desc);
create index letters_couple on public.letters (couple_id, created_at desc);
create index albums_couple on public.albums (couple_id, created_at desc);
create index photos_couple on public.photos (couple_id, created_at desc);
create index photos_album on public.photos (album_id);
create index voice_notes_couple on public.voice_notes (couple_id, created_at desc);
create index canvas_strokes_couple on public.canvas_strokes (couple_id, created_at desc);
create index game_sessions_couple on public.game_sessions (couple_id, created_at desc);
-- (no game_moves (session_id, seq) index here — the unique constraint above covers it)
create index quiz_questions_couple on public.quiz_questions (couple_id, created_at desc);
create index bucket_list_couple on public.bucket_list (couple_id, created_at desc);
create index events_couple on public.events (couple_id, date);
create index journal_entries_couple on public.journal_entries (couple_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────────
-- 3. new-user bootstrap
-- ──────────────────────────────────────────────────────────────────────
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.notification_prefs (profile_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────
-- 4. pairing RPCs (feature 1: 6-char invite code, both join orders, re-pair)
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.create_couple(p_invite_code text, p_display_name text default '')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_couple_id uuid;
begin
  if p_invite_code !~ '^[A-Z2-9]{6}$' then
    raise exception 'invite code must be 6 chars, A-Z 2-9';
  end if;
  insert into public.couples (invite_code) values (p_invite_code) returning id into v_couple_id;
  update public.profiles
     set couple_id = v_couple_id,
         display_name = case when p_display_name <> '' then p_display_name else display_name end
   where id = (select auth.uid());
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
begin
  select id into v_couple_id from public.couples where invite_code = upper(p_invite_code);
  if v_couple_id is null then
    raise exception 'no couple for that code';
  end if;
  select count(*) into v_members from public.profiles
   where couple_id = v_couple_id and id <> (select auth.uid());
  if v_members >= 2 then
    raise exception 'that couple is already full';
  end if;
  update public.profiles set couple_id = v_couple_id where id = (select auth.uid());
  return v_couple_id;
end;
$$;

revoke all on function public.create_couple(text, text) from public, anon;
revoke all on function public.join_couple(text) from public, anon;
grant execute on function public.create_couple(text, text) to authenticated;
grant execute on function public.join_couple(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 5. notify fan-out plumbing (§2.7): trigger → notify edge function.
--    Guarded by app.notify_url so migrations apply cleanly everywhere:
--      alter database postgres set app.notify_url = 'https://<ref>.supabase.co/functions/v1/notify';
--      alter database postgres set app.notify_secret = '<shared secret>';
-- ──────────────────────────────────────────────────────────────────────
create or replace function private.fanout_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text := current_setting('app.notify_url', true);
  v_couple uuid;
begin
  if v_url is null or v_url = '' then
    return new;  -- not configured (local dev): skip silently
  end if;
  -- game_moves has no couple_id column: resolve it through the session,
  -- otherwise the edge function would match NULL couples (swarm finding)
  v_couple := to_jsonb(new) ->> 'couple_id';
  if v_couple is null and TG_TABLE_NAME = 'game_moves' then
    select couple_id into v_couple from public.game_sessions where id = new.session_id;
  end if;
  if v_couple is null then
    return new;  -- never fan out without a couple to target
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'couple_id', v_couple,
      'author_id', to_jsonb(new) -> 'author_id',
      'row', to_jsonb(new)
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-hearts-secret', coalesce(current_setting('app.notify_secret', true), '')
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_on_mood on public.moods;
create trigger notify_on_mood after insert on public.moods
  for each row execute function private.fanout_notify();
drop trigger if exists notify_on_letter on public.letters;
create trigger notify_on_letter after insert on public.letters
  for each row execute function private.fanout_notify();
drop trigger if exists notify_on_voice on public.voice_notes;
create trigger notify_on_voice after insert on public.voice_notes
  for each row execute function private.fanout_notify();
drop trigger if exists notify_on_photo on public.photos;
create trigger notify_on_photo after insert on public.photos
  for each row execute function private.fanout_notify();
drop trigger if exists notify_on_game_move on public.game_moves;
create trigger notify_on_game_move after insert on public.game_moves
  for each row execute function private.fanout_notify();

-- ──────────────────────────────────────────────────────────────────────
-- 6. RLS — scoped to the COUPLE, never the user (contract §3)
-- ──────────────────────────────────────────────────────────────────────
alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.moods enable row level security;
alter table public.letters enable row level security;
alter table public.albums enable row level security;
alter table public.photos enable row level security;
alter table public.voice_notes enable row level security;
alter table public.canvas_strokes enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_moves enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.bucket_list enable row level security;
alter table public.events enable row level security;
alter table public.journal_entries enable row level security;
alter table public.notification_prefs enable row level security;

-- couples: members read; anniversary etc. updatable by members; inserts via RPC only
create policy "couple read" on public.couples for select to authenticated
  using (id = (select private.my_couple_id()));
create policy "couple update" on public.couples for update to authenticated
  using (id = (select private.my_couple_id()))
  with check (id = (select private.my_couple_id()));

-- profiles: own row always (needed pre-pairing), partner's row via couple
create policy "profile read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or couple_id = (select private.my_couple_id()));
create policy "profile update own" on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- content tables: one shape everywhere — couple reads all, authors write own
-- (macro-expanded by hand; every policy `to authenticated` so anon skips eval)
create policy "moods couple read" on public.moods for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "moods author write" on public.moods for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "moods author delete" on public.moods for delete to authenticated
  using (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));

create policy "letters couple read" on public.letters for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "letters author write" on public.letters for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "letters couple update" on public.letters for update to authenticated
  using (couple_id = (select private.my_couple_id()))
  with check (couple_id = (select private.my_couple_id()));
create policy "letters author delete" on public.letters for delete to authenticated
  using (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));

create policy "albums couple read" on public.albums for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "albums member write" on public.albums for insert to authenticated
  with check (couple_id = (select private.my_couple_id()));
create policy "albums couple update" on public.albums for update to authenticated
  using (couple_id = (select private.my_couple_id()))
  with check (couple_id = (select private.my_couple_id()));

create policy "photos couple read" on public.photos for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "photos author write" on public.photos for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "photos couple update" on public.photos for update to authenticated
  using (couple_id = (select private.my_couple_id()))
  with check (couple_id = (select private.my_couple_id()));
create policy "photos author delete" on public.photos for delete to authenticated
  using (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));

create policy "voice couple read" on public.voice_notes for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "voice author write" on public.voice_notes for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "voice couple update" on public.voice_notes for update to authenticated
  using (couple_id = (select private.my_couple_id()))
  with check (couple_id = (select private.my_couple_id()));

create policy "canvas couple read" on public.canvas_strokes for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "canvas author write" on public.canvas_strokes for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "canvas couple delete" on public.canvas_strokes for delete to authenticated
  using (couple_id = (select private.my_couple_id()));

create policy "sessions couple read" on public.game_sessions for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "sessions member write" on public.game_sessions for insert to authenticated
  with check (couple_id = (select private.my_couple_id()));
create policy "sessions couple update" on public.game_sessions for update to authenticated
  using (couple_id = (select private.my_couple_id()))
  with check (couple_id = (select private.my_couple_id()));

-- game_moves: append-only. no update, no delete. seq collisions rejected by
-- the unique index; loser re-folds and retries.
create policy "moves couple read" on public.game_moves for select to authenticated
  using (exists (
    select 1 from public.game_sessions s
    where s.id = session_id and s.couple_id = (select private.my_couple_id())));
create policy "moves author append" on public.game_moves for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (
    select 1 from public.game_sessions s
    where s.id = session_id and s.couple_id = (select private.my_couple_id())));

create policy "questions couple read" on public.quiz_questions for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "questions author write" on public.quiz_questions for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));

create policy "answers couple read" on public.quiz_answers for select to authenticated
  using (exists (
    select 1 from public.quiz_questions q
    where q.id = question_id and q.couple_id = (select private.my_couple_id())));
create policy "answers author write" on public.quiz_answers for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (
    select 1 from public.quiz_questions q
    where q.id = question_id and q.couple_id = (select private.my_couple_id())));

create policy "bucket couple read" on public.bucket_list for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "bucket member write" on public.bucket_list for insert to authenticated
  with check (couple_id = (select private.my_couple_id()));
create policy "bucket couple update" on public.bucket_list for update to authenticated
  using (couple_id = (select private.my_couple_id()))
  with check (couple_id = (select private.my_couple_id()));
create policy "bucket couple delete" on public.bucket_list for delete to authenticated
  using (couple_id = (select private.my_couple_id()));

create policy "events couple read" on public.events for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "events member write" on public.events for insert to authenticated
  with check (couple_id = (select private.my_couple_id()));
create policy "events couple update" on public.events for update to authenticated
  using (couple_id = (select private.my_couple_id()))
  with check (couple_id = (select private.my_couple_id()));
create policy "events couple delete" on public.events for delete to authenticated
  using (couple_id = (select private.my_couple_id()));

-- journal: the one author-only exception — private entries stay with the author
create policy "journal couple read" on public.journal_entries for select to authenticated
  using (couple_id = (select private.my_couple_id())
     and (visibility = 'shared' or author_id = (select auth.uid())));
create policy "journal author write" on public.journal_entries for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "journal author update" on public.journal_entries for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy "journal author delete" on public.journal_entries for delete to authenticated
  using (author_id = (select auth.uid()));

-- prefs: strictly per-user
create policy "prefs own read" on public.notification_prefs for select to authenticated
  using (profile_id = (select auth.uid()));
create policy "prefs own update" on public.notification_prefs for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ──────────────────────────────────────────────────────────────────────
-- 7. storage buckets — path segment 1 is always the couple_id
-- ──────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false),
       ('voice', 'voice', false),
       ('letter-audio', 'letter-audio', false)
on conflict (id) do nothing;

create policy "couple storage read" on storage.objects for select to authenticated
  using (bucket_id in ('photos','voice','letter-audio')
     and (storage.foldername(name))[1] = (select private.my_couple_id())::text);
create policy "couple storage write" on storage.objects for insert to authenticated
  with check (bucket_id in ('photos','voice','letter-audio')
     and (storage.foldername(name))[1] = (select private.my_couple_id())::text);
create policy "couple storage update" on storage.objects for update to authenticated
  using (bucket_id in ('photos','voice','letter-audio')
     and (storage.foldername(name))[1] = (select private.my_couple_id())::text);
create policy "couple storage delete" on storage.objects for delete to authenticated
  using (bucket_id in ('photos','voice','letter-audio')
     and (storage.foldername(name))[1] = (select private.my_couple_id())::text);

-- ──────────────────────────────────────────────────────────────────────
-- 8. realtime publication — postgres_changes is the CATCH-UP path; the
--    couple:{id} broadcast channel is the fast path (spec §2.5).
--    Idempotent: re-running this migration must not fail on existing members.
-- ──────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'moods', 'letters', 'photos', 'albums', 'voice_notes', 'canvas_strokes',
    'game_sessions', 'game_moves', 'quiz_questions', 'quiz_answers',
    'bucket_list', 'events', 'journal_entries', 'profiles'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
