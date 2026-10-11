import assert from 'node:assert/strict';
import { fetchAllPages, fetchAllPagesById } from '../src/utils/pagination';
import { supabase } from '../src/lib/supabase';
import { fetchAllMyWorkoutLogsForExport } from '../src/api';

// These tests are offline: all API queries are replaced with mutable in-memory rows.
console.log('--- Testing Export Pagination ---');
const id = (i: number) => `row-${String(i).padStart(5, '0')}`;
const makeRow = (i: number) => ({
  id: id(i), user_id: 'u1', user_name: 'Tester', user_photo: '',
  created_at: new Date(Date.UTC(2020, 0, 1) + i * 1000).toISOString(),
  category: 'Chest', exercises: [], note: '', photo_url: '',
  likes_count: 0, comments_count: 0, visibility: 'public',
});
type Row = ReturnType<typeof makeRow>;

// Existing offset helper remains usable, but exports do not call it.
assert.equal((await fetchAllPages(async (from, to) =>
  Array.from({ length: 1001 }, (_, i) => i).slice(from, to + 1), 400)).length, 1001);
for (const size of [0, -1, NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  await assert.rejects(() => fetchAllPages(async () => [], size), /pageSize/);
  await assert.rejects(() => fetchAllPagesById(async () => [], size), /pageSize/);
  await assert.rejects(() => fetchAllMyWorkoutLogsForExport('u1', { pageSize: size }), /pageSize/);
}
assert.deepEqual(await fetchAllPagesById(async () => []), []);
// The database can sort mixed-case text differently from JS code-unit order.
// Trust its ORDER BY/lt contract; detect loops via repeated ids instead.
{
  const cursors: Array<string | undefined> = [];
  const pages = [[{ id: 'log_B' }], [{ id: 'log_a' }], []];
  const result = await fetchAllPagesById(async (cursor) => {
    cursors.push(cursor);
    return pages.shift()!;
  }, 1);
  assert.deepEqual(result.map(row => row.id), ['log_B', 'log_a']);
  assert.deepEqual(cursors, [undefined, 'log_B', 'log_a']);
  await assert.rejects(() => fetchAllPagesById(async () => [{ id: 'a' }, { id: 'a' }], 2), /游标/);
}
await assert.rejects(() => fetchAllPagesById(async () => { throw new Error('network down'); }), /network down/);
await assert.rejects(() => fetchAllPagesById(async () => [{ id: 'same' }], 1), /游标/);
await assert.rejects(() => fetchAllPagesById(async () => [{ id: 'z' }], 1, { maxPages: 1 }), /上限/);
const controller = new AbortController();
await assert.rejects(() => fetchAllPagesById(async () => {
  controller.abort(new Error('cancelled during final page'));
  return [];
}, 400, { signal: controller.signal }), /cancelled/);

const originalFrom = supabase.from;
/** A faithful keyset mock: applies filters, order, and limit on each request. */
function installMock(initial: Row[], mutate?: (rows: Row[], call: number) => void, failure?: Error) {
  const rows = [...initial];
  const requests: Array<{ before?: string; limit: number }> = [];
  supabase.from = ((table: string) => {
    assert.equal(table, 'workout_logs');
    const state = { before: undefined as string | undefined, limit: 0, cutoff: '', uid: '', signal: undefined as AbortSignal | undefined };
    const query: any = {
      select: () => query,
      eq: (column: string, value: string) => { assert.equal(column, 'user_id'); state.uid = value; return query; },
      lte: (column: string, value: string) => { assert.equal(column, 'created_at'); state.cutoff = value; return query; },
      lt: (column: string, value: string) => { assert.equal(column, 'id'); state.before = value; return query; },
      order: (column: string, opts: { ascending: boolean }) => { assert.equal(column, 'id'); assert.equal(opts.ascending, false); return query; },
      limit: (limit: number) => { state.limit = limit; return query; },
      range: () => assert.fail('Export must never use offset pagination'),
      abortSignal: (signal: AbortSignal) => { state.signal = signal; return query; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        requests.push({ before: state.before, limit: state.limit });
        mutate?.(rows, requests.length);
        assert.ok(state.signal);
        const data = rows.filter(r => r.user_id === state.uid && r.created_at <= state.cutoff &&
          (state.before === undefined || r.id < state.before))
          .sort((a, b) => b.id.localeCompare(a.id)).slice(0, state.limit).map(row => ({ ...row }));
        return Promise.resolve({ data, error: failure ?? null }).then(resolve, reject);
      },
    };
    return query;
  }) as any;
  return { requests, rows };
}
try {
  for (const total of [0, 1000, 1001, 800]) {
    const { requests } = installMock(Array.from({ length: total }, (_, i) => makeRow(i)));
    const logs = await fetchAllMyWorkoutLogsForExport('u1');
    assert.equal(logs.length, total);
    assert.equal(requests.length, Math.floor(total / 400) + 1);
    assert.equal(new Set(logs.map(log => log.id)).size, total);
    if (total) {
      assert.equal(logs[0].id, id(total - 1));
      assert.deepEqual(logs[0].categories, ['Chest']);
    }
    if (total > 400) assert.equal(requests[1].before, id(total - 400));
  }

  // Delete a row in the already-read page: offset would skip an unread row.
  installMock(Array.from({ length: 6 }, (_, i) => makeRow(i)), (rows, call) => {
    if (call === 2) rows.splice(rows.findIndex(r => r.id === id(5)), 1);
  });
  assert.deepEqual((await fetchAllMyWorkoutLogsForExport('u1', { pageSize: 2 })).map(r => r.id),
    [5, 4, 3, 2, 1, 0].map(id));

  // Backfills and time edits do not move the immutable pagination cursor.
  const { requests } = installMock([0, 2, 4, 6].map(makeRow), (rows, call) => {
    if (call === 2) {
      rows.push(makeRow(3), makeRow(7)); // below cursor included; above cursor not revisited
      rows.find(r => r.id === id(2))!.created_at = '2025-01-01T00:00:00.000Z';
      rows.find(r => r.id === id(6))!.created_at = '2010-01-01T00:00:00.000Z';
    }
  });
  const edited = await fetchAllMyWorkoutLogsForExport('u1', { pageSize: 2, exportStartedAt: '2030-01-01T00:00:00.000Z' });
  assert.deepEqual(edited.map(r => r.id), [2, 6, 4, 3, 0].map(id));
  assert.deepEqual(requests.map(r => r.before), [undefined, id(4), id(2)]);
  assert.equal(edited.find(r => r.id === id(6))!.timestamp, makeRow(6).created_at,
    'Already-read rows are not refreshed: traversal is explicitly not a snapshot');

  const tied = [makeRow(1), makeRow(2)];
  tied[0].created_at = tied[1].created_at;
  installMock(tied);
  assert.deepEqual((await fetchAllMyWorkoutLogsForExport('u1', { pageSize: 1 })).map(r => r.id), [id(2), id(1)]);

  installMock([], undefined, new Error('API export failed'));
  await assert.rejects(() => fetchAllMyWorkoutLogsForExport('u1'), /API export failed/);
  const cancel = new AbortController();
  const { requests: cancelledRequests } = installMock([makeRow(1)], () => cancel.abort(new Error('API cancelled')));
  await assert.rejects(() => fetchAllMyWorkoutLogsForExport('u1', { signal: cancel.signal }), /API cancelled/);
  assert.equal(cancelledRequests.length, 1);
  const pre = new AbortController();
  pre.abort(new Error('pre-cancelled'));
  await assert.rejects(() => fetchAllMyWorkoutLogsForExport('u1', { signal: pre.signal }), /pre-cancelled/);
  assert.equal(cancelledRequests.length, 1);
} finally {
  supabase.from = originalFrom;
}
console.log('✅ Export keyset traversal, mutations, sorting, validation, errors and cancellation passed');
