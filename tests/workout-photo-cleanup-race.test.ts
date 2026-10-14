import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supabase } from '../src/lib/supabase';
import { cleanupWorkoutPhotos, trackUploadedPhoto, forgetUploadedPhoto } from '../src/utils/workoutPhotos';
import { createDraft, createDraftExercise, draftStorageKey } from '../src/utils/workoutDraft';

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

test('independent cleanup calls preserve a persisted draft after the original flight ended', async () => {
  const f = setup(); f.release();
  try {
    queue.set(draftStorageKey('owner'), JSON.stringify({ ...createDraft('owner'), photoUrl: ref }));
    await cleanupWorkoutPhotos('owner', [ref]);
    await cleanupWorkoutPhotos('owner');
    assert.deepEqual(f.removed, [], 'Another entry point cannot delete the unfinished draft');
    queue.delete(draftStorageKey('owner'));
    await cleanupWorkoutPhotos('owner');
    assert.deepEqual(f.removed, ['owner/draft.jpg'], 'Discarded drafts release eligible photos');
  } finally { supabase.auth.getSession = original.session; supabase.storage.from = original.storage; }
});

test('uncertain submissions remain protected when the logger is not mounted', async () => {
  const f = setup(); f.release();
  try {
    const exercise = { ...createDraftExercise({ name: '卧推', type: 'strength' }), weight: '60' };
    queue.set(draftStorageKey('owner'), JSON.stringify({ ...createDraft('owner'), photoUrl: ref, exercises: [exercise], pending: true }));
    await cleanupWorkoutPhotos('owner'); assert.deepEqual(f.removed, []);
  } finally { supabase.auth.getSession = original.session; supabase.storage.from = original.storage; }
});

test('unreadable draft storage defers cleanup instead of assuming no draft exists', async () => {
  const f = setup(); f.release();
  const storage = (globalThis as any).localStorage;
  try {
    (globalThis as any).localStorage = { ...storage, getItem: (key: string) => { if (key === draftStorageKey('owner')) throw new Error('storage denied'); return storage.getItem(key); } };
    await cleanupWorkoutPhotos('owner'); assert.deepEqual(f.removed, []);
  } finally { (globalThis as any).localStorage = storage; supabase.auth.getSession = original.session; supabase.storage.from = original.storage; }
});
