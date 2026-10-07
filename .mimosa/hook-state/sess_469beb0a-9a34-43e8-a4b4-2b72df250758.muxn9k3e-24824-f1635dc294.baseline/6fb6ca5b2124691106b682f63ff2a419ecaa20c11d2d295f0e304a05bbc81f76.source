import assert from 'node:assert/strict';
import { fetchAllPages } from '../src/utils/pagination';

function pass(msg: string) {
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- Testing Export Pagination ---');

// 1. fetchAllPages reads every page until a short page is returned
{
  const total = 1001;
  const all = Array.from({ length: total }, (_, i) => i);
  const calls: Array<[number, number]> = [];
  const result = await fetchAllPages<number>(async (from, to) => {
    calls.push([from, to]);
    return all.slice(from, to + 1);
  }, 400, {});

  assert.equal(result.length, total, '1001 items read across pages');
  assert.equal(calls.length, 3, 'three page requests (400 + 400 + 201)');
  assert.deepEqual(calls[0], [0, 399]);
  assert.deepEqual(calls[1], [400, 799]);
  assert.deepEqual(calls[2], [800, 1199]);
  pass('fetchAllPages reads >1 page completely (1001)');
}

// 2. Exactly 1000 records stop after the short final page
{
  const all = Array.from({ length: 1000 }, (_, i) => i);
  let calls = 0;
  const result = await fetchAllPages<number>(async (from, to) => {
    calls += 1;
    return all.slice(from, to + 1);
  }, 400);
  assert.equal(result.length, 1000);
  assert.equal(calls, 3, '400 + 400 + 200');
  pass('fetchAllPages handles an exact 1000 boundary');
}

// 3. Empty result
{
  const result = await fetchAllPages<number>(async () => [], 400);
  assert.deepEqual(result, []);
  pass('fetchAllPages handles an empty history');
}

// 4. Errors are propagated (never swallowed)
{
  await assert.rejects(
    () => fetchAllPages<number>(async () => {
      throw new Error('network down');
    }, 400),
    /network down/,
    'fetch errors propagate',
  );
  pass('fetchAllPages propagates fetch errors');
}

// 5. Invalid page size is rejected
{
  await assert.rejects(() => fetchAllPages<number>(async () => [], 0), /pageSize/);
  await assert.rejects(() => fetchAllPages<number>(async () => [], -1), /pageSize/);
  pass('fetchAllPages rejects invalid page sizes');
}

// 6. API integration: fetchAllMyWorkoutLogsForExport reads full history + de-dupes
{
  const { supabase } = await import('../src/lib/supabase');
  const { fetchAllMyWorkoutLogsForExport } = await import('../src/api');

  const makeRow = (index: number, id = `row-${index}`) => ({
    id,
    user_id: 'u1',
    user_name: 'Tester',
    user_photo: '',
    created_at: new Date(Date.UTC(2020, 0, 1) + index * 1000).toISOString(),
    category: 'Chest',
    exercises: [{ id: `e-${index}`, name: '杠铃卧推', type: 'strength', sets: 3, reps: 8, weight: 60 }],
    note: '',
    photo_url: '',
    likes_count: 0,
    comments_count: 0,
    visibility: 'public',
  });

  const dataset = Array.from({ length: 1001 }, (_, i) => makeRow(i));
  let rangeCalls = 0;
  let lastRange: [number, number] = [0, 0];

  supabase.from = ((table: string) => {
    assert.equal(table, 'workout_logs');
    const state = { from: 0, to: 0 };
    const query: any = {
      select: () => query,
      eq: () => query,
      lte: () => query,
      order: () => query,
      range: (from: number, to: number) => {
        state.from = from;
        state.to = to;
        rangeCalls += 1;
        lastRange = [from, to];
        return query;
      },
      abortSignal: () => query,
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: dataset.slice(state.from, state.to + 1), error: null }).then(resolve),
    };
    return query;
  }) as any;

  const logs = await fetchAllMyWorkoutLogsForExport('u1', {
    exportStartedAt: new Date(Date.UTC(2100, 0, 1)).toISOString(),
  });
  assert.equal(logs.length, 1001, 'API returns the complete 1001-record history');
  assert.equal(rangeCalls, 3, 'API paginated three times');
  assert.deepEqual(lastRange, [800, 1199]);
  assert.deepEqual(logs[0].categories, ['Chest'], 'normalized categories are attached');

  // De-dupe across a page boundary
  const withDuplicate = [...Array.from({ length: 4 }, (_, i) => makeRow(i, i === 3 ? 'dup-0' : `dup-${i}`))];
  supabase.from = (() => {
    const state = { from: 0, to: 0 };
    const query: any = {
      select: () => query,
      eq: () => query,
      lte: () => query,
      order: () => query,
      range: (from: number, to: number) => {
        state.from = from;
        state.to = to;
        return query;
      },
      abortSignal: () => query,
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: withDuplicate.slice(state.from, state.to + 1), error: null }).then(resolve),
    };
    return query;
  }) as any;

  const deduped = await fetchAllMyWorkoutLogsForExport('u1', { pageSize: 2 });
  assert.equal(deduped.length, 3, 'duplicate ids across pages are de-duplicated');
  pass('fetchAllMyWorkoutLogsForExport: full history + dedupe');
}

console.log('\n🎉 ALL EXPORT PAGINATION TESTS PASSED SUCCESSFULLY!\n');
