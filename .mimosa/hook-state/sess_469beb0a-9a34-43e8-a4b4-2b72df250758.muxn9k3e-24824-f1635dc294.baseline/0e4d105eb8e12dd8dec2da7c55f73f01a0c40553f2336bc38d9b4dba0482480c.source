import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('--- Testing APK Local Startup & Build Guards Contract ---');

const root = process.cwd();

// 1. Verify build guard: missing environment variables must fail vite build
console.log('\n[1] Verifying build guard fails on missing environment variables...');
try {
  execSync('npx vite build', {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  });
  assert(false, 'vite build should have failed when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing');
} catch (err: any) {
  const stderr = err.stderr ? err.stderr.toString() : err.message;
  const stdout = err.stdout ? err.stdout.toString() : '';
  const combined = stdout + '\n' + stderr;
  assert(
    combined.includes('[FATAL BUILD GUARD]') || combined.includes('Production build aborted'),
    'vite build aborted with fatal build guard message'
  );
}

// 1b. Verify build guard cannot be bypassed with SKIP_ENV_GUARD
console.log('\n[1b] Verifying SKIP_ENV_GUARD bypass is eliminated...');
try {
  execSync('npx vite build', {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      SKIP_ENV_GUARD: 'true',
    },
  });
  assert(false, 'vite build should have failed even if SKIP_ENV_GUARD=true was set');
} catch (err: any) {
  const stderr = err.stderr ? err.stderr.toString() : err.message;
  const stdout = err.stdout ? err.stdout.toString() : '';
  const combined = stdout + '\n' + stderr;
  assert(
    combined.includes('[FATAL BUILD GUARD]') || combined.includes('Production build aborted'),
    'vite build strictly rejects missing env variables even with SKIP_ENV_GUARD=true'
  );
}

// 2. Verify capacitor.config.ts local startup by default
console.log('\n[2] Verifying default local startup in capacitor.config.ts...');
const defaultCapOut = execSync(
  `node -e 'const c = require("./capacitor.config.ts").default; console.log(JSON.stringify(c.server || null));'`,
  { cwd: root, env: { ...process.env, CAP_DEV_REMOTE: '', CAP_REMOTE: '', CAP_DEV: '', NODE_ENV: 'development' } }
)
  .toString()
  .trim();
assert(defaultCapOut === 'null', 'Default capacitor config has no server configuration (local bundle startup)');

const capConfigContent = fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8');
assert(
  capConfigContent.includes('https://app.du4s.com'),
  'capacitor.config.ts references https://app.du4s.com for dev remote mode'
);

// 3. Verify dev remote requires explicit CAP_DEV_REMOTE flag
console.log('\n[3] Verifying dev remote requires explicit CAP_DEV_REMOTE flag...');
const devRemoteCapOut = execSync(
  `node -e 'const c = require("./capacitor.config.ts").default; console.log(JSON.stringify(c.server || null));'`,
  { cwd: root, env: { ...process.env, CAP_DEV_REMOTE: 'true', NODE_ENV: 'development' } }
)
  .toString()
  .trim();
assert(
  devRemoteCapOut.includes('https://app.du4s.com'),
  'CAP_DEV_REMOTE=true activates dev remote server configuration'
);

// Verify legacy flags without CAP_DEV_REMOTE do NOT activate remote
const legacyRemoteCapOut = execSync(
  `node -e 'const c = require("./capacitor.config.ts").default; console.log(JSON.stringify(c.server || null));'`,
  { cwd: root, env: { ...process.env, CAP_REMOTE: 'true', CAP_DEV_REMOTE: '', NODE_ENV: 'development' } }
)
  .toString()
  .trim();
assert(
  legacyRemoteCapOut === 'null',
  'Legacy CAP_REMOTE=true without CAP_DEV_REMOTE does not activate remote'
);

const legacyDevCapOut = execSync(
  `node -e 'const c = require("./capacitor.config.ts").default; console.log(JSON.stringify(c.server || null));'`,
  { cwd: root, env: { ...process.env, CAP_DEV: 'true', CAP_DEV_REMOTE: '', NODE_ENV: 'development' } }
)
  .toString()
  .trim();
assert(
  legacyDevCapOut === 'null',
  'Legacy CAP_DEV=true without CAP_DEV_REMOTE does not activate remote'
);

// 4. Verify production guard fails when remote is configured (no silent removal, no bypass)
console.log('\n[4] Verifying production guard strictly fails when remote is requested in production...');
try {
  execSync(
    `node -e 'const c = require("./capacitor.config.ts").default; console.log(JSON.stringify(c.server || null));'`,
    { cwd: root, env: { ...process.env, CAP_DEV_REMOTE: 'true', NODE_ENV: 'production' }, stdio: 'pipe' }
  );
  assert(false, 'Loading capacitor.config.ts in production with CAP_DEV_REMOTE=true must throw fatal error');
} catch (err: any) {
  const msg = (err.stderr ? err.stderr.toString() : '') + (err.stdout ? err.stdout.toString() : '');
  assert(
    msg.includes('FATAL PRODUCTION GUARD') || msg.includes('strictly prohibited in production'),
    'Production build strictly fails when CAP_DEV_REMOTE=true is set'
  );
}

// Ensure CAP_ALLOW_REMOTE_PROD bypass is eliminated: must FAIL, not bypass
try {
  execSync(
    `node -e 'const c = require("./capacitor.config.ts").default; console.log(JSON.stringify(c.server || null));'`,
    {
      cwd: root,
      env: { ...process.env, CAP_DEV_REMOTE: 'true', NODE_ENV: 'production', CAP_ALLOW_REMOTE_PROD: 'true' },
      stdio: 'pipe',
    }
  );
  assert(false, 'CAP_ALLOW_REMOTE_PROD must NOT bypass the production guard');
} catch (err: any) {
  const msg = (err.stderr ? err.stderr.toString() : '') + (err.stdout ? err.stdout.toString() : '');
  assert(
    msg.includes('FATAL PRODUCTION GUARD') || msg.includes('strictly prohibited in production'),
    'CAP_ALLOW_REMOTE_PROD bypass is rejected in production'
  );
}

// In production without remote flag, loading capacitor.config.ts succeeds with local bundle
const prodCleanCapOut = execSync(
  `node -e 'const c = require("./capacitor.config.ts").default; console.log(JSON.stringify(c.server || null));'`,
  { cwd: root, env: { ...process.env, CAP_DEV_REMOTE: '', CAP_REMOTE: '', CAP_DEV: '', NODE_ENV: 'production' } }
)
  .toString()
  .trim();
assert(
  prodCleanCapOut === 'null',
  'Clean production build has no server configuration (pure local bundle)'
);

// 5. Verify APK resources and generated Android assets
console.log('\n[5] Verifying APK resources and generated Android assets...');
const androidAssetsDir = path.join(root, 'android/app/src/main/assets');
const androidConfigPath = path.join(androidAssetsDir, 'capacitor.config.json');
const androidIndexPath = path.join(androidAssetsDir, 'public/index.html');
const androidPublicAssetsDir = path.join(androidAssetsDir, 'public/assets');

assert(fs.existsSync(androidConfigPath), 'android/app/src/main/assets/capacitor.config.json exists');
const androidConfigJson = JSON.parse(fs.readFileSync(androidConfigPath, 'utf8'));
assert(!androidConfigJson.server, 'android/app/src/main/assets/capacitor.config.json has no server.url (local bundle startup)');

assert(fs.existsSync(androidIndexPath), 'android/app/src/main/assets/public/index.html exists');
assert(fs.existsSync(androidPublicAssetsDir), 'android/app/src/main/assets/public/assets directory exists');
const assetFiles = fs.readdirSync(androidPublicAssetsDir);
assert(assetFiles.length > 0, `android/app/src/main/assets/public/assets contains bundled assets (${assetFiles.length} files)`);

// Verify all files referenced in index.html actually exist
const indexHtmlContent = fs.readFileSync(androidIndexPath, 'utf8');
const assetMatches = [...indexHtmlContent.matchAll(/(?:src|href)=["']([^"']+)["']/g)];
const referencedFiles = assetMatches
  .map((m) => m[1])
  .filter((r) => r && !r.startsWith('http://') && !r.startsWith('https://') && !r.startsWith('//') && !r.startsWith('data:') && !r.startsWith('#'))
  .map((r) => r.startsWith('/') ? r.slice(1) : r)
  .map((r) => r.split(/[?#]/)[0]);

assert(referencedFiles.length > 0, 'index.html contains local asset references');
for (const relPath of referencedFiles) {
  const fullPath = path.join(androidAssetsDir, 'public', relPath);
  assert(fs.existsSync(fullPath), `Referenced asset file exists: ${relPath}`);
}

// 6. Verify Gradle production packaging guards
console.log('\n[6] Verifying Gradle production packaging guards...');
const androidDir = path.join(root, 'android');

// 6a. Valid state must pass checkApkResources and checkReleaseGuardRelease
execSync('./gradlew checkReleaseGuardRelease', { cwd: androidDir, stdio: 'pipe' });
assert(true, 'Gradle checkReleaseGuardRelease passes on valid local bundle');

// 6b. Config required: missing capacitor.config.json must fail release guard
const configBackup = fs.readFileSync(androidConfigPath, 'utf8');
try {
  fs.unlinkSync(androidConfigPath);
  try {
    execSync('./gradlew checkReleaseGuardRelease', { cwd: androidDir, stdio: 'pipe' });
    assert(false, 'Gradle release build should fail when capacitor.config.json is missing');
  } catch (err: any) {
    const errOut = (err.stdout ? err.stdout.toString() : '') + '\n' + (err.stderr ? err.stderr.toString() : '');
    assert(
      errOut.includes('Required capacitor config missing') || errOut.includes('capacitor.config.json'),
      'Gradle release guard rejected missing capacitor.config.json'
    );
  }
} finally {
  fs.writeFileSync(androidConfigPath, configBackup, 'utf8');
}

// 6c. Parsed config server.url absent: remote URL in config must fail release guard
try {
  fs.writeFileSync(
    androidConfigPath,
    JSON.stringify({ appId: 'com.fitgroup.app', server: { url: 'https://leak.example.com' } }),
    'utf8'
  );
  try {
    execSync('./gradlew checkReleaseGuardRelease', { cwd: androidDir, stdio: 'pipe' });
    assert(false, 'Gradle release build should fail when server.url is present');
  } catch (err: any) {
    const errOut = (err.stdout ? err.stdout.toString() : '') + '\n' + (err.stderr ? err.stderr.toString() : '');
    assert(
      errOut.includes('Release APK must not contain remote server.url') || errOut.includes('server.url'),
      'Gradle release guard rejected parsed remote server.url'
    );
  }
} finally {
  fs.writeFileSync(androidConfigPath, configBackup, 'utf8');
}

// 6d. Referenced assets present: missing referenced asset must fail release guard
const indexHtmlBackup = fs.readFileSync(androidIndexPath, 'utf8');
try {
  fs.writeFileSync(
    androidIndexPath,
    indexHtmlBackup.replace(/assets\/index-[^"']+\.js/, 'assets/missing-chunk-unbundled.js'),
    'utf8'
  );
  try {
    execSync('./gradlew checkReleaseGuardRelease', { cwd: androidDir, stdio: 'pipe' });
    assert(false, 'Gradle release build should fail when a referenced asset file is missing');
  } catch (err: any) {
    const errOut = (err.stdout ? err.stdout.toString() : '') + '\n' + (err.stderr ? err.stderr.toString() : '');
    assert(
      errOut.includes('Referenced asset file missing') || errOut.includes('missing-chunk-unbundled.js'),
      'Gradle release guard rejected missing referenced asset file'
    );
  }
} finally {
  fs.writeFileSync(androidIndexPath, indexHtmlBackup, 'utf8');
}

// 7. Verify version consistency
console.log('\n[7] Verifying version consistency in Android and package.json...');
const buildGradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert(buildGradle.includes('versionCode 3'), 'android/app/build.gradle has incremented versionCode 3');
assert(buildGradle.includes('versionName "1.0.2"'), 'android/app/build.gradle has updated versionName 1.0.2');
assert(packageJson.version === '1.0.2', 'package.json version matches 1.0.2');

console.log('\n🎉 ALL APK STARTUP & BUILD GUARD CHECKS PASSED SUCCESSFULLY!');
