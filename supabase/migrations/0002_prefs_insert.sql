-- hearts v3 · 0002_prefs_insert.sql
-- Round-4 review finding: notification_prefs had select+update policies only.
-- The handle_new_user trigger pre-creates the row, so the client's upsert
-- always took the UPDATE path — but the INSERT path was implicitly denied
-- (any prefs row created outside the trigger, e.g. support tooling or a
-- future re-pair flow, would 42501). Make the contract explicit.
drop policy if exists "prefs own insert" on public.notification_prefs;
create policy "prefs own insert" on public.notification_prefs for insert to authenticated
  with check (profile_id = (select auth.uid()));
