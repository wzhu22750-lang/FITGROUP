---
name: supabase-admin
description: Directly execute SQL queries, manage database schema, constraints, RLS policies, and automatically apply migrations to Supabase.
---

# Supabase Admin & Automation Skill

This skill allows Antigravity to directly manage and modify the Supabase database without requiring the user to manually copy and paste SQL into the Supabase Dashboard.

## Prerequisites

To execute SQL directly, the project requires a Supabase Access Token in `.env`:
```env
SUPABASE_ACCESS_TOKEN=sbp_xxxx
```
User can obtain this token from: [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)

## Automated Database Operations

### 1. Execute SQL String Directly
Run any SQL statement (DDL, DML, constraints, RLS, functions):
```bash
npx tsx scripts/supabase-admin.ts --sql "alter table public.workout_logs drop constraint if exists workout_logs_category_check; alter table public.workout_logs add constraint workout_logs_category_check check (char_length(category) between 1 and 100);"
```

### 2. Execute a Migration File
Apply a specific migration file:
```bash
npx tsx scripts/supabase-admin.ts --file supabase/migrations/0004_teams_and_visibility.sql
```

### 3. Apply All Migrations
Sequentially apply all migration files in `supabase/migrations/`:
```bash
npx tsx scripts/supabase-admin.ts --apply-all
```

### 4. Check Connection & Status
```bash
npx tsx scripts/supabase-admin.ts --check
```

## Workflow Guidelines

1. Whenever the database schema, constraints, or RLS policies need to be updated:
   - Create or update the `.sql` migration file in `supabase/migrations/`.
   - Run `npx tsx scripts/supabase-admin.ts --file <file>` or `--sql "<sql>"` to apply it directly.
   - If `SUPABASE_ACCESS_TOKEN` is missing, inform the user to add it once to `.env` so that all future database modifications run completely autonomously.
