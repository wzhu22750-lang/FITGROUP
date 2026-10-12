import { performance } from 'node:perf_hooks';
import { supabase } from '../src/lib/supabase';
import { subscribeToUserWorkoutLogs } from '../src/api';
import { calculateFullWorkoutAnalytics } from '../src/utils/workoutAnalytics';
globalThis.fetch = async () => { throw new Error('Unexpected network call in controlled benchmark'); };
const ref = new Date('2026-10-12T12:00:00Z');
const rows = Array.from({ length: 5000 }, (_, i) => ({
  id: `log-${String(i).padStart(6, '0')}`, user_id: 'bench', user_name: '', user_photo: '',
  created_at: new Date(ref.getTime() - (i < 120 ? i % 84 : 100 + i % 1500) * 86400000).toISOString(),
  category: 'Chest', exercises: [{ id: 'e1', name: '卧推', type: 'strength', weight: 40 + i % 61, sets: 3, reps: 8 }],
}));
let requests = 0, bytes = 0;
let changes: (payload: unknown) => void = () => {};
(supabase as any).channel = () => { const listeners: Array<{ event: string; callback: typeof changes }> = []; const ch = { on: (_: unknown, filter: {event: string}, callback: typeof changes) => { listeners.push({event:filter.event,callback}); changes = (payload: any) => listeners.forEach(l => { if (l.event === '*' || l.event === payload.eventType) l.callback(payload); }); return ch; }, subscribe: () => ch }; return ch; };
supabase.removeChannel = async () => 'ok';
supabase.from = (() => {
  let columns = '*';
  let since = '', before = '', cursor = '', end = '', limit = 400;
  const q: any = { select: (value: string) => { columns = value; return q; }, eq: () => q, order: () => q, abortSignal: () => q,
    gte: (_: string, value: string) => { since = value; return q; }, lte: (_: string, value: string) => { end = value; return q; },
    lt: (key: string, value: string) => { if (key === 'id') cursor = value; else before = value; return q; }, limit: (n: number) => { limit = n; return q; },
    then: (resolve: any, reject: any) => {
      const data = rows.filter(r => (!since || r.created_at >= since) && (!before || r.created_at < before) && (!cursor || r.id < cursor) && r.created_at <= end)
        .sort((a, b) => b.id.localeCompare(a.id)).slice(0, limit).map(row => columns === '*' ? row : Object.fromEntries(columns.split(',').map(key => [key, (row as any)[key]])));
      requests++; bytes += Buffer.byteLength(JSON.stringify(data));
      return new Promise(r => setTimeout(() => r({ data, error: null }), 5)).then(resolve, reject);
    },
  }; return q;
}) as any;
const waitFor = async (predicate: () => boolean) => { while (!predicate()) await new Promise(r => setTimeout(r, 1)); };
const mode = process.argv.includes('--optimized') ? 'optimized' : 'baseline';
const { subscribeToStatisticsData, statisticsDataStore } = mode === 'optimized' ? await import('../src/api') : { subscribeToStatisticsData: null, statisticsDataStore: null } as any;
const { getStatisticsAnalysisLogs, getStatisticsAnalytics } = mode === 'optimized' ? await import('../src/utils/statisticsData') : { getStatisticsAnalysisLogs: null } as any;
const body = { sex: 'male' as const, bodyweightKg: 75 };
let deliveries = 0;
let snapshot: any;
async function enter() {
  const start = performance.now(); let firstMs = 0, ready = false;
  const unsubscribe = mode === 'baseline' ? subscribeToUserWorkoutLogs('bench', logs => {
    deliveries++; snapshot = { logs }; if (!firstMs) calculateFullWorkoutAnalytics(logs, {}, 28, body, ref); if (!firstMs) firstMs = performance.now() - start; ready = true;
  }, error => { throw error; }, { mode: 'statistics', since: new Date(ref.getTime() - 90 * 86400000).toISOString() }) : subscribeToStatisticsData('bench', (s: any) => {
    deliveries++; snapshot = s; getStatisticsAnalytics(s, {}, 28, body); if (!firstMs) firstMs = performance.now() - start; ready = s.historyReady;
  }, (error: Error) => { throw error; });
  await waitFor(() => ready);
  await new Promise(r => setTimeout(r, 0));
  const fullMs = performance.now() - start;
  return { firstMs: +firstMs.toFixed(2), fullMs: +fullMs.toFixed(2), unsubscribe };
}
const first = await enter(); first.unsubscribe();
const afterCold = { requests, bytes };
const warm = await enter(); const afterWarm = { requests: requests - afterCold.requests, bytes: bytes - afterCold.bytes };
const beforeSocial = requests;
const beforeDeliveries = deliveries;
changes({ eventType: 'UPDATE', new: { ...rows[1], likes_count: 1, comments_count: 1 }, old: { id: rows[1].id } });
if (mode === 'baseline') await waitFor(() => deliveries > beforeDeliveries);
else await new Promise(r => setTimeout(r, 200));
const social = requests - beforeSocial;
const logs = mode === 'baseline' ? snapshot.logs : getStatisticsAnalysisLogs(snapshot, body);
for (let i = 0; i < 5; i++) calculateFullWorkoutAnalytics(logs, {}, 28, body, ref);
const timings = Array.from({ length: 30 }, () => { const t = performance.now(); calculateFullWorkoutAnalytics(logs, {}, 28, body, ref); return performance.now() - t; }).sort((a, b) => a - b);
warm.unsubscribe(); statisticsDataStore?.reset();
console.log('BENCHMARK ' + JSON.stringify({ mode, fixtureRows: 5000, simulatedPageLatencyMs: 5, cold: { ...afterCold, firstMs: first.firstMs, fullMs: first.fullMs }, warm: { ...afterWarm, firstMs: warm.firstMs, fullMs: warm.fullMs }, socialRequests: social, analysisRows: logs.length, calculationMedianMs: +timings[15].toFixed(2) }));
