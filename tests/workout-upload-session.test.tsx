import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { supabase } from '../src/lib/supabase';
import { createDraft, createDraftExercise, draftStorageKey } from '../src/utils/workoutDraft';

// CSS is handled by Vite in the product; this fixture exercises form lifecycle.
const css = registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
(globalThis as any).window = Object.assign(new EventTarget(), { localStorage, innerHeight: 844 });
(globalThis as any).document = { body: { style: { overflow: '' } }, activeElement: null, getElementById: () => null };
(globalThis as any).HTMLElement = class {};
(globalThis as any).requestAnimationFrame = (callback: () => void) => { callback(); return 0; };
let unexpectedRequests = 0;
globalThis.fetch = async () => { unexpectedRequests++; throw new Error('Unexpected network in upload session fixture'); };
let uid = 'owner';
const auth = new Set<(event: string, session: any) => void>();
(supabase.auth as any).getSession = async () => ({ data: { session: { user: { id: uid } } }, error: null });
(supabase.auth as any).getUser = async () => ({ data: { user: { id: uid } }, error: null });
(supabase.auth as any).onAuthStateChange = (callback: any) => { auth.add(callback); return { data: { subscription: { unsubscribe: () => auth.delete(callback) } } }; };
(supabase as any).rpc = (name: string) => { assert.equal(name, 'get_my_profile'); return { abortSignal: async () => ({ data: { id: uid, display_name: 'Fixture', total_workouts: 0, prs: {} }, error: null }) }; };
(supabase as any).from = (table: string) => {
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, single: () => q, maybeSingle: () => q, abortSignal: () => q,
    then: (resolve: any, reject: any) => Promise.resolve({ data: table === 'profiles' ? { id: uid, display_name: 'Fixture', total_workouts: 0, prs: {} } : [], error: null }).then(resolve, reject) };
  return q;
};
const api = await import('../src/api');
const stopAuth = api.onAuthStateChangedFn(() => {});
const { WorkoutSession } = await import('../src/components/WorkoutLogger');
css.deregister();
const signIn = (owner: string) => { uid = owner; auth.forEach(callback => callback('SIGNED_IN', { user: { id: owner } })); };
const readDraft = () => JSON.parse(storage.get(draftStorageKey('owner'))!);

async function setup() {
  storage.clear(); signIn('owner');
  const exercise = { ...createDraftExercise({ name: '卧推', type: 'strength' }), weight: '60' };
  storage.set(draftStorageKey('owner'), JSON.stringify({ ...createDraft('owner'), exercises: [exercise], note: 'before' }));
  let tree!: ReactTestRenderer, pending!: Promise<void>, path = '', calls = 0, successes = 0;
  let complete: (value: any) => void = () => {};
  const gate = new Promise(resolve => { complete = resolve; });
  const removed: string[] = [];
  (supabase.storage as any).from = () => ({
    getPublicUrl: (name: string) => ({ data: { publicUrl: `https://photos.test/storage/v1/object/public/workouts/${name}` } }),
    upload: async (name: string) => { calls++; path = name; return gate; },
    remove: async (names: string[]) => { removed.push(...names); return { data: names.map(name => ({ name })), error: null }; },
    download: async () => ({ data: new Blob(['photo']), error: null }),
  });
  const mount = async () => { await act(async () => { tree = create(<WorkoutSession owner="owner" onSuccess={() => successes++} />, { createNodeMock: element => element.type === 'dialog' ? { showModal() {}, close() {}, style: { setProperty() {} } } : null }); await new Promise(resolve => setTimeout(resolve, 5)); }); };
  await mount();
  const startUpload = async () => { await act(async () => { pending = tree.root.findAllByType('input').find(node => node.props.type === 'file')!.props.onChange({ target: { files: [new Blob(['photo'], { type: 'image/jpeg' })] } }); await new Promise(resolve => setTimeout(resolve, 1)); }); };
  const finishUpload = async () => { await act(async () => { complete({ data: { path }, error: null }); await pending; await new Promise(resolve => setTimeout(resolve, 1)); }); };
  return { tree: () => tree, mount, startUpload, finishUpload, removed, calls: () => calls, successes: () => successes, path: () => path, close: async () => { await act(async () => tree.unmount()); } };
}

test('actual form disables submission while a photo upload is pending', async () => {
  const f = await setup();
  try { await f.startUpload(); assert.equal(f.tree().root.findAllByType('button').find(node => node.props.type === 'submit')!.props.disabled, true); }
  finally { await f.close(); await f.finishUpload(); }
});

test('upload completion after remount cannot overwrite the new draft', async () => {
  const f = await setup();
  try {
    await f.startUpload(); await f.close();
    const fresh = { ...createDraft('owner'), note: 'new session' };
    storage.set(draftStorageKey('owner'), JSON.stringify(fresh)); await f.mount();
    await f.finishUpload();
    assert.equal(readDraft().id, fresh.id); assert.equal(readDraft().note, 'new session'); assert.equal(readDraft().photoUrl, '');
    const orphan = JSON.parse(storage.get('fitgroup:photo-cleanup:v1:owner') || '[]').find((item: any) => item.reference.endsWith(f.path()));
    assert.ok(f.removed.includes(f.path()) || orphan?.after <= Date.now(), 'Late uploads are either removed or immediately eligible for cleanup');
  } finally { await f.close(); }
});

test('clearing a draft during upload prevents the old photo from attaching to the cleared draft', async () => {
  const f = await setup();
  try {
    await f.startUpload();
    await act(async () => { f.tree().root.findAllByType('button').find(node => node.children.includes('清空'))!.props.onClick(); });
    await act(async () => { f.tree().root.findAllByType('button').find(node => node.children.includes('确认清空'))!.props.onClick(); });
    await f.finishUpload(); assert.equal(readDraft().photoUrl, ''); assert.equal(readDraft().exercises.length, 0);
  } finally { await f.close(); }
});

test('upload completion after a user switch cannot attach a previous account photo', async () => {
  const f = await setup();
  try {
    await f.startUpload(); const before = storage.get(draftStorageKey('owner')); signIn('other'); await f.finishUpload();
    assert.equal(storage.get(draftStorageKey('owner')), before);
    assert.equal(storage.has(draftStorageKey('other')), false);
  } finally { await f.close(); }
});

test('normal upload attaches exactly one photo and keeps the draft usable', async () => {
  const f = await setup();
  try {
    await f.startUpload(); await f.finishUpload(); assert.equal(f.calls(), 1);
    assert.equal(readDraft().photoUrl, `https://photos.test/storage/v1/object/public/workouts/${f.path()}`);
    assert.equal(readDraft().pending, false);
    assert.equal(f.tree().root.findAllByType('button').find(node => node.props.type === 'submit')!.props.disabled, false);
  } finally { await f.close(); }
});

test('direct submit and repeated file events cannot bypass the upload guard', async () => {
  const f = await setup();
  try {
    await f.startUpload();
    await act(async () => {
      void f.tree().root.findAllByType('input').find(node => node.props.type === 'file')!.props.onChange({ target: { files: [new Blob(['duplicate'], { type: 'image/jpeg' })] } });
      await f.tree().root.findByType('form').props.onSubmit({ preventDefault() {} });
    });
    assert.equal(f.calls(), 1); assert.equal(readDraft().pending, false); assert.equal(f.successes(), 0);
    await f.finishUpload();
  } finally { await f.finishUpload(); await f.close(); }
});
test('a stalled upload can be cancelled while keeping the training draft', async () => {
  const f = await setup();
  try {
    await f.startUpload(); const before = readDraft();
    const cancel = f.tree().root.findAllByType('button').find(node => node.children.includes('取消添加照片'));
    assert.ok(cancel, 'Pending upload must have a recovery action that preserves training');
    await act(async () => { cancel.props.onClick(); });
    assert.equal(f.tree().root.findAllByType('button').find(node => node.props.type === 'submit')!.props.disabled, false);
    assert.equal(readDraft().id, before.id); assert.deepEqual(readDraft().exercises, before.exercises);
    await f.finishUpload(); assert.equal(readDraft().photoUrl, '');
  } finally { await f.finishUpload(); await f.close(); }
});
test.after(() => { stopAuth(); assert.equal(unexpectedRequests, 0); });
