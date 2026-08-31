-- FitGroup initial schema: profiles, logs, likes, comments, stats triggers, RLS, storage.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_empty_or_http_url(value text)
returns boolean
language sql
immutable
as $$
  select value is not null
    and char_length(value) <= 500
    and (value = '' or value ~ '^https?://');
$$;

create or replace function public.is_valid_exercise(ex jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  ex_type text;
  keys text[];
begin
  if ex is null or jsonb_typeof(ex) <> 'object' then
    return false;
  end if;

  select array_agg(k order by k) into keys
  from jsonb_object_keys(ex) as k;

  if keys is null
     or keys <@ array['id','name','type','weight','sets','reps','duration','distance','calories'] is not true then
    return false;
  end if;

  if coalesce(ex->>'id', '') = '' or char_length(ex->>'id') > 64 then
    return false;
  end if;
  if coalesce(ex->>'name', '') = '' or char_length(ex->>'name') > 80 then
    return false;
  end if;

  ex_type := ex->>'type';
  if ex_type not in ('strength', 'cardio') then
    return false;
  end if;

  if ex_type = 'strength' then
    if ex ? 'weight' and not (jsonb_typeof(ex->'weight') = 'number' and (ex->>'weight')::numeric between -500 and 2000) then
      return false;
    end if;
    if ex ? 'sets' and not (jsonb_typeof(ex->'sets') = 'number' and (ex->>'sets')::numeric between 0 and 100) then
      return false;
    end if;
    if ex ? 'reps' and not (jsonb_typeof(ex->'reps') = 'number' and (ex->>'reps')::numeric between 0 and 1000) then
      return false;
    end if;
  else
    if ex ? 'duration' and not (jsonb_typeof(ex->'duration') = 'number' and (ex->>'duration')::numeric between 0 and 1440) then
      return false;
    end if;
    if ex ? 'distance' and not (jsonb_typeof(ex->'distance') = 'number' and (ex->>'distance')::numeric between 0 and 1000) then
      return false;
    end if;
    if ex ? 'calories' and not (jsonb_typeof(ex->'calories') = 'number' and (ex->>'calories')::numeric between 0 and 20000) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.is_valid_exercises(list jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
  n int;
begin
  if list is null or jsonb_typeof(list) <> 'array' then
    return false;
  end if;
  n := jsonb_array_length(list);
  if n < 1 or n > 10 then
    return false;
  end if;
  for item in select value from jsonb_array_elements(list)
  loop
    if not public.is_valid_exercise(item) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  photo_url text not null default '' check (public.is_empty_or_http_url(photo_url)),
  streak integer not null default 0 check (streak >= 0 and streak <= 100000),
  total_workouts integer not null default 0 check (total_workouts >= 0 and total_workouts <= 1000000),
  last_workout_date timestamptz,
  prs jsonb not null default '{}'::jsonb check (jsonb_typeof(prs) = 'object' and jsonb_typeof(prs) is not null)
);

create table public.workout_logs (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null check (char_length(user_name) between 1 and 50),
  user_photo text not null default '' check (public.is_empty_or_http_url(user_photo)),
  created_at timestamptz not null default now(),
  category text not null check (category in ('Shoulders', 'Chest', 'Back', 'Legs', 'Cardio', 'Others')),
  exercises jsonb not null check (public.is_valid_exercises(exercises)),
  note text not null default '' check (char_length(note) <= 500),
  photo_url text not null default '' check (public.is_empty_or_http_url(photo_url)),
  likes_count integer not null default 0 check (likes_count >= 0 and likes_count <= 1000000),
  comments_count integer not null default 0 check (comments_count >= 0 and comments_count <= 1000000)
);

create table public.workout_likes (
  log_id text not null references public.workout_logs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (log_id, user_id)
);

create table public.workout_comments (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  log_id text not null references public.workout_logs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null check (char_length(user_name) between 1 and 50),
  user_photo text not null default '' check (public.is_empty_or_http_url(user_photo)),
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now()
);

create index workout_logs_created_at_desc on public.workout_logs (created_at desc);
create index workout_logs_user_created on public.workout_logs (user_id, created_at desc);
create index profiles_streak_desc on public.profiles (streak desc);
create index workout_comments_log_created on public.workout_comments (log_id, created_at asc);

-- ---------------------------------------------------------------------------
-- Auth → profile
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  name text;
begin
  raw_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'FitGroup'
  );
  name := left(raw_name, 50);

  insert into public.profiles (id, display_name, photo_url)
  values (
    new.id,
    name,
    coalesce(left(new.raw_user_meta_data->>'photo_url', 500), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Like / comment counters
-- ---------------------------------------------------------------------------

create or replace function public.trg_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.workout_logs
      set likes_count = likes_count + 1
      where id = new.log_id;
    return new;
  end if;

  update public.workout_logs
    set likes_count = greatest(likes_count - 1, 0)
    where id = old.log_id;
  return old;
end;
$$;

create trigger workout_likes_count
  after insert or delete on public.workout_likes
  for each row execute function public.trg_likes_count();

create or replace function public.trg_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.workout_logs
      set comments_count = comments_count + 1
      where id = new.log_id;
    return new;
  end if;

  update public.workout_logs
    set comments_count = greatest(comments_count - 1, 0)
    where id = old.log_id;
  return old;
end;
$$;

create trigger workout_comments_count
  after insert or delete on public.workout_comments
  for each row execute function public.trg_comments_count();

-- ---------------------------------------------------------------------------
-- Derived profile stats (P0: clients cannot write these columns)
-- ---------------------------------------------------------------------------

create or replace function public.recalc_profile_stats(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_prs jsonb;
  v_last timestamptz;
  v_streak integer := 0;
  v_dates date[];
  v_today date;
  v_latest date;
  v_curr date;
  i integer;
begin
  select count(*) into v_total
  from public.workout_logs
  where user_id = target_user;

  select coalesce(jsonb_object_agg(name, max_weight), '{}'::jsonb)
  into v_prs
  from (
    select
      trim(ex->>'name') as name,
      max((ex->>'weight')::numeric) as max_weight
    from public.workout_logs l
    cross join lateral jsonb_array_elements(coalesce(l.exercises, '[]'::jsonb)) ex
    where l.user_id = target_user
      and ex->>'type' = 'strength'
      and nullif(trim(ex->>'name'), '') is not null
      and jsonb_typeof(ex->'weight') = 'number'
      and (ex->>'weight')::numeric > 0
    group by trim(ex->>'name')
  ) s;

  select max(created_at) into v_last
  from public.workout_logs
  where user_id = target_user;

  v_today := (timezone('Asia/Shanghai', now()))::date;

  select coalesce(array_agg(d order by d desc), '{}'::date[])
  into v_dates
  from (
    select distinct (timezone('Asia/Shanghai', created_at))::date as d
    from public.workout_logs
    where user_id = target_user
  ) q;

  if array_length(v_dates, 1) is not null then
    v_latest := v_dates[1];
    if v_latest = v_today or v_latest = v_today - 1 then
      v_streak := 1;
      v_curr := v_latest;
      for i in 2 .. array_length(v_dates, 1) loop
        if v_dates[i] = v_curr - 1 then
          v_streak := v_streak + 1;
          v_curr := v_dates[i];
        else
          exit;
        end if;
      end loop;
    end if;
  end if;

  update public.profiles
  set
    total_workouts = v_total,
    prs = v_prs,
    last_workout_date = v_last,
    streak = v_streak
  where id = target_user;
end;
$$;

create or replace function public.trg_workout_logs_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_profile_stats(old.user_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.recalc_profile_stats(old.user_id);
    perform public.recalc_profile_stats(new.user_id);
    return new;
  end if;

  perform public.recalc_profile_stats(new.user_id);
  return new;
end;
$$;

create trigger workout_logs_stats
  after insert or update or delete on public.workout_logs
  for each row execute function public.trg_workout_logs_stats();

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated, public;
revoke all on public.workout_logs from anon, authenticated, public;
revoke all on public.workout_likes from anon, authenticated, public;
revoke all on public.workout_comments from anon, authenticated, public;

grant select on public.profiles to authenticated;
grant insert (id, display_name, photo_url) on public.profiles to authenticated;
grant update (display_name, photo_url) on public.profiles to authenticated;

grant select on public.workout_logs to authenticated;
grant insert (id, user_id, user_name, user_photo, category, exercises, note, photo_url)
  on public.workout_logs to authenticated;
grant update (user_name, user_photo, category, exercises, note, photo_url)
  on public.workout_logs to authenticated;
grant delete on public.workout_logs to authenticated;

grant select, insert, delete on public.workout_likes to authenticated;
grant select, insert, delete on public.workout_comments to authenticated;

alter table public.profiles enable row level security;
alter table public.workout_logs enable row level security;
alter table public.workout_likes enable row level security;
alter table public.workout_comments enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy workout_logs_select on public.workout_logs
  for select to authenticated
  using (true);

create policy workout_logs_insert on public.workout_logs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy workout_logs_update on public.workout_logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy workout_logs_delete on public.workout_logs
  for delete to authenticated
  using (user_id = auth.uid());

create policy workout_likes_select on public.workout_likes
  for select to authenticated
  using (true);

create policy workout_likes_insert on public.workout_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.workout_logs l where l.id = log_id)
  );

create policy workout_likes_delete on public.workout_likes
  for delete to authenticated
  using (user_id = auth.uid());

create policy workout_comments_select on public.workout_comments
  for select to authenticated
  using (true);

create policy workout_comments_insert on public.workout_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.workout_logs l where l.id = log_id)
  );

create policy workout_comments_delete on public.workout_comments
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.workout_logs;
alter publication supabase_realtime add table public.workout_likes;
alter publication supabase_realtime add table public.workout_comments;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'avatars',
    'avatars',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
  ),
  (
    'workouts',
    'workouts',
    false,
    8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
  )
on conflict (id) do nothing;

create policy avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy workouts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'workouts');

create policy workouts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workouts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy workouts_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'workouts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'workouts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy workouts_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workouts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
