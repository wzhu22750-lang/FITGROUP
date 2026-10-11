-- 0012_training_time_column_grant.sql
-- Backdated check-ins: the client may set a log's training time (created_at).
--
-- 0001 grants column-level INSERT/UPDATE privileges on workout_logs and 0004 adds
-- visibility, but created_at was never granted. Postgres therefore rejects any
-- write that names created_at with 42501 (permission denied for table workout_logs),
-- which the app surfaces as "RLS 权限错误". That broke both backdated check-ins and
-- editing a log's training time.

grant insert (created_at), update (created_at) on public.workout_logs to authenticated;

-- A column grant cannot express "not in the future", so enforce it in the database
-- as well. The client validates too, but the database is the trust boundary.
create or replace function public.workout_logs_guard_training_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_at is null then
    new.created_at := now();
  elsif new.created_at > now() + interval '1 minute' then
    raise exception '训练时间不能晚于当前时间' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists workout_logs_guard_training_time on public.workout_logs;
-- INSERT always runs the guard; UPDATE only when the statement touches created_at,
-- so ordinary content edits keep their existing timestamp untouched.
create trigger workout_logs_guard_training_time
  before insert or update of created_at on public.workout_logs
  for each row execute function public.workout_logs_guard_training_time();
