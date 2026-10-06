import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const dist = process.argv[2] || 'dist';
const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));
const measurements: unknown[] = [];
function measure(label: string, keys: string[]) {
  const visited = new Set<string>();
  const files = new Set<string>();
  function walk(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error('Missing manifest entry ' + key);
    files.add(chunk.file);
    for (const css of chunk.css || []) files.add(css);
    for (const dependency of chunk.imports || []) walk(dependency);
  }
  keys.forEach(walk);
  const resources = [...files].map(file => ({ file, bytes: statSync(join(dist, file)).size, gzipBytes: gzipSync(readFileSync(join(dist, file))).length }));
  measurements.push({ label, count: resources.length, bytes: resources.reduce((n, r) => n + r.bytes, 0), gzipBytes: resources.reduce((n, r) => n + r.gzipBytes, 0), resources });
}
measure('entry', ['index.html']);
measure('login (entry + auth + splash)', ['index.html', 'src/components/AuthScreen.tsx', 'src/components/SplashAnimation.tsx']);
const feedKey = 'src/components/Feed.tsx';
measure('authenticated feed (no poster/edit)', ['index.html', ...(manifest[feedKey] ? [feedKey] : []), 'src/components/SplashAnimation.tsx']);
console.log(JSON.stringify(measurements, null, 2));
