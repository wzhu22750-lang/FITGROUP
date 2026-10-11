import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/0009_security_hardening.sql'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/api.ts'), 'utf8');
const vite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
const capacitor = fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8');
const trainingTimeMigration = fs.readFileSync(path.join(root, 'supabase/migrations/0012_training_time_column_grant.sql'), 'utf8');
const initMigration = fs.readFileSync(path.join(root, 'supabase/migrations/0001_init.sql'), 'utf8');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`❌ FAILED: ${message}`);
  console.log(`✅ PASSED: ${message}`);
}

console.log('--- Testing security hardening contract ---');
assert(migration.includes("using (id = auth.uid())"), 'base profiles rows are owner-only');
assert(migration.includes('create view public.public_profiles'), 'public profile projection exists');
assert(migration.includes('can_view_workout_log'), 'social visibility helper exists');
assert(migration.includes('select * into v_team') && migration.includes('for update'), 'team join locks the team row');
assert(migration.includes('set created_by = v_successor_id'), 'team owner transfer is implemented');
assert(migration.includes('revoke execute on function public.join_team_by_code(text) from public, anon'), 'anonymous team RPC execution is revoked');
assert(migration.includes('revoke all on public.feedbacks from anon, public, authenticated'), 'feedback table privileges are reset');
assert(migration.includes('grant insert (id, type, content, contact) on public.feedbacks to authenticated'), 'feedback insert is column allow-listed');
assert(api.includes(".from('public_profiles')"), 'client uses the public profile projection');
assert(!api.includes('fetchAllWorkoutLogsLegacy'), 'visibility reads fail closed instead of using a full-table legacy fallback');
assert(!vite.includes('GEMINI_API_KEY'), 'GEMINI_API_KEY is not injected into the frontend bundle');
assert(capacitor.includes('https://app.du4s.com'), 'Android APK is configured with web remote shell for instant hot-update');

console.log('--- Testing training time column grants ---');
// workout_logs is protected by column-level grants, so any new writable column must be
// granted explicitly; otherwise writes fail with 42501 (shown as "RLS 权限错误").
assert(
  /grant insert \(created_at\), update \(created_at\) on public\.workout_logs to authenticated;/.test(trainingTimeMigration),
  'training time column is granted for insert and update',
);
assert(trainingTimeMigration.includes('workout_logs_guard_training_time'), 'database rejects future training times');
assert(initMigration.includes('revoke all on public.workout_logs from anon, authenticated, public'), 'workout_logs privileges stay deny-by-default');
assert(!/grant (select|insert|update|delete|all)[^;]*on public\.workout_logs to anon/.test(initMigration + trainingTimeMigration), 'anonymous callers never gain workout_logs access');

console.log('🎉 SECURITY HARDENING CONTRACT TESTS PASSED SUCCESSFULLY!');
