-- 0002_multi_category.sql: Update workout_logs.category check constraint to allow multi-category combinations (e.g. 'Chest, Shoulders')
alter table public.workout_logs drop constraint if exists workout_logs_category_check;
alter table public.workout_logs add constraint workout_logs_category_check check (char_length(category) between 1 and 100);
