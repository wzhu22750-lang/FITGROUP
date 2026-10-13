import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supabase } from '../src/lib/supabase';
import { cleanupWorkoutPhotos, trackUploadedPhoto, forgetUploadedPhoto } from '../src/utils/workoutPhotos';

const ref = 'https://photos.test/storage/v1/object/public/workouts/owner/draft.jpg';
const queue = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (key: string) => queue.get(key) ?? null, setItem: (key: string, value: string) => queue.set(key, value) };
const original = { session: supabase.auth.getSession, storage: supabase.storage.from };
const setup = () => {
  queue.clear(); const removed: string[] = [];
  let calls = 0, release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  (supabase.auth as any).getSession = async () => { calls++; if (calls === 2) await gate; return { data: { session: { user: { id: 'owner' } } } }; };
  (supabase.storage as any).from = () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://photos.test/storage/v1/object/public/workouts/' } }), remove: async (paths: string[]) => { removed.push(...paths); return { data: paths.map(name => ({ name })), error: null }; } });
  trackUploadedPhoto('owner', ref, true);
  return { removed, release, waiting: async () => { while (calls < 2) await new Promise(resolve => setTimeout(resolve, 1)); } };
};

test('a joined cleanup call protects its restored draft before deletion starts', async () => {
  const f = setup();
  try {
    const pending = cleanupWorkoutPhotos('owner'); await f.waiting();
    const joined = cleanupWorkoutPhotos('owner', [ref]); f.release(); await Promise.all([pending, joined]);
    assert.deepEqual(f.removed, []);
  } finally { supabase.auth.getSession = original.session; supabase.storage.from = original.storage; }
});

test('retracked uploads are rechecked after asynchronous session verification', async () => {
  const f = setup();
  try {
    const pending = cleanupWorkoutPhotos('owner'); await f.waiting();
    trackUploadedPhoto('owner', ref); f.release(); await pending;
    assert.deepEqual(f.removed, []);
  } finally { supabase.auth.getSession = original.session; supabase.storage.from = original.storage; }
});

test('photos removed from the cleanup queue while waiting are not deleted', async () => {
  const f = setup();
  try {
    const pending = cleanupWorkoutPhotos('owner'); await f.waiting();
    forgetUploadedPhoto('owner', ref); f.release(); await pending;
    assert.deepEqual(f.removed, []);
  } finally { supabase.auth.getSession = original.session; supabase.storage.from = original.storage; }
});

test('RLS-filtered empty deletion keeps the orphan queue available for later recovery', async () => {
  const f = setup();
  (supabase.storage as any).from = () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://photos.test/storage/v1/object/public/workouts/' } }), remove: async () => ({ data: [], error: null }) });
  try {
    const pending = cleanupWorkoutPhotos('owner'); await f.waiting(); f.release(); await pending;
    assert.equal(JSON.parse(queue.get('fitgroup:photo-cleanup:v1:owner')!)[0].reference, ref);
  } finally { supabase.auth.getSession = original.session; supabase.storage.from = original.storage; }
});
