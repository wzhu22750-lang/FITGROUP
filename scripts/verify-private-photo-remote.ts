/** Opt-in live check: temporary users, private log and tiny PNG; exact-resource cleanup. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true }); dotenv.config({ path: '.env.local', quiet: true });
if (!process.argv.includes('--run')) throw new Error('Run explicitly with --run; this creates and cleans temporary remote fixtures.');
const url = process.env.VITE_SUPABASE_URL!;
const token = process.env.SUPABASE_ACCESS_TOKEN!;
assert.ok(url && token, 'Configured project and management credential are required');
const ref = new URL(url).hostname.split('.')[0];
const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(15000)]) });
const keyResponse = await boundedFetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } });
assert.ok(keyResponse.ok, `Project key access failed (${keyResponse.status})`);
const keys = await keyResponse.json() as Array<{ name: string; type: string; api_key: string }>;
const privileged = keys.find(key => key.name === 'service_role') ?? keys.find(key => key.type === 'secret');
const publicKey = process.env.VITE_SUPABASE_ANON_KEY ?? keys.find(key => key.name === 'anon' || key.type === 'publishable')?.api_key;
assert.ok(privileged?.api_key && publicKey, 'Required project keys are unavailable');
const client = (key: string) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } });
const admin = client(privileged.api_key);
const users: string[] = [], objects: string[] = [], clients: ReturnType<typeof client>[] = [];
const logId = randomUUID();
const report = { timestamp: new Date().toISOString(), checks: [] as string[], cleanup: { logs: false, objects: false, users: false, profiles: false }, deletionEvidence: null as Record<string, unknown> | null, scope: 'Actual HTTP/Auth/Storage + private saved-log RLS; no public feed fixture or browser/device test' };
const passed = (label: string, value: boolean) => { assert.ok(value, label); report.checks.push(label); console.log('PASS ' + label); };
let failure = '';
async function cleanup(action: () => Promise<void>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await action(); return; } catch { if (attempt === 1) throw new Error('Remote fixture cleanup failed'); }
  }
}
try {
  const bucket = await admin.storage.getBucket('workouts');
  passed('Workouts bucket is private', !bucket.error && bucket.data?.public === false);
  for (let i = 0; i < 2; i++) {
    const email = `fitgroup-photo-fixture-${randomUUID()}@example.invalid`, password = randomUUID() + randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Private photo fixture' } });
    if (created.data.user) users.push(created.data.user.id);
    assert.ok(!created.error && created.data.user, 'Temporary account creation failed');
    const actor = client(publicKey); clients.push(actor);
    const signed = await actor.auth.signInWithPassword({ email, password });
    assert.ok(!signed.error && signed.data.user?.id === created.data.user.id, 'Temporary account login failed');
  }
  const [owner, peer] = clients;
  const path = `${users[0]}/fixture-${randomUUID()}.png`; objects.push(path);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=', 'base64');
  const file = new Blob([png], { type: 'image/png' });
  const uploaded = await owner.storage.from('workouts').upload(path, file, { upsert: false });
  passed('Owner uploads a real private PNG', !uploaded.error && uploaded.data?.path === path);
  const reference = owner.storage.from('workouts').getPublicUrl(path).data.publicUrl;
  const saved = await owner.from('workout_logs').insert({ id: logId, user_id: users[0], user_name: 'Private photo fixture', category: 'Chest', exercises: [{ id: 'fixture-ex', name: '卧推', type: 'strength', weight: 1, sets: 1, reps: 1 }], note: 'temporary private photo verification', photo_url: reference, visibility: 'private' });
  passed('Owner saves the private workout reference', !saved.error);
  const ownRead = await owner.storage.from('workouts').download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' });
  passed('Owner retrieves the original bytes', !ownRead.error && !!ownRead.data && Buffer.from(await ownRead.data.arrayBuffer()).equals(png));
  const peerRead = await peer.storage.from('workouts').download(path);
  passed('Other authenticated account cannot download', !!peerRead.error && !peerRead.data);
  const peerLog = await peer.from('workout_logs').select('id').eq('id', logId);
  passed('Other account cannot read the private log', !peerLog.error && peerLog.data?.length === 0);
  const anonymous = client(publicKey);
  const anonymousRead = await anonymous.storage.from('workouts').download(path);
  passed('Anonymous API cannot download', !!anonymousRead.error && !anonymousRead.data);
  const publicRead = await boundedFetch(reference);
  passed('Legacy public URL cannot retrieve private bytes', !publicRead.ok);
  await publicRead.body?.cancel();
  await owner.storage.from('workouts').remove([path]);
  const kept = await owner.storage.from('workouts').download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' });
  passed('Owner cleanup cannot delete a saved workout photo', !kept.error && kept.data?.size === png.length);
  const overwritten = await owner.storage.from('workouts').upload(path, new Blob(['replacement'], { type: 'image/png' }), { upsert: true });
  const preserved = await owner.storage.from('workouts').download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' });
  passed('Saved photo cannot be overwritten', !!overwritten.error && !preserved.error && !!preserved.data && Buffer.from(await preserved.data.arrayBuffer()).equals(png));
  // Warm the legacy fixed URL solely to compare caching after deletion.
  await owner.storage.from('workouts').download(path);
  await peer.storage.from('workouts').remove([path]);
  const stillKept = await owner.storage.from('workouts').download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' });
  passed('Another account cannot delete the owner photo', !stillKept.error && stillKept.data?.size === png.length);
  const removedLog = await owner.from('workout_logs').delete().eq('id', logId).select('id');
  passed('Owner can delete the private fixture log', !removedLog.error && removedLog.data?.some(row => row.id === logId) === true);
  const removedPhoto = await owner.storage.from('workouts').remove([path]);
  const gone = await owner.storage.from('workouts').download(path, {}, { cache: 'no-store' });
  const fresh = await owner.storage.from('workouts').download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' });
  const repeated = await owner.storage.from('workouts').download(path, {}, { cache: 'no-store' });
  report.deletionEvidence = { removedLogCount: removedLog.data?.length, removedObjectCount: removedPhoto.data?.length, returnedPathMatches: removedPhoto.data?.some(object => object.name === path), fixedUrlBytes: gone.data?.size ?? null, freshError: fresh.error?.name ?? null, freshBytes: fresh.data?.size ?? null, repeatedFixedUrlBytes: repeated.data?.size ?? null };
  passed('Abandoned file becomes removable after its log is removed', !removedPhoto.error && removedPhoto.data?.some(object => object.name === path) === true && !!fresh.error && !fresh.data);
} catch (error) {
  failure = error instanceof Error ? error.message : 'Remote private-photo check failed';
} finally {
  try {
    if (users.length) await cleanup(async () => { const result = await admin.from('workout_logs').delete().eq('id', logId).in('user_id', users); assert.ok(!result.error); });
    const remaining = await admin.from('workout_logs').select('id').eq('id', logId);
    report.cleanup.logs = !remaining.error && remaining.data?.length === 0;
  } catch { /* Report cleanup explicitly below. */ }
  try {
    if (objects.length) await cleanup(async () => { const result = await admin.storage.from('workouts').remove(objects); assert.ok(!result.error); });
    const lists = await Promise.all(users.map(uid => admin.storage.from('workouts').list(uid)));
    report.cleanup.objects = lists.every(result => !result.error && result.data?.length === 0);
  } catch { /* Exact object paths remain available in the recovery output. */ }
  await Promise.allSettled(clients.map(actor => actor.auth.signOut()));
  try {
    for (const uid of users) await cleanup(async () => { const result = await admin.auth.admin.deleteUser(uid); assert.ok(!result.error); });
    const remaining = await Promise.all(users.map(uid => admin.auth.admin.getUserById(uid)));
    report.cleanup.users = remaining.every(result => !result.data.user && result.error?.status === 404);
    if (users.length) {
      const profiles = await admin.from('profiles').select('id').in('id', users);
      report.cleanup.profiles = !profiles.error && profiles.data?.length === 0;
    } else report.cleanup.profiles = true;
  } catch { /* No broad user deletion is used. */ }
  writeFileSync('2026-10-14_真实私有照片验证.json', JSON.stringify({ ...report, ...(failure ? { failure } : {}), ...(!Object.values(report.cleanup).every(Boolean) ? { recovery: { userIds: users, objectPaths: objects, logId } } : {}) }, null, 2) + '\n');
}
assert.ok(Object.values(report.cleanup).every(Boolean), 'Remote fixture cleanup incomplete; see recovery metadata in the report');
if (failure) throw new Error(failure);
console.log('PASS exact cleanup: no fixture logs, files or users remain');
