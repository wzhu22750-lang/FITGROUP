-- 0003_body_metrics.sql
-- Add physical profile attributes for strength score scaling and health metrics
alter table public.profiles
  add column if not exists sex text
    check (sex is null or sex in ('male', 'female')),
  add column if not exists bodyweight_kg numeric
    check (bodyweight_kg is null or (bodyweight_kg >= 30 and bodyweight_kg <= 200)),
  add column if not exists height_cm numeric
    check (height_cm is null or (height_cm >= 120 and height_cm <= 220)),
  add column if not exists body_metrics_updated_at timestamptz;

comment on column public.profiles.sex is 'male | female; null = unscored fallback';
comment on column public.profiles.bodyweight_kg is 'kg; used for strength standards scaling (clamp 45-130)';
comment on column public.profiles.height_cm is 'cm; display/BMI only, not used in strength score v1';

-- Grant column insert and update permissions to authenticated users
grant insert (sex, bodyweight_kg, height_cm, body_metrics_updated_at) on public.profiles to authenticated;
grant update (sex, bodyweight_kg, height_cm, body_metrics_updated_at) on public.profiles to authenticated;
