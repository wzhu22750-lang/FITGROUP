import assert from 'node:assert/strict';
import { WorkoutCategory, type WorkoutLog } from '../src/types';
import {
  createDraft, createDraftExercise, decodeDraft, describeExercise, draftCategories, draftStorageKey,
  fromRecordedExercise, historyByExercise, patchDraftExercise, toRecordedExercise, validateDraftExercise,
} from '../src/utils/workoutDraft';

const strength = createDraftExercise({ name: '杠铃平板卧推', type: 'strength', defaultWeight: 60 });
assert.equal(strength.weight, '', 'Do not prescribe a made-up working weight from presets');
assert.equal(strength.sets, '4');
assert.ok(validateDraftExercise(strength).weight);
const valid = { ...strength, weight: '42.5', sets: '4', reps: '10' };
assert.deepEqual(toRecordedExercise(valid), { id: strength.id, name: strength.name, type: 'strength', weight: 42.5, sets: 4, reps: 10 });
assert.equal(toRecordedExercise({ ...valid, weightMode: 'assisted', weight: '15' }).weight, -15);
assert.equal(toRecordedExercise({ ...valid, weightMode: 'bodyweight', weight: '' }).weight, 0);
assert.ok(validateDraftExercise({ ...valid, sets: '2.5' }).sets);
assert.ok(validateDraftExercise({ ...valid, weight: 'Infinity' }).weight);
assert.ok(validateDraftExercise({ ...valid, weight: '1.25' }).weight, 'No silent database rounding of weights');
assert.ok(validateDraftExercise({ ...valid, weight: '0' }).weight, 'Use explicit bodyweight mode');
assert.ok(validateDraftExercise({ ...valid, weightMode: 'assisted', weight: '501' }).weight);
assert.ok(validateDraftExercise({ ...valid, reps: '1001' }).reps);
assert.ok(validateDraftExercise({ ...valid, name: ' ' }).name);
assert.throws(() => toRecordedExercise(strength));

const cardio = createDraftExercise({ name: '户外跑步', type: 'cardio' });
assert.ok(validateDraftExercise(cardio).duration);
const estimated = patchDraftExercise(cardio, { duration: '30' }, 70);
assert.ok(Number(estimated.calories) > 0);
assert.equal(estimated.caloriesSource, 'estimated');
const manual = patchDraftExercise(estimated, { calories: '123', caloriesSource: 'reported' }, 70);
assert.equal(patchDraftExercise(manual, { duration: '60', name: '骑行' }, 80).calories, '123', 'Manual calories are never overwritten by duration/name changes');
assert.notEqual(patchDraftExercise(manual, { caloriesSource: 'estimated' }, 70).calories, '123');
assert.equal(patchDraftExercise(estimated, { duration: '' }, 70).calories, '');
assert.equal(validateDraftExercise({ ...cardio, distance: '2.5' }).duration, undefined);
assert.ok(validateDraftExercise({ ...cardio, duration: '1441' }).duration);
assert.ok(validateDraftExercise({ ...cardio, distance: '2.555' }).distance, 'No silent database rounding of distance');
assert.ok(validateDraftExercise({ ...cardio, duration: '5.5' }).duration);
assert.ok(validateDraftExercise({ ...cardio, calories: '-2' }).calories);
assert.equal(toRecordedExercise(manual).caloriesSource, 'reported');
const assistedRecord = { id: 'old', name: '引体向上', type: 'strength' as const, weight: -20, sets: 3, reps: 8 };
const imported = fromRecordedExercise(assistedRecord);
assert.notEqual(imported.id, assistedRecord.id);
assert.equal(imported.weightMode, 'assisted');
assert.equal(toRecordedExercise(imported).weight, -20);
assert.ok(describeExercise(assistedRecord).includes('辅助 20 kg'));

const draft = { ...createDraft('user-a'), exercises: [valid, manual], categories: [WorkoutCategory.Back], note: '训练草稿', visibility: 'private' as const };
const decoded = decodeDraft(JSON.stringify(draft), 'user-a');
assert.deepEqual(decoded, draft);
assert.ok(draftCategories(draft).includes(WorkoutCategory.Chest));
assert.ok(draftCategories(draft).includes(WorkoutCategory.Back));
assert.equal(decodeDraft(JSON.stringify(draft), 'user-b'), null);
assert.notEqual(draftStorageKey('user-a'), draftStorageKey('user-b'));
for (const corrupted of ['bad json', '{}', JSON.stringify({ ...draft, version: 99 }), JSON.stringify({ ...draft, exercises: Array(11).fill(valid) }), JSON.stringify({ ...draft, exercises: [valid, valid] }), JSON.stringify({ ...draft, pending: true, exercises: [strength] }), JSON.stringify({ ...draft, note: 'x'.repeat(501) })]) {
  assert.equal(decodeDraft(corrupted, 'user-a'), null);
}
assert.equal(decodeDraft(JSON.stringify({ ...draft, pending: true }), 'user-a')?.id, draft.id, 'Pending submission retains the idempotency key');
const log = (timestamp: string, weight: number): WorkoutLog => ({ id: timestamp, timestamp, userId: 'user-a', userName: '', userPhoto: '', category: 'Chest', exercises: [{ ...assistedRecord, weight }], likesCount: 0, commentsCount: 0 });
assert.equal(historyByExercise([log('2026-01-01', -10), log('2026-02-01', -5)]).get('strength:引体向上')?.exercise.weight, -5);
console.log('PASS workout draft: validation, explicit weight modes, calorie provenance, history, account isolation, corrupted drafts, stable retry IDs');
