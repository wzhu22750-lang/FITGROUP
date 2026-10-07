import { buildWorkoutLogUpdatePayload, classifyWorkoutLogError, executeWorkoutLogUpdate, formatWorkoutLogError, sanitizeExercisesForDb } from '../src/utils/workoutLogUpdate';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

function createFakeClient(options: {
  existing?: unknown;
  readError?: unknown;
  readReject?: unknown;
  updatedRows?: unknown[] | null;
  updateError?: unknown;
  updateReject?: unknown;
}) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      assert(table === 'workout_logs', `uses workout_logs table for ${table}`);
      return {
        select(columns?: string) {
          calls.push({ operation: 'select', columns });
          return {
            eq(column: string, value: string) {
              calls.push({ operation: 'select.eq', column, value });
              return {
                async maybeSingle() {
                  if (options.readReject) throw options.readReject;
                  return { data: options.existing ?? null, error: options.readError ?? null };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          calls.push({ operation: 'update', payload });
          return {
            eq(column: string, value: string) {
              calls.push({ operation: 'update.eq', column, value });
              return {
                async select() {
                  calls.push({ operation: 'update.select' });
                  if (options.updateReject) throw options.updateReject;
                  return { data: options.updatedRows ?? [], error: options.updateError ?? null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const user = { id: 'owner-1' };
const existing = { id: 'log-1', user_id: 'owner-1' };
const row = {
  id: 'log-1',
  user_id: 'owner-1',
  user_name: 'Tester',
  user_photo: '',
  created_at: '2026-09-01T00:00:00.000Z',
  category: 'Back',
  exercises: [{ id: 'ex-1', name: '引体向上', type: 'strength', weight: -30, sets: 4, reps: 8 }],
  note: 'updated',
  photo_url: '',
  likes_count: 0,
  comments_count: 0,
  visibility: 'public',
};

console.log('--- Testing workout log payload normalization ---');
{
  const payload = buildWorkoutLogUpdatePayload({
    category: 'Back',
    categories: ['Back'],
    exercises: [{
      id: 'ex-1',
      name: '引体向上',
      type: 'strength',
      weight: -30,
      sets: 4,
      reps: 8,
      uiOnlyField: 'must-not-reach-db',
    }, {
      id: 'ex-2',
      name: '户外跑步',
      type: 'cardio',
      duration: 30,
      distance: 5,
      calories: 315,
      caloriesSource: 'estimated',
    }],
    note: 'updated',
    visibility: 'public',
  });
  const exercises = payload.exercises as any[];
  assert(exercises[0].weight === -30, 'negative assisted-training weight is preserved');
  assert(exercises[1].caloriesSource === 'estimated', 'cardio caloriesSource is preserved');
  assert(!('uiOnlyField' in exercises[0]), 'unsupported UI fields are not sent to the database');
  assert(payload.category === 'Back', 'category payload is normalized');
}

console.log('--- Testing update execution and return-value contract ---');
{
  const { client, calls } = createFakeClient({ existing, updatedRows: [row] });
  const updated = await executeWorkoutLogUpdate({
    client,
    user,
    workoutLogId: 'log-1',
    updates: { exercises: row.exercises, note: 'updated' },
  });
  assert((updated as any).id === 'log-1', 'successful update returns the database row');
  assert(calls.some((call) => call.operation === 'update'), 'UPDATE is actually executed');
  assert(calls.some((call) => call.operation === 'update.eq' && call.value === 'log-1'), 'UPDATE filters by the supplied database id');
}

console.log('--- Testing zero-row update failure ---');
{
  const { client } = createFakeClient({ existing, updatedRows: [] });
  let failed = false;
  try {
    await executeWorkoutLogUpdate({
      client,
      user,
      workoutLogId: 'log-1',
      updates: { note: 'must fail if no row is returned' },
    });
  } catch (error: any) {
    failed = error.code === 'PGRST_NO_ROWS';
  }
  assert(failed, 'UPDATE returning zero rows is reported as failure');
}

console.log('--- Testing Supabase error metadata preservation ---');
{
  const { client } = createFakeClient({
    existing,
    updateError: {
      code: '23514',
      message: 'new row violates check constraint',
      details: 'Failing row contains invalid exercises',
      hint: 'Check is_valid_exercises',
    },
  });
  let captured: any;
  try {
    await executeWorkoutLogUpdate({
      client,
      user,
      workoutLogId: 'log-1',
      updates: { note: 'constraint failure' },
    });
  } catch (error) {
    captured = error;
  }
  assert(captured?.code === '23514', 'Supabase error code is preserved');
  assert(captured?.details.includes('invalid exercises'), 'Supabase error details are preserved');
  assert(captured?.hint === 'Check is_valid_exercises', 'Supabase error hint is preserved');
  assert(classifyWorkoutLogError(captured) === '数据库 CHECK constraint 失败', 'CHECK failures are classified for the user');
  assert(formatWorkoutLogError(captured).includes('23514'), 'formatted error keeps the Supabase error code');
}

console.log('--- Testing edit regression scenarios ---');
{
  const scenarios = [
    { name: 'ordinary strength weight', exercise: { id: 's1', name: '杠铃平板卧推', type: 'strength', weight: 85, sets: 4, reps: 8 } },
    { name: 'strength sets and reps', exercise: { id: 's2', name: '哑铃深蹲', type: 'strength', weight: 20, sets: 6, reps: 12 } },
    { name: 'assisted pull-up negative weight', exercise: { id: 's3', name: '引体向上', type: 'strength', weight: -30, sets: 4, reps: 8 } },
    { name: 'cardio duration', exercise: { id: 'c1', name: '户外跑步', type: 'cardio', duration: 45, distance: 5, calories: 315 } },
    { name: 'cardio calories', exercise: { id: 'c2', name: '户外跑步', type: 'cardio', duration: 30, distance: 5, calories: 420 } },
    { name: 'cardio estimated provenance', exercise: { id: 'c3', name: '户外跑步', type: 'cardio', duration: 30, distance: 5, calories: 315, caloriesSource: 'estimated' } },
    { name: 'cardio reported provenance', exercise: { id: 'c4', name: '户外跑步', type: 'cardio', duration: 30, distance: 5, calories: 315, caloriesSource: 'reported' } },
    { name: 'legacy cardio without provenance', exercise: { id: 'c5', name: '户外跑步', type: 'cardio', duration: 30, distance: 5, calories: 315 } },
  ];
  for (const scenario of scenarios) {
    const payload = buildWorkoutLogUpdatePayload({ exercises: [scenario.exercise] });
    const [exercise] = payload.exercises as any[];
    const { client, calls } = createFakeClient({
      existing,
      updatedRows: [{ ...row, exercises: payload.exercises }],
    });
    const updated = await executeWorkoutLogUpdate({
      client,
      user,
      workoutLogId: 'log-1',
      updates: { exercises: [scenario.exercise] },
    });
    assert(exercise.name === scenario.exercise.name, `${scenario.name} payload is retained`);
    assert((updated.exercises as any[])[0].name === scenario.exercise.name, `${scenario.name} UPDATE succeeds`);
    assert(calls.some((call) => call.operation === 'update'), `${scenario.name} executes UPDATE`);
  }
  const deletedPayload = buildWorkoutLogUpdatePayload({ exercises: [scenarios[0].exercise] });
  const deletedResult = await executeWorkoutLogUpdate({
    client: createFakeClient({ existing, updatedRows: [{ ...row, exercises: deletedPayload.exercises }] }).client,
    user,
    workoutLogId: 'log-1',
    updates: { exercises: [scenarios[0].exercise] },
  });
  assert((deletedResult.exercises as any[]).length === 1, 'deleting an exercise leaves a valid non-empty exercise list');
  const addedPayload = buildWorkoutLogUpdatePayload({ exercises: [scenarios[0].exercise, scenarios[1].exercise] });
  const addedResult = await executeWorkoutLogUpdate({
    client: createFakeClient({ existing, updatedRows: [{ ...row, exercises: addedPayload.exercises }] }).client,
    user,
    workoutLogId: 'log-1',
    updates: { exercises: [scenarios[0].exercise, scenarios[1].exercise] },
  });
  assert((addedResult.exercises as any[]).length === 2, 'adding an exercise persists both exercises');
  const categoryResult = await executeWorkoutLogUpdate({
    client: createFakeClient({ existing, updatedRows: [{ ...row, category: 'Back', visibility: 'private' }] }).client,
    user,
    workoutLogId: 'log-1',
    updates: { category: 'Back', visibility: 'private' },
  });
  assert(categoryResult.category === 'Back' && categoryResult.visibility === 'private', 'category and visibility edits are included');
}

console.log('--- Testing authorization and network error classification ---');
{
  const { client } = createFakeClient({ existing: { id: 'log-1', user_id: 'different-user' } });
  let error: any;
  try {
    await executeWorkoutLogUpdate({ client, user, workoutLogId: 'log-1', updates: { note: 'forbidden' } });
  } catch (caught) {
    error = caught;
  }
  assert(error?.code === 'WORKOUT_LOG_RLS_FORBIDDEN', 'non-owner UPDATE is rejected before mutation');
  assert(classifyWorkoutLogError(error) === 'RLS 权限错误', 'RLS failures are classified for the user');

  const network = createFakeClient({ existing, updateReject: new TypeError('fetch failed') });
  let networkError: any;
  try {
    await executeWorkoutLogUpdate({ client: network.client, user, workoutLogId: 'log-1', updates: { note: 'network' } });
  } catch (caught) {
    networkError = caught;
  }
  assert(networkError?.code === 'NETWORK_ERROR', 'network failures retain a distinct error code');
  assert(classifyWorkoutLogError(networkError) === '网络错误', 'network failures are classified for the user');
}

console.log('🎉 ALL WORKOUT LOG UPDATE TESTS PASSED SUCCESSFULLY!');
