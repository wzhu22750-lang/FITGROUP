-- 0004_teams_and_visibility.sql
-- Multi-squad support (teams, team_members), workout visibility (public, friends, private),
-- RLS security policies, and team operations functions.

-- 1. Add visibility column to workout_logs with default 'public'
alter table public.workout_logs
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'friends', 'private'));

comment on column public.workout_logs.visibility is 'public: 全员广场 | friends: 好友小队 | private: 仅自己可见';

-- Relax category check constraint to support multi-category workouts (e.g. 'Chest, Shoulders')
alter table public.workout_logs drop constraint if exists workout_logs_category_check;
alter table public.workout_logs add constraint workout_logs_category_check check (char_length(category) between 1 and 100);

-- Grant column insert & update privileges on workout_logs
grant insert (visibility), update (visibility) on public.workout_logs to authenticated;


-- 2. Create teams table
create table if not exists public.teams (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  name text not null check (char_length(name) between 1 and 50),
  code text not null unique check (char_length(code) between 4 and 20),
  created_by uuid not null references public.profiles (id) on delete cascade,
  max_members integer not null default 8 check (max_members >= 2 and max_members <= 50),
  created_at timestamptz not null default now()
);

-- 3. Create team_members table
create table if not exists public.team_members (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  team_id text not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- 4. Indexes for performance
create index if not exists workout_logs_visibility_created on public.workout_logs (visibility, created_at desc);
create index if not exists workout_logs_user_vis_created on public.workout_logs (user_id, visibility, created_at desc);
create index if not exists teams_created_by on public.teams (created_by);
create index if not exists teams_code_upper on public.teams (upper(code));
create index if not exists team_members_user_team on public.team_members (user_id, team_id);
create index if not exists team_members_team_joined on public.team_members (team_id, joined_at asc);

-- 5. Helper function for RLS to check if two users share any team
create or replace function public.is_team_peer(author_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.team_members tm1
    join public.team_members tm2 on tm1.team_id = tm2.team_id
    where tm1.user_id = author_id
      and tm2.user_id = auth.uid()
  );
$$;

-- 6. Privileges & RLS Setup
revoke all on public.teams from anon, authenticated, public;
revoke all on public.team_members from anon, authenticated, public;

grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Workout logs RLS: Update select policy to enforce visibility
drop policy if exists workout_logs_select on public.workout_logs;
create policy workout_logs_select on public.workout_logs
  for select to authenticated
  using (
    visibility = 'public'
    or user_id = auth.uid()
    or (visibility = 'friends' and public.is_team_peer(user_id))
  );

-- Teams RLS policies
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (true);

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams
  for delete to authenticated
  using (created_by = auth.uid());

-- Team members RLS policies
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using (true);

drop policy if exists team_members_insert on public.team_members;
create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists team_members_delete on public.team_members;
create policy team_members_delete on public.team_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and t.created_by = auth.uid()
    )
  );

-- 7. Realtime publications
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_members'
  ) then
    alter publication supabase_realtime add table public.team_members;
  end if;
end $$;

-- 8. Code Generator Helper Function
create or replace function public.generate_unique_team_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text;
  i integer;
  candidate text;
  tries integer := 0;
begin
  loop
    result := '';
    for i in 1..4 loop
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    end loop;
    candidate := 'FIT-' || result;

    if not exists (select 1 from public.teams where upper(code) = upper(candidate)) then
      return candidate;
    end if;

    tries := tries + 1;
    if tries > 100 then
      return 'FIT-' || substr(md5(random()::text), 1, 4);
    end if;
  end loop;
end;
$$;

-- 9. RPC Functions for atomic team creation, join, and leave
create or replace function public.create_new_team(
  p_name text,
  p_max_members integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id text;
  v_code text;
  v_member_id text;
  v_team record;
begin
  if v_user_id is null then
    raise exception '未登录';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception '小队名称不能为空';
  end if;

  if p_max_members is null or p_max_members < 2 or p_max_members > 50 then
    p_max_members := 8;
  end if;

  v_team_id := 'team_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
  v_code := public.generate_unique_team_code();
  v_member_id := 'tm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

  insert into public.teams (id, name, code, created_by, max_members)
  values (v_team_id, left(trim(p_name), 50), v_code, v_user_id, p_max_members)
  returning * into v_team;

  insert into public.team_members (id, team_id, user_id, role)
  values (v_member_id, v_team_id, v_user_id, 'owner');

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
  where upper(code) = upper(trim(p_code));

  if not found then
    raise exception '无效的小队口令，请核对后重试';
  end if;

  if exists (
    select 1 from public.team_members
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
  v_is_owner boolean;
  v_remaining_count integer;
begin
  if v_user_id is null then
    raise exception '未登录';
  end if;

  delete from public.team_members
  where team_id = p_team_id and user_id = v_user_id;

  select count(*) into v_remaining_count
  from public.team_members
  where team_id = p_team_id;

  if v_remaining_count = 0 then
    delete from public.teams where id = p_team_id;
  end if;
end;
$$;
