-- hearts v3 · 0004_bucket_vote.sql
-- P1 finding: votes were written as whole-object replacement (update votes =
-- {...}), so concurrent votes from both phones raced last-write-wins and one
-- vote silently vanished. Votes must MERGE server-side: jsonb || patch, or
-- key removal on un-vote. One RPC, couple-scoped like the table's policies.

create or replace function public.bucket_vote(p_item_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- only a member of the item's couple may vote
  if not exists (
    select 1 from public.bucket_list b
    where b.id = p_item_id
      and b.couple_id = (select private.my_couple_id())
  ) then
    raise exception 'not your list';
  end if;

  if p_on then
    update public.bucket_list
       set votes = coalesce(votes, '{}'::jsonb) || jsonb_build_object((select auth.uid())::text, true)
     where id = p_item_id;
  else
    update public.bucket_list
       set votes = coalesce(votes, '{}'::jsonb) - (select auth.uid())::text
     where id = p_item_id;
  end if;
end;
$$;

revoke all on function public.bucket_vote(uuid, boolean) from public, anon;
grant execute on function public.bucket_vote(uuid, boolean) to authenticated;
