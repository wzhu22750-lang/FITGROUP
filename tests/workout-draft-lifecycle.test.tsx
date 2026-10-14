import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useWorkoutDraft } from '../src/components/workout/useWorkoutDraft';
import type { WorkoutLog } from '../src/types';
import { createDraftExercise, draftStorageKey } from '../src/utils/workoutDraft';
import { cleanupWorkoutPhotos, trackUploadedPhoto } from '../src/utils/workoutPhotos';
import { supabase } from '../src/lib/supabase';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const storage = new Map<string, string>();
let failStorage = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { if (failStorage) throw new Error('quota'); storage.set(key, value); },
  removeItem: (key: string) => storage.delete(key),
} });
let session!: ReturnType<typeof useWorkoutDraft>;
function Harness({ owner, editingLog }: { owner: string; editingLog?: WorkoutLog }) { session = useWorkoutDraft(owner, editingLog); return null; }
let tree!: ReactTestRenderer;
try {
  await act(async () => { tree = create(<Harness owner="a" />); });
  await act(async () => { session.update(draft => ({ ...draft, exercises: [{ ...createDraftExercise({ name: '卧推', type: 'strength' }), weight: '20' }], note: '末次输入', visibility: 'private' })); });
  const originalId = session.draft.id;
  assert.ok(storage.get(draftStorageKey('a'))?.includes('末次输入'));
  await act(async () => { tree.unmount(); tree = create(<Harness owner="a" />); });
  assert.equal(session.restored, true);
  assert.equal(session.draft.note, '末次输入');
  assert.equal(session.draft.visibility, 'private');
  assert.equal(session.draft.id, originalId);
  await act(async () => { session.commit({ ...session.draft, pending: true }); });
  await act(async () => { session.update(draft => ({ ...draft, note: 'should not change' })); });
  assert.equal(session.draft.note, '末次输入', 'Uncertain submission freezes its exact payload');
  await act(async () => { tree.unmount(); tree = create(<Harness owner="a" />); });
  assert.equal(session.draft.pending, true, 'Pending state survives reload');
  assert.equal(session.draft.id, originalId);
  await act(async () => { tree.unmount(); tree = create(<Harness owner="b" />); });
  assert.equal(session.draft.exercises.length, 0);
  assert.equal(session.draft.note, '');
  await act(async () => { session.update(draft => ({ ...draft, note: 'account b' })); });
  assert.ok(storage.get(draftStorageKey('a'))?.includes('末次输入'));
  failStorage = true;
  await act(async () => { session.update(draft => ({ ...draft, note: 'still editable' })); });
  assert.equal(session.draft.note, 'still editable');
  assert.ok(session.storageWarning);
  failStorage = false;
  await act(async () => { session.update(draft => ({ ...draft, note: 'saved again' })); });
  assert.equal(session.storageWarning, '');
  await act(async () => { tree.unmount(); tree = create(<Harness owner="a" />); });
  session.finish();
  assert.equal(storage.has(draftStorageKey('a')), false, 'Clear only the successful account draft');
  assert.equal(storage.has(draftStorageKey('b')), true);
  await act(async () => { tree.unmount(); tree = create(<Harness owner="a" />); });
  assert.notEqual(session.draft.id, originalId);
  await act(async () => { session.update(draft => ({ ...draft, note: 'discard me' })); });
  await act(async () => { session.reset(); });
  assert.equal(session.draft.note, '');
  assert.equal(session.draft.exercises.length, 0);
  const existingDraft = storage.get(draftStorageKey('b'));
  const editingLog: WorkoutLog = { id: 'edit-log', userId: 'b', userName: 'B', userPhoto: '', timestamp: '2025-01-01T11:00:12Z', category: 'Back', exercises: [{ id: 'existing-ex', name: '引体向上', type: 'strength', weight: -20, sets: 3, reps: 8 }], note: 'original', visibility: 'friends', likesCount: 2, commentsCount: 1 };
  await act(async () => { tree.unmount(); tree = create(<Harness owner="b" editingLog={editingLog} />); });
  assert.equal(session.draft.id, editingLog.id);
  assert.equal(session.draft.exercises[0].id, 'existing-ex');
  assert.equal(session.draft.exercises[0].weightMode, 'assisted');
  assert.equal(session.draft.visibility, 'friends');
  await act(async () => { session.update(draft => ({ ...draft, note: 'edited', workoutTime: '2025-01-02T19:00' })); });
  assert.equal(storage.get(draftStorageKey('b')), existingDraft, 'Editing must not overwrite the new-workout draft');
  session.finish();
  assert.equal(storage.get(draftStorageKey('b')), existingDraft, 'Saving edits must not clear the new-workout draft');
  await act(async () => { session.reset(); });
  assert.equal(session.draft.note, 'original');
  await act(async () => { tree.unmount(); tree = create(<Harness owner="late" />); });
  await act(async () => { session.update(draft => ({ ...draft, note: 'old session' })); });
  const disposed = session;
  await act(async () => { tree.unmount(); tree = create(<Harness owner="late" />); });
  await act(async () => { session.update(draft => ({ ...draft, note: 'new session' })); });
  const latest = storage.get(draftStorageKey('late'));
  await act(async () => { disposed.update(draft => ({ ...draft, photoUrl: 'late upload' })); });
  assert.equal(storage.get(draftStorageKey('late')), latest, 'Late callbacks cannot overwrite a remounted draft');
  disposed.finish();
  assert.equal(storage.get(draftStorageKey('late')), latest, 'Late success cannot erase the new session draft');
  const previousWindow = globalThis.window;
  const events = new EventTarget(); let staleSignals = 0;
  events.addEventListener('fitgroup:draft-state', () => staleSignals++);
  (globalThis as any).window = events;
  try { disposed.reset(); assert.equal(staleSignals, 0, 'Disposed reset cannot signal that a new session draft was cleared'); }
  finally { (globalThis as any).window = previousWindow; }
  const originals = { session: supabase.auth.getSession, storage: supabase.storage.from };
  let cleanupOwner = 'late'; const removed: string[] = [];
  (supabase.auth as any).getSession = async () => ({ data: { session: { user: { id: cleanupOwner } } } });
  (supabase.storage as any).from = () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://photos.test/storage/v1/object/public/workouts/${path}` } }), remove: async (paths: string[]) => { removed.push(...paths); return { data: paths.map(name => ({ name })), error: null }; } });
  try {
    const ref = 'https://photos.test/storage/v1/object/public/workouts/late/memory.jpg';
    trackUploadedPhoto('late', ref, true); failStorage = true;
    await act(async () => { session.update(draft => ({ ...draft, photoUrl: ref })); });
    await cleanupWorkoutPhotos('late'); assert.deepEqual(removed, [], 'An unsaved in-memory photo survives unrelated cleanup');
    failStorage = false;
    await act(async () => { session.reset(); });
    await cleanupWorkoutPhotos('late'); assert.deepEqual(removed, ['late/memory.jpg'], 'Reset releases in-memory protection');
    await act(async () => { tree.unmount(); tree = create(<Harness owner="b" editingLog={editingLog} />); });
    cleanupOwner = 'b';
    const editRef = 'https://photos.test/storage/v1/object/public/workouts/b/edit.jpg';
    trackUploadedPhoto('b', editRef, true);
    await act(async () => { session.update(draft => ({ ...draft, photoUrl: editRef })); });
    await cleanupWorkoutPhotos('b'); assert.equal(removed.length, 1, 'Editing photo is protected without overwriting the new-workout draft');
    await act(async () => { tree.unmount(); tree = create(<Harness owner="b" />); });
    await cleanupWorkoutPhotos('b'); assert.deepEqual(removed, ['late/memory.jpg', 'b/edit.jpg'], 'Closing the editor releases the abandoned upload');
  } finally { failStorage = false; supabase.auth.getSession = originals.session; supabase.storage.from = originals.storage; }
  console.log('PASS workout draft lifecycle: remount restore, immutable retry, account isolation, storage errors, successful cleanup and reset');
} finally { await act(async () => tree?.unmount()); }
