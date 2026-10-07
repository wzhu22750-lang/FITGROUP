/**
 * Supabase Database Automation & Management Tool
 * Allows executing SQL migrations, applying schema changes, and inspecting tables.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env / .env.local
dotenv.config();
dotenv.config({ path: '.env.local' });

function getProjectRef(): string {
  if (process.env.SUPABASE_PROJECT_REF) {
    return process.env.SUPABASE_PROJECT_REF.trim();
  }
  const url = process.env.VITE_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (match && match[1]) {
    return match[1];
  }
  return 'cuqszaigzxvxughamwzt';
}

const PROJECT_REF = getProjectRef();
const ACCESS_TOKEN = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();

const WORKOUT_LOG_SCHEMA_CHECK_SQL = `
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_logs' and column_name = 'visibility'
  ) as has_visibility_column,
  coalesce(
    pg_get_functiondef(to_regprocedure('public.is_valid_exercise(jsonb)')) like '%caloriesSource%',
    false
  ) as supports_calories_source,
  coalesce(
    pg_get_functiondef(to_regprocedure('public.is_valid_exercise(jsonb)')) like '%between -500 and 2000%',
    false
  ) as supports_negative_weight,
  exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'workout_logs'
      and c.conname = 'workout_logs_exercises_check'
      and pg_get_constraintdef(c.oid) like '%is_valid_exercises%'
  ) as has_exercises_check,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_logs'
      and policyname = 'workout_logs_update'
      and cmd = 'UPDATE'
      and qual like '%user_id = auth.uid()%'
      and with_check like '%user_id = auth.uid()%'
  ) as has_owner_update_policy,
  has_column_privilege('authenticated', 'public.workout_logs', 'exercises', 'UPDATE') as exercises_update_grant,
  has_column_privilege('authenticated', 'public.workout_logs', 'visibility', 'UPDATE') as visibility_update_grant,
  to_regclass('supabase_migrations.schema_migrations') is not null as has_migration_history,
  to_regclass('public.public_profiles') is not null as has_public_profiles_view,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select'
      and qual like '%id = auth.uid()%'
  ) as profiles_owner_only,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_likes'
      and policyname = 'workout_likes_select'
      and qual like '%can_view_workout_log%'
  ) as likes_follow_visibility,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_comments'
      and policyname = 'workout_comments_select'
      and qual like '%can_view_workout_log%'
  ) as comments_follow_visibility,
  not has_table_privilege('anon', 'public.feedbacks', 'INSERT') as anon_feedback_insert_revoked,
  not has_table_privilege('authenticated', 'public.teams', 'INSERT') as direct_team_insert_revoked,
  not has_table_privilege('authenticated', 'public.team_members', 'INSERT') as direct_member_insert_revoked,
  not has_function_privilege('anon', 'public.join_team_by_code(text)', 'EXECUTE') as anon_team_rpc_revoked;
`;

async function executeSqlViaManagementApi(sql: string): Promise<any> {
  if (!ACCESS_TOKEN) {
    throw new Error(
      '缺少 SUPABASE_ACCESS_TOKEN。请在 .env 中添加 SUPABASE_ACCESS_TOKEN=sbp_xxxx\n' +
      '（前往 https://supabase.com/dashboard/account/tokens 生成个人访问令牌）'
    );
  }

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase Management API 错误 (${response.status}): ${text}`);
      }

      const result = await response.json().catch(() => null);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Supabase Management API 请求失败');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Supabase Admin CLI - 数据库自动化执行工具

用法:
  npx tsx scripts/supabase-admin.ts --sql "SQL语句"
  npx tsx scripts/supabase-admin.ts --file <path-to-sql-file>
  npx tsx scripts/supabase-admin.ts --apply-all
  npx tsx scripts/supabase-admin.ts --check

环境变量:
  SUPABASE_ACCESS_TOKEN    Supabase 个人访问令牌 (必需，在 https://supabase.com/dashboard/account/tokens 获取)
  VITE_SUPABASE_URL        Supabase 项目地址 (当前 Project Ref: ${PROJECT_REF})
`);
    return;
  }

  if (args.includes('--check')) {
    console.log(`Project Ref: ${PROJECT_REF}`);
    console.log(`Access Token: ${ACCESS_TOKEN ? '已配置 (***' + ACCESS_TOKEN.slice(-4) + ')' : '未配置 (需在 .env 中设置 SUPABASE_ACCESS_TOKEN)'}`);
    if (ACCESS_TOKEN) {
      try {
        const res = await executeSqlViaManagementApi('SELECT version();');
        console.log('✅ Supabase 数据库连接与权限验证成功！');
        console.log('数据库版本:', res);
        const schemaResult = await executeSqlViaManagementApi(WORKOUT_LOG_SCHEMA_CHECK_SQL);
        const schema = schemaResult?.[0] || {};
        const requiredChecks = [
          'has_visibility_column',
          'supports_calories_source',
          'supports_negative_weight',
          'has_exercises_check',
          'has_owner_update_policy',
          'exercises_update_grant',
          'visibility_update_grant',
          'has_public_profiles_view',
          'profiles_owner_only',
          'likes_follow_visibility',
          'comments_follow_visibility',
          'anon_feedback_insert_revoked',
          'direct_team_insert_revoked',
          'direct_member_insert_revoked',
          'anon_team_rpc_revoked',
        ];
        const schemaOk = requiredChecks.every((key) => schema[key] === true);
        console.log(`Workout log schema: ${schemaOk ? '✅ 已满足当前 main 合约' : '❌ 与当前 main 合约不一致'}`);
        console.log('Workout log schema details:', schema);
        if (schema.has_migration_history !== true) {
          console.warn('⚠️ 未发现 Supabase CLI migration history；不要使用无历史记录的 --apply-all 作为生产同步方案，请用 supabase db push / migration list 核对后再执行。');
        }
        if (!schemaOk) process.exitCode = 2;
      } catch (err: any) {
        console.error('❌ 连接或 schema 校验失败:', err.message);
        process.exitCode = 1;
      }
    }
    return;
  }

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = path.resolve(args[fileIdx + 1]);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 文件不存在: ${filePath}`);
      process.exit(1);
    }
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`🚀 正在执行 SQL 文件: ${filePath}...`);
    try {
      const res = await executeSqlViaManagementApi(sql);
      console.log('✅ 执行成功！');
      if (res && res.length > 0) {
        console.log(res);
      }
    } catch (err: any) {
      console.error('❌ 执行失败:', err.message);
      process.exit(1);
    }
    return;
  }

  const sqlIdx = args.indexOf('--sql');
  if (sqlIdx !== -1 && args[sqlIdx + 1]) {
    const sql = args[sqlIdx + 1];
    console.log(`🚀 正在执行 SQL: ${sql}...`);
    try {
      const res = await executeSqlViaManagementApi(sql);
      console.log('✅ 执行成功！');
      if (res) console.log(res);
    } catch (err: any) {
      console.error('❌ 执行失败:', err.message);
      process.exit(1);
    }
    return;
  }

  if (args.includes('--apply-all')) {
    const migrationsDir = path.resolve('supabase/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error(`❌ 迁移目录不存在: ${migrationsDir}`);
      process.exit(1);
    }
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    console.log(`Found ${files.length} migration files: ${files.join(', ')}`);

    for (const f of files) {
      const fullPath = path.join(migrationsDir, f);
      console.log(`\n⏳ Applying ${f}...`);
      const sql = fs.readFileSync(fullPath, 'utf-8');
      try {
        await executeSqlViaManagementApi(sql);
        console.log(`✅ Applied ${f}`);
      } catch (err: any) {
        console.error(`❌ Failed on ${f}:`, err.message);
        process.exit(1);
      }
    }
    console.log('\n🎉 所有迁移执行完成！');
    return;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
