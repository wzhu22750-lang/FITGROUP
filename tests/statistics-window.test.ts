import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStatisticsDataStore, getStatisticsAnalysisLogs, getStatisticsAnalytics, type StatisticsSnapshot } from '../src/utils/statisticsData';
import type { WorkoutLog } from '../src/types';

const start = Date.parse('2026-10-14T12:00:00Z');
const day = 86400000;
const log = (id: string, age: number): WorkoutLog => ({ id, userId: 'owner', userName: '', userPhoto: '', timestamp: new Date(start - age * day).toISOString(), category: 'Chest', exercises: [{ id: 'e', name: '卧推', type: 'strength', sets: 3, reps: 8, weight: 60 }], likesCount: 0, commentsCount: 0 });
const fixture = (rows: WorkoutLog[]) => {
  let clock = start, reads = 0;
  const values: StatisticsSnapshot[] = [];
  let afterRead: (history: boolean) => void = () => {};
  const store = createStatisticsDataStore({ now: () => clock, historyTtlMs: 30 * day, listen: () => () => {}, fetch: async (_uid, options) => {
    await Promise.resolve();
    reads++;
    const result = rows.filter(row => (!options.since || Date.parse(row.timestamp) >= Date.parse(options.since)) && (!options.before || Date.parse(row.timestamp) < Date.parse(options.before)) && Date.parse(row.timestamp) <= Date.parse(options.until)).map(row => ({ ...row }));
    afterRead(!!options.before);
    return result;
  }});
  const stop = store.subscribe('owner', value => values.push(value));
  const ready = async () => { for (let i = 0; i < 100; i++) { if (values.at(-1)?.historyReady && !values.at(-1)?.historyRefreshing) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.fail('Fixture timeout'); };
  return { store, stop, ready, values, reads: () => reads, advance: (ms: number) => { clock += ms; }, afterRead: (callback: typeof afterRead) => { afterRead = callback; } };
};

test('90-day window rolls while expired recent records remain available to historical PRs', async () => {
  const f = fixture([log('edge', 89), log('recent', 2), log('archive', 200)]);
  try {
    await f.ready(); f.advance(2 * day); await f.store.retry('owner');
    const value = f.values.at(-1)!;
    assert.deepEqual(value.recentLogs.map(row => row.id), ['recent']);
    assert.equal(value.history.some(row => row.id === 'edge'), true);
    assert.equal(value.totalWorkouts, 3); assert.equal(f.reads(), 3, 'Window rollover reuses fresh historical cache');
  } finally { f.stop(); f.store.reset(); }
});

test('a historical record edited into the recent window does not duplicate cached history', async () => {
  const rows = [log('moved', 200)]; const f = fixture(rows);
  try {
    await f.ready(); rows[0] = log('moved', 2); await f.store.retry('owner');
    assert.equal(f.values.at(-1)!.totalWorkouts, 1);
    assert.equal(f.values.at(-1)!.history.length, 0);
  } finally { f.stop(); f.store.reset(); }
});

test('sequential window reads reconcile date edits by immutable ID', async () => {
  const rows = [log('moved', 2)]; const f = fixture(rows);
  f.afterRead(history => { if (!history) rows[0] = log('moved', 200); });
  try {
    await f.ready(); const value = f.values.at(-1)!;
    assert.equal(value.totalWorkouts, 1);
    assert.equal(value.recentLogs.length, 0);
    assert.equal(value.history[0].timestamp, rows[0].timestamp, 'Later history response wins');
  } finally { f.stop(); f.store.reset(); }
});

test('progressive phases use the query cutoff as a shared analytics clock', async () => {
  const f = fixture([log('recent', 2), log('archive', 200)]);
  f.afterRead(() => f.advance(day));
  try {
    await f.ready();
    assert.deepEqual(f.values.map(value => (value as StatisticsSnapshot & { asOf?: number }).asOf), [start, start]);
    assert.equal(f.values.at(-1)!.updatedAt, start + 2 * day, 'Cache freshness still uses response time');
  } finally { f.stop(); f.store.reset(); }
});

test('evidence follows immutable history and body context while analytics follow asOf', () => {
  const history = [log('archive', 200)];
  const initial: StatisticsSnapshot = { recentLogs: [log('recent', 2)], history, logs: [], historyReady: true, asOf: start, updatedAt: start };
  const refreshed = { ...initial, recentLogs: [log('recent-edit', 1)], updatedAt: start + day };
  const body = { sex: 'male' as const, bodyweightKg: 75 };
  const original = getStatisticsAnalysisLogs(initial, body).at(-1)!;
  assert.equal(getStatisticsAnalysisLogs(refreshed, body).at(-1), original, 'Recent refresh reuses historical evidence objects');
  assert.notEqual(getStatisticsAnalysisLogs(refreshed, { ...body, bodyweightKg: 85 }).at(-1), original, 'Body context has independent evidence');
  assert.notEqual(getStatisticsAnalysisLogs({ ...refreshed, history: [...history] }, body).at(-1), original, 'New history invalidates evidence');
  assert.deepEqual(getStatisticsAnalytics(initial, {}, 28, body), getStatisticsAnalytics({ ...initial, updatedAt: start + 2 * day }, {}, 28, body), 'Completion latency cannot change conclusions');
});

test('offset timestamps and exact 90-day boundaries are partitioned by instant', async () => {
  const withOffset = (id: string, age: number, hours: number) => {
    const row = log(id, age);
    row.timestamp = new Date(Date.parse(row.timestamp) + hours * 3600000).toISOString().replace('Z', `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`);
    return row;
  };
  const f = fixture([withOffset('recent-offset', 89.9, -12), withOffset('archive-offset', 90.1, 14), withOffset('latest-offset', 0, 14), log('exact', 90)]);
  try {
    await f.ready(); const value = f.values.at(-1)!;
    assert.deepEqual(value.recentLogs.map(row => row.id), ['latest-offset', 'recent-offset', 'exact']);
    assert.deepEqual(value.history.map(row => row.id), ['archive-offset']);
    assert.equal(value.totalWorkouts, 4);
  } finally { f.stop(); f.store.reset(); }
});
