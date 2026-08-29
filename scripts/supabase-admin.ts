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

async function executeSqlViaManagementApi(sql: string): Promise<any> {
  if (!ACCESS_TOKEN) {
    throw new Error(
      '缺少 SUPABASE_ACCESS_TOKEN。请在 .env 中添加 SUPABASE_ACCESS_TOKEN=sbp_xxxx\n' +
      '（前往 https://supabase.com/dashboard/account/tokens 生成个人访问令牌）'
    );
  }

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
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
      } catch (err: any) {
        console.error('❌ 连接失败:', err.message);
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
