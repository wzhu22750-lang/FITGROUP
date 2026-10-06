import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useWorkoutDraft } from '../src/components/workout/useWorkoutDraft';
import { createDraftExercise, draftStorageKey } from '../src/utils/workoutDraft';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const storage = new Map<string, string>();
let failStorage = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { if (failStorage) throw new Error('quota'); storage.set(key, value); },
  removeItem: (key: string) => storage.delete(key),
} });
let session!: ReturnType<typeof useWorkoutDraft>;
function Harness({ owner }: { owner: string }) { session = useWorkoutDraft(owner); return null; }
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
  console.log('PASS workout draft lifecycle: remount restore, immutable retry, account isolation, storage errors, successful cleanup and reset');
} finally { await act(async () => tree?.unmount()); }
