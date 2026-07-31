-- hearts v3 · 0006_notify_settings.sql
-- Wire the notify fan-out WITHOUT ALTER DATABASE (hosted Postgres denies
-- ALTER DATABASE SET to both the management API and the migration role).
-- Settings live in a table the trigger can read; seed them here.

create table if not exists private.app_config (
  key text primary key,
  value text not null
);

insert into private.app_config (key, value) values
  ('notify_url', 'https://zfnsnvfqxxbynivhqiru.supabase.co/functions/v1/notify'),
  ('notify_secret', 'hearts-fanout-5c6d1d0b6f7a')
on conflict (key) do update set value = excluded.value;

-- same logic as 0001, but reads private.app_config instead of current_setting
create or replace function private.fanout_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_couple uuid;
begin
  select value into v_url from private.app_config where key = 'notify_url';
  if v_url is null or v_url = '' then
    return new;  -- not configured (local dev): skip silently
  end if;
  select value into v_secret from private.app_config where key = 'notify_secret';

  -- game_moves has no couple_id column: resolve it through the session,
  -- otherwise the edge function would match NULL couples
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
      'x-hearts-secret', coalesce(v_secret, '')
    )
  );
  return new;
end;
$$;
