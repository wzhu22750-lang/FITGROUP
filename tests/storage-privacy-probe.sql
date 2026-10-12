-- Remote RLS regression probe: every fixture is rolled back, including auth users.
begin;
create temp table photo_test_users(kind text, id uuid default gen_random_uuid());
insert into photo_test_users(kind) values ('owner'), ('peer'), ('stranger');
grant select on photo_test_users to authenticated;
insert into auth.users(id, email, raw_user_meta_data, aud, role)
select id, id::text || '@photo-probe.invalid', '{"display_name":"Storage probe"}', 'authenticated', 'authenticated' from photo_test_users;
insert into public.teams(id,name,code,created_by)
select 'photo_probe_'||id::text, 'Storage probe', substring(id::text,1,8), id from photo_test_users where kind='owner';
insert into public.team_members(id,team_id,user_id,role)
select 'photo_member_'||u.id::text, 'photo_probe_'||o.id::text, u.id, case when u.kind='owner' then 'owner' else 'member' end
from photo_test_users u cross join photo_test_users o where o.kind='owner' and u.kind in ('owner','peer');
insert into public.workout_logs(id,user_id,user_name,category,exercises,visibility,photo_url)
select 'photo_probe_'||visibility||'_'||u.id::text, u.id, 'Storage probe', 'Chest',
 '[{"id":"e","name":"卧推","weight":40,"sets":3,"reps":8,"type":"strength"}]', visibility,
 'https://cuqszaigzxvxughamwzt.supabase.co/storage/v1/object/public/workouts/'||u.id::text||'/'||visibility||'.jpg'
from photo_test_users u cross join (values('public'),('friends'),('private')) v(visibility) where u.kind='owner';
-- A stranger's public log must not expose the owner's private object.
insert into public.workout_logs(id,user_id,user_name,category,exercises,visibility,photo_url)
select 'photo_forged_'||s.id::text, s.id, 'Storage probe', 'Chest',
 '[{"id":"e","name":"卧推","weight":40,"sets":3,"reps":8,"type":"strength"}]', 'public',
 'https://cuqszaigzxvxughamwzt.supabase.co/storage/v1/object/public/workouts/'||o.id::text||'/private.jpg'
from photo_test_users s cross join photo_test_users o where s.kind='stranger' and o.kind='owner';
insert into storage.objects(bucket_id,name)
select 'workouts',id::text||'/'||file||'.jpg' from photo_test_users cross join(values('public'),('friends'),('private'),('draft')) f(file) where kind='owner';
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from photo_test_users where kind='stranger';
set local role authenticated;
do $$ begin
 if (select count(*) from storage.objects where name like '%/private.jpg' and bucket_id='workouts')<>0 then raise exception 'FAIL stranger private read'; end if;
 if (select count(*) from storage.objects where name like '%/friends.jpg' and bucket_id='workouts')<>0 then raise exception 'FAIL stranger friends read'; end if;
 if (select count(*) from storage.objects where name like '%/draft.jpg' and bucket_id='workouts')<>0 then raise exception 'FAIL stranger draft read'; end if;
 if (select count(*) from storage.objects where name like '%/public.jpg' and bucket_id='workouts')<>1 then raise exception 'FAIL stranger public read'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from photo_test_users where kind='peer';
set local role authenticated;
do $$ begin
 if (select count(*) from storage.objects where name like '%/friends.jpg' and bucket_id='workouts')<>1 then raise exception 'FAIL peer friends read'; end if;
 if (select count(*) from storage.objects where name like '%/private.jpg' and bucket_id='workouts')<>0 then raise exception 'FAIL peer private read'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true) from photo_test_users where kind='owner';
set local role authenticated;
do $$ declare allowed_count integer; delete_qual text; begin
 if (select count(*) from storage.objects where bucket_id='workouts')<>4 then raise exception 'FAIL owner read'; end if;
 select qual into delete_qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='workouts_delete';
 execute 'select count(*) from storage.objects where bucket_id=''workouts'' and name like ''%/private.jpg'' and ('||delete_qual||')' into allowed_count;
 if allowed_count<>0 then raise exception 'FAIL referenced photo deletion policy'; end if;
 execute 'select count(*) from storage.objects where bucket_id=''workouts'' and name like ''%/draft.jpg'' and ('||delete_qual||')' into allowed_count;
 if allowed_count<>1 then raise exception 'FAIL orphan deletion policy'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
 if (select count(*) from storage.objects where bucket_id='workouts')<>0 then raise exception 'FAIL anonymous access'; end if;
end $$;
reset role;
select 'PASS Storage RLS: owner/peer/stranger/anonymous, public/friends/private/draft, referenced-delete protection; all fixtures rolled back' as result;
rollback;
