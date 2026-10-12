import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase';
import { fetchWorkoutLogsForStatistics, getUserWorkoutLogsForAnalytics, getUserWorkoutLogsForStats, subscribeToUserWorkoutLogs } from '../src/api';
import { calculateFullWorkoutAnalytics } from '../src/utils/workoutAnalytics';
import type { WorkoutLog } from '../src/types';

globalThis.fetch = async () => { throw new Error('Unexpected network in offline test'); };
const until = new Date().toISOString();
const since = new Date(Date.now() - 90 * 86400000).toISOString();
const makeRow = (i: number, timestamp = new Date(Date.now() - 86400000).toISOString()) => ({
  id: `log-${String(i).padStart(6, '0')}`, user_id: 'u1', user_name: '', user_photo: '',
  created_at: timestamp, category: 'Chest', exercises: [{ id: 'e1', name: '卧推', weight: 60, reps: 8, sets: 3, type: 'strength' }],
});
let rows = Array.from({ length: 1201 }, (_, i) => makeRow(i));
rows.push(makeRow(2000, new Date(Date.now() - 300 * 86400000).toISOString()));
rows.at(-1)!.exercises[0].weight = 120;
rows.push({ ...makeRow(3000), user_id: 'other' }, makeRow(4000, new Date(Date.now() + 86400000).toISOString()));
let cap = 137;
let fail = false;
let delayMs = 0;
const requests: Array<{ since?: string; before?: string; cursor?: string; signal?: AbortSignal }> = [];
let pull: (payload?: any) => void = () => {};
const original = { from: supabase.from, channel: supabase.channel, removeChannel: supabase.removeChannel };
supabase.from = (() => {
  const state = { uid: '', until: '', since: undefined as string | undefined, before: undefined as string | undefined, cursor: undefined as string | undefined, limit: 0, signal: undefined as AbortSignal | undefined };
  const query: any = {
    select: (columns: string) => { assert.ok(!columns.includes('photo_url')); return query; },
    eq: (_: string, value: string) => { state.uid = value; return query; },
    lte: (_: string, value: string) => { state.until = value; return query; },
    gte: (_: string, value: string) => { state.since = value; return query; },
    lt: (column: string, value: string) => { if (column === 'id') state.cursor = value; else state.before = value; return query; },
    order: (column: string, opts: any) => { assert.equal(column, 'id'); assert.equal(opts.ascending, false); return query; },
    limit: (limit: number) => { state.limit = limit; return query; },
    abortSignal: (signal: AbortSignal) => { state.signal = signal; return query; },
    then: (resolve: any, reject: any) => {
      requests.push({ ...state });
      const data = rows.filter(r => r.user_id === state.uid && r.created_at <= state.until && (!state.since || r.created_at >= state.since) && (!state.before || r.created_at < state.before) && (!state.cursor || r.id < state.cursor))
        .sort((a, b) => b.id.localeCompare(a.id)).slice(0, Math.min(state.limit, cap)).map(r => structuredClone(r));
      return new Promise(r => setTimeout(() => r({ data, error: fail ? new Error('network interrupted') : null }), delayMs)).then(resolve, reject);
    },
  };
  return query;
}) as any;
supabase.channel = (() => { const channel = { on: (_event: any, _filter: any, cb: any) => { pull = cb; return channel; }, subscribe: () => channel }; return channel; }) as any;
supabase.removeChannel = async () => 'ok';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await sleep(10); }
  assert.fail('Subscription did not settle');
}
try {
  const all = await getUserWorkoutLogsForStats('u1', { since, until });
  assert.equal(all.length, 1202);
  assert.equal(new Set(all.map(l => l.id)).size, 1202);
  assert.equal(calculateFullWorkoutAnalytics(all).categorizedPrs[0].weight, 120);
  assert.ok(requests.every(r => r.signal));
  assert.equal((await getUserWorkoutLogsForAnalytics('u1', { maxCount: 1 })).length, 1201);
  assert.equal((await fetchWorkoutLogsForStatistics('u1', { since, until })).length, 1201);
  assert.deepEqual(await getUserWorkoutLogsForStats(''), []);
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(() => fetchWorkoutLogsForStatistics('u1', { signal: controller.signal }), /cancelled/);
  fail = true;
  await assert.rejects(() => getUserWorkoutLogsForStats('u1', { since, until }), /network interrupted/);
  fail = false; cap = 400;

  let updates: WorkoutLog[][] = [];
  const errors: Error[] = [];
  const stop = subscribeToUserWorkoutLogs('u1', logs => updates.push(logs), error => errors.push(error), { mode: 'statistics', since });
  await waitFor(() => updates.length === 1);
  assert.equal(updates[0].length, 1202);
  requests.length = 0;
  rows.push(makeRow(5000));
  for (let i = 0; i < 5; i++) pull({ eventType: 'INSERT', new: { created_at: rows.at(-1)!.created_at } });
  await waitFor(() => updates.length === 2);
  assert.equal(updates[1].length, 1203);
  assert.ok(requests.every(r => !r.before), 'Recent-only inserts reuse historical cache');

  rows = rows.filter(r => r.id !== 'log-002000');
  pull({ eventType: 'DELETE', old: { id: 'log-002000' } });
  await waitFor(() => updates.length === 3);
  assert.ok(requests.some(r => r.before), 'Unknown deletes invalidate history');
  assert.equal(updates[2].length, 1202);
  assert.equal(calculateFullWorkoutAnalytics(updates[2]).categorizedPrs[0].weight, 60);

  fail = true;
  pull({ eventType: 'UPDATE' });
  await waitFor(() => errors.length === 1);
  assert.equal(updates.length, 3, 'Failure never publishes empty or partial history');
  fail = false;
  pull({ eventType: 'UPDATE' });
  await waitFor(() => updates.length === 4);
  delayMs = 30;
  const countBeforeStop = requests.length;
  pull({ eventType: 'INSERT', new: { created_at: until } });
  await waitFor(() => requests.length > countBeforeStop);
  const signal = requests.at(-1)!.signal!;
  stop();
  assert.equal(signal.aborted, true);
  pull(); await sleep(160);
  assert.equal(updates.length, 4, 'Disposed subscription never publishes data');

  updates = [];
  delayMs = 30;
  const stopStale = subscribeToUserWorkoutLogs('u1', logs => updates.push(logs), undefined, { mode: 'statistics', since });
  await sleep(10);
  rows.push(makeRow(6000));
  pull({ eventType: 'INSERT', new: { created_at: rows.at(-1)!.created_at } });
  await waitFor(() => updates.length > 0);
  assert.equal(updates.length, 1, 'Event immediately suppresses old in-flight result');
  assert.equal(updates[0].length, 1203);
  stopStale();
  console.log('PASS stats pagination: >1200 rows, lower provider caps, full PR history, windows, cancellation, errors, debounce, cache invalidation, stale response and disposal');
} finally {
  Object.assign(supabase, original);
}
