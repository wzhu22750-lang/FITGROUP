-- Migration 0013: Security hardening and team helper protections
--
-- 1. Restrict is_team_member() execution:
--    Previously, any authenticated caller could pass arbitrary (target_team_id, target_user_id)
--    and probe membership across all teams. We harden this so non-members cannot probe other users.
--    Callers can always check their own membership (target_user_id = auth.uid()),
--    or verify members if they are already in the team.

create or replace function public.is_team_member(
  target_team_id text,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    return false;
  end if;

  -- Callers can always verify their own membership
  if target_user_id = caller_id then
    return exists (
      select 1
      from public.team_members tm
      where tm.team_id = target_team_id
        and tm.user_id = caller_id
    );
  end if;

  -- To probe another user's membership, the caller must belong to that team
  if exists (
    select 1
    from public.team_members tm
    where tm.team_id = target_team_id
      and tm.user_id = caller_id
  ) then
    return exists (
      select 1
      from public.team_members tm
      where tm.team_id = target_team_id
        and tm.user_id = target_user_id
    );
  end if;

  return false;
end;
$$;

revoke execute on function public.is_team_member(text, uuid) from public, anon;
grant execute on function public.is_team_member(text, uuid) to authenticated;
