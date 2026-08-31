-- Preserve whether a cardio calorie value was user-reported or generated from MET.
-- This is an optional JSON key; no table columns are added and legacy records remain valid.

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
     or keys <@ array['id','name','type','weight','sets','reps','duration','distance','calories','caloriesSource'] is not true then
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

  if ex ? 'caloriesSource' and (
    ex_type <> 'cardio'
    or jsonb_typeof(ex->'caloriesSource') <> 'string'
    or ex->>'caloriesSource' not in ('reported', 'estimated')
  ) then
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
