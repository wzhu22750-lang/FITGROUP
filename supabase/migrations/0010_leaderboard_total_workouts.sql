-- Migration 0010: Add index for total_workouts leaderboard query
-- Supports ordering by total_workouts desc, with streak desc as secondary tie-breaker

create index if not exists profiles_total_workouts_desc on public.profiles (total_workouts desc, streak desc);
