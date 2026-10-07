import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const apk = process.argv[2] || 'android/app/build/outputs/apk/debug/app-debug.apk';
const extract = (name: string) => execFileSync('unzip', ['-p', apk, name], { maxBuffer: 32 * 1024 * 1024 });
const config = JSON.parse(extract('assets/capacitor.config.json').toString());
assert.ok(!config.server?.url, 'APK must use the local origin, not remote server.url');
assert.equal(config.webDir, 'dist');
assert.ok(extract('assets/public/index.html').length > 0);
let files = 0;
function verify(dir: string, prefix = '') {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    // Android aapt intentionally omits dot directories; the build manifest is
    // diagnostic metadata, not a runtime resource.
    if (item.name.startsWith('.')) continue;
    const relative = prefix + item.name;
    if (item.isDirectory()) verify(join(dir, item.name), relative + '/');
    else {
      assert.deepEqual(extract('assets/public/' + relative), readFileSync(join(dir, item.name)), `APK bundled file differs from current dist: ${relative}`);
      files++;
    }
  }
}
verify('dist');
console.log(`PASS APK local configuration and byte-for-byte dist resources: ${files} files (${apk})`);
