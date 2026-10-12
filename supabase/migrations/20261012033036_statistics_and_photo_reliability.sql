-- Keep legacy photo_url values as stable object references; reads require JWT + RLS.
begin;
create or replace function public.workout_photo_path(reference text)
returns text language sql immutable set search_path = public
as $$ select substring(reference from '/storage/v1/object/(?:public|authenticated)/workouts/([^?#]+)'); $$;
grant execute on function public.workout_photo_path(text) to authenticated;
revoke execute on function public.workout_photo_path(text) from public, anon;

update storage.buckets set public = false where id = 'workouts';
drop policy if exists workouts_read on storage.objects;
create policy workouts_read on storage.objects for select to authenticated
using (bucket_id = 'workouts' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or exists (select 1 from public.workout_logs l
    where l.user_id::text = (storage.foldername(name))[1]
      and public.workout_photo_path(l.photo_url) = name)
));
-- The log SELECT policy decides public/friends/private access. No definer bypass.
drop policy if exists workouts_delete on storage.objects;
create policy workouts_delete on storage.objects for delete to authenticated
using (bucket_id = 'workouts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.workout_logs l
    where public.workout_photo_path(l.photo_url) = name and l.user_id = (select auth.uid()))
);
drop policy if exists workouts_update on storage.objects;
create policy workouts_update on storage.objects for update to authenticated
using (bucket_id = 'workouts' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.workout_logs l
    where public.workout_photo_path(l.photo_url) = name and l.user_id = (select auth.uid())))
with check (bucket_id = 'workouts' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
