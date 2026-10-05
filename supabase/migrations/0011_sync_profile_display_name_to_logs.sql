-- Migration 0011: Synchronize profile display_name and photo_url to historical workout_logs and workout_comments
-- Automatically triggers on profile display_name / photo_url update, keeping all historical records consistent.

-- 1. Create cascade function
create or replace function public.sync_profile_display_name_to_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.display_name is distinct from new.display_name) or (old.photo_url is distinct from new.photo_url) then
    -- Cascade update to all historical workout logs of this user
    update public.workout_logs
    set user_name = coalesce(nullif(trim(new.display_name), ''), 'FitGroup'),
        user_photo = coalesce(new.photo_url, '')
    where user_id = new.id;

    -- Cascade update to all historical workout comments of this user
    update public.workout_comments
    set user_name = coalesce(nullif(trim(new.display_name), ''), 'FitGroup'),
        user_photo = coalesce(new.photo_url, '')
    where user_id = new.id;
  end if;
  return new;
end;
$$;

-- 2. Trigger on public.profiles
drop trigger if exists sync_profile_display_name on public.profiles;
create trigger sync_profile_display_name
  after update of display_name, photo_url on public.profiles
  for each row execute function public.sync_profile_display_name_to_logs();

-- 3. Ensure permissions and policies for updating comments if needed
grant update (user_name, user_photo) on public.workout_comments to authenticated;

drop policy if exists workout_comments_update on public.workout_comments;
create policy workout_comments_update on public.workout_comments
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. One-time data backfill: fix any historical logs/comments that differ from current profile display_name
update public.workout_logs l
set user_name = coalesce(nullif(trim(p.display_name), ''), 'FitGroup'),
    user_photo = coalesce(p.photo_url, '')
from public.profiles p
where l.user_id = p.id
  and (l.user_name is distinct from p.display_name or l.user_photo is distinct from p.photo_url);

update public.workout_comments c
set user_name = coalesce(nullif(trim(p.display_name), ''), 'FitGroup'),
    user_photo = coalesce(p.photo_url, '')
from public.profiles p
where c.user_id = p.id
  and (c.user_name is distinct from p.display_name or c.user_photo is distinct from p.photo_url);
