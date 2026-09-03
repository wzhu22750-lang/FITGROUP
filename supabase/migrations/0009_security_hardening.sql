-- 0009_security_hardening.sql
-- Close the remaining privacy and team-permission gaps without changing the
-- workout-log fact model. Public profile data is exposed through a safe view;
-- the base profiles table remains owner-only.

-- ---------------------------------------------------------------------------
-- 1. Profile privacy: base rows are owner-only, public fields use a safe view
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- This view intentionally exposes no email, sex, body metrics, or PR payload.
-- It is a public community projection, not a replacement for profiles.
drop view if exists public.public_profiles;
create view public.public_profiles as
select
  id,
  display_name,
  photo_url,
  streak,
  total_workouts,
  last_workout_date
from public.profiles;

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

-- The base table is owner-only, so the client uses this RPC when it needs the
-- current user's private body metrics and PR payload.
create or replace function public.get_my_profile()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select to_jsonb(p)
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke execute on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Workout social rows must follow the parent workout visibility
-- ---------------------------------------------------------------------------

create or replace function public.can_view_workout_log(target_log_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workout_logs l
    where l.id = target_log_id
      and (
        l.user_id = auth.uid()
        or l.visibility = 'public'
        or (l.visibility = 'friends' and public.is_team_peer(l.user_id))
      )
  );
$$;

revoke execute on function public.can_view_workout_log(text) from public, anon;
grant execute on function public.can_view_workout_log(text) to authenticated;

drop policy if exists workout_likes_select on public.workout_likes;
create policy workout_likes_select on public.workout_likes
  for select to authenticated
  using (public.can_view_workout_log(log_id));

drop policy if exists workout_likes_insert on public.workout_likes;
create policy workout_likes_insert on public.workout_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_workout_log(log_id)
  );

drop policy if exists workout_comments_select on public.workout_comments;
create policy workout_comments_select on public.workout_comments
  for select to authenticated
  using (public.can_view_workout_log(log_id));

drop policy if exists workout_comments_insert on public.workout_comments;
create policy workout_comments_insert on public.workout_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_workout_log(log_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Teams: no enumeration by non-members; mutations go through RPCs
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER avoids recursively evaluating team_members RLS while the
-- policy itself decides whether the caller belongs to that team.
create or replace function public.is_team_member(
  target_team_id text,
  target_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = target_team_id
      and tm.user_id = target_user_id
  );
$$;

revoke execute on function public.is_team_member(text, uuid) from public, anon;
grant execute on function public.is_team_member(text, uuid) to authenticated;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_team_member(teams.id, auth.uid())
  );

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_team_member(team_members.team_id, auth.uid())
  );

-- The application uses the security-definer RPCs below. Direct table writes
-- would bypass the invite-code, capacity, and owner-lifecycle invariants.
revoke insert, update, delete on public.teams from authenticated;
revoke insert, delete on public.team_members from authenticated;
grant select on public.teams to authenticated;
grant select on public.team_members to authenticated;

-- Join is serialized on the team row so the capacity check is atomic.
create or replace function public.join_team_by_code(
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team record;
  v_current_count integer;
  v_member_id text;
begin
  if v_user_id is null then
    raise exception '未登录';
  end if;

  if p_code is null or length(trim(p_code)) = 0 then
    raise exception '请输入小队口令';
  end if;

  select * into v_team
  from public.teams
  where upper(code) = upper(trim(p_code))
  for update;

  if not found then
    raise exception '无效的小队口令，请核对后重试';
  end if;

  if exists (
    select 1
    from public.team_members
    where team_id = v_team.id and user_id = v_user_id
  ) then
    raise exception '您已经是该小队的成员，无需重复加入';
  end if;

  select count(*) into v_current_count
  from public.team_members
  where team_id = v_team.id;

  if v_current_count >= v_team.max_members then
    raise exception '该小队人数已达上限（%人）', v_team.max_members;
  end if;

  v_member_id := 'tm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

  insert into public.team_members (id, team_id, user_id, role)
  values (v_member_id, v_team.id, v_user_id, 'member');

  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'code', v_team.code,
    'created_by', v_team.created_by,
    'max_members', v_team.max_members,
    'created_at', v_team.created_at
  );
end;
$$;

-- Leaving transfers ownership to the earliest remaining member. The team row
-- lock prevents concurrent leave operations from selecting the same successor.
create or replace function public.leave_team_by_id(
  p_team_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_successor_id uuid;
  v_role text;
  v_remaining_count integer;
begin
  if v_user_id is null then
    raise exception '未登录';
  end if;

  select created_by into v_owner_id
  from public.teams
  where id = p_team_id
  for update;

  if not found then
    raise exception '小队不存在';
  end if;

  select role into v_role
  from public.team_members
  where team_id = p_team_id and user_id = v_user_id;

  if not found then
    raise exception '你不是该小队成员';
  end if;

  select count(*) into v_remaining_count
  from public.team_members
  where team_id = p_team_id;

  if v_remaining_count = 1 then
    delete from public.teams where id = p_team_id;
    return;
  end if;

  if v_owner_id = v_user_id or v_role = 'owner' then
    select user_id into v_successor_id
    from public.team_members
    where team_id = p_team_id and user_id <> v_user_id
    order by joined_at asc, id asc
    limit 1;

    if v_successor_id is null then
      delete from public.teams where id = p_team_id;
      return;
    end if;

    update public.teams
    set created_by = v_successor_id
    where id = p_team_id;

    update public.team_members
    set role = 'member'
    where team_id = p_team_id;

    update public.team_members
    set role = 'owner'
    where team_id = p_team_id and user_id = v_successor_id;
  end if;

  delete from public.team_members
  where team_id = p_team_id and user_id = v_user_id;
end;
$$;

revoke execute on function public.join_team_by_code(text) from public, anon;
grant execute on function public.join_team_by_code(text) to authenticated;
revoke execute on function public.leave_team_by_id(text) from public, anon;
grant execute on function public.leave_team_by_id(text) to authenticated;
revoke execute on function public.create_new_team(text, integer) from public, anon;
grant execute on function public.create_new_team(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Feedback: authenticated, owner-bound, server-defaulted metadata
-- ---------------------------------------------------------------------------

create or replace function public.fill_feedback_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
begin
  if v_user_id is null then
    raise exception '未登录';
  end if;

  select display_name into v_display_name
  from public.profiles
  where id = v_user_id;

  new.user_id := v_user_id;
  new.user_name := coalesce(nullif(v_display_name, ''), '健友');
  new.user_email := '';
  new.status := 'pending';
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;

drop trigger if exists feedbacks_fill_actor on public.feedbacks;
create trigger feedbacks_fill_actor
  before insert on public.feedbacks
  for each row execute function public.fill_feedback_actor();

revoke all on public.feedbacks from anon, public, authenticated;
grant select on public.feedbacks to authenticated;
grant insert (id, type, content, contact) on public.feedbacks to authenticated;

drop policy if exists feedbacks_insert_all on public.feedbacks;
drop policy if exists feedbacks_insert_own on public.feedbacks;
create policy feedbacks_insert_own on public.feedbacks
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists feedbacks_select_own on public.feedbacks;
create policy feedbacks_select_own on public.feedbacks
  for select to authenticated
  using (user_id = auth.uid());

revoke execute on function public.fill_feedback_actor() from public, anon;
grant execute on function public.fill_feedback_actor() to authenticated;
