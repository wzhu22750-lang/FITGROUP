-- ============================================================================
-- 0005_notifications.sql
-- Notification system for workout likes and comments
-- ============================================================================

-- 1. Create notifications table
create table if not exists public.notifications (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  actor_name text not null default '健友' check (char_length(actor_name) between 1 and 50),
  actor_photo text not null default '',
  type text not null check (type in ('like', 'comment')),
  log_id text not null references public.workout_logs (id) on delete cascade,
  content text not null default '' check (char_length(content) <= 500),
  log_category text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Create indexes for performance
create index if not exists notifications_user_unread_created on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists notifications_log_id on public.notifications (log_id);

-- 3. Configure RLS security policies
alter table public.notifications enable row level security;
alter table public.notifications replica identity full;

grant select, update, delete on public.notifications to authenticated;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- 4. Enable Supabase Realtime for notifications
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 5. Trigger function: Auto-create notification on Like
create or replace function public.trg_notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log record;
  v_actor record;
  v_notif_id text;
begin
  -- Find author of the workout log
  select id, user_id, category into v_log
  from public.workout_logs
  where id = new.log_id;

  if not found then
    return new;
  end if;

  -- Do not notify if user liked their own workout log
  if v_log.user_id = new.user_id then
    return new;
  end if;

  -- Get actor info
  select display_name, photo_url into v_actor
  from public.profiles
  where id = new.user_id;

  v_notif_id := 'ntf_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

  -- Insert notification (upsert/ignore if like already notified recently)
  insert into public.notifications (
    id, user_id, actor_id, actor_name, actor_photo, type, log_id, content, log_category
  ) values (
    v_notif_id,
    v_log.user_id,
    new.user_id,
    coalesce(v_actor.display_name, '健友'),
    coalesce(v_actor.photo_url, ''),
    'like',
    new.log_id,
    '',
    coalesce(v_log.category, '')
  );

  return new;
end;
$$;

drop trigger if exists notify_on_like on public.workout_likes;
create trigger notify_on_like
  after insert on public.workout_likes
  for each row execute function public.trg_notify_on_like();

-- 6. Trigger function: Auto-create notification on Comment
create or replace function public.trg_notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log record;
  v_notif_id text;
begin
  -- Find author of the workout log
  select id, user_id, category into v_log
  from public.workout_logs
  where id = new.log_id;

  if not found then
    return new;
  end if;

  -- Do not notify if user commented on their own workout log
  if v_log.user_id = new.user_id then
    return new;
  end if;

  v_notif_id := 'ntf_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

  insert into public.notifications (
    id, user_id, actor_id, actor_name, actor_photo, type, log_id, content, log_category
  ) values (
    v_notif_id,
    v_log.user_id,
    new.user_id,
    coalesce(new.user_name, '健友'),
    coalesce(new.user_photo, ''),
    'comment',
    new.log_id,
    coalesce(new.content, ''),
    coalesce(v_log.category, '')
  );

  return new;
end;
$$;

drop trigger if exists notify_on_comment on public.workout_comments;
create trigger notify_on_comment
  after insert on public.workout_comments
  for each row execute function public.trg_notify_on_comment();
