import assert from 'node:assert/strict';
import { createStatisticsDataStore, getStatisticsAnalysisLogs, type StatisticsChange, type StatisticsSnapshot } from '../src/utils/statisticsData';
import { calculateFullWorkoutAnalytics } from '../src/utils/workoutAnalytics';
import type { WorkoutLog } from '../src/types';
const ref = new Date('2026-10-12T12:00:00Z'); let clock = ref.getTime();
const makeLog = (id: string, daysAgo: number, weight = 60): WorkoutLog => ({ id, userId: 'A', userName: '', userPhoto: '', timestamp: new Date(clock - daysAgo * 86400000).toISOString(), category: 'Chest', exercises: [{ id: id+'e', name: '卧推', type: 'strength', sets: 3, reps: 8, weight }], likesCount: 0, commentsCount: 0 });
let rows = [makeLog('new', 2), ...Array.from({length: 5000}, (_, i) => makeLog(`old${i}`, 100+i%120, 50+i%50))];
let changes: (e: StatisticsChange) => void = () => {}; let reconnect = () => {};
let requests = 0, subscriptions = 0, fail = false, hang = false;
const signals: AbortSignal[] = [];
const store = createStatisticsDataStore({ now: () => clock, ttlMs: 100, historyTtlMs: 300,
  fetch: async (uid, options) => { requests++; signals.push(options.signal);
    if (hang) await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve(), {once: true}));
    if (fail) throw new Error('offline');
    const copy = rows.filter(log => uid === 'A' && (!options.since || log.timestamp >= options.since) && (!options.before || log.timestamp < options.before));
    await new Promise(resolve => setTimeout(resolve, options.before ? 15 : 1)); return copy;
  }, listen: (_uid, change, connected) => { subscriptions++; changes = change; reconnect = connected; return () => { subscriptions--; }; },
});
const waitFor = async (test: () => boolean) => { for(let i=0;i<300;i++){ if(test())return; await new Promise(r=>setTimeout(r,2)); } assert.fail('Cache timeout'); };
const values: StatisticsSnapshot[] = []; const errors: Error[] = [];
const a = store.subscribe('A', value => values.push(value), error => errors.push(error));
const duplicate: StatisticsSnapshot[] = []; const b = store.subscribe('A', value => duplicate.push(value));
await waitFor(() => values.at(-1)?.historyReady === true);
assert.equal(requests, 2); assert.equal(subscriptions, 1);
assert.equal(values[0].historyReady, false); assert.equal(values[0].recentLogs.length, 1);
assert.equal(values.at(-1)!.totalWorkouts, 5001);
const snapshot = values.at(-1)!;
const body = { sex: 'male' as const, bodyweightKg: 75 };
const compact = getStatisticsAnalysisLogs(snapshot, body);
assert.ok(compact.length < 10);
assert.deepEqual(calculateFullWorkoutAnalytics(compact, {}, 28, body, ref).categorizedPrs, calculateFullWorkoutAnalytics(snapshot.logs, {}, 28, body, ref).categorizedPrs);
assert.equal(getStatisticsAnalysisLogs(snapshot, body), compact);
a(); assert.equal(subscriptions, 1); b(); assert.equal(subscriptions, 0);
const countBeforeWarm = requests;
const warm = store.subscribe('A', value => values.push(value));
assert.equal(requests, countBeforeWarm, 'Fresh cache remount performs no reads');
changes({eventType:'UPDATE',new:{id:'new', created_at:rows[0].timestamp, category:rows[0].category, exercises:rows[0].exercises, likes_count:2, user_name:'renamed'}});
await new Promise(r=>setTimeout(r,150)); assert.equal(requests,countBeforeWarm);
rows = [...rows, makeLog('inserted', 1)]; changes({eventType:'INSERT',new:{id:'inserted',created_at:rows.at(-1)!.timestamp}});
await waitFor(()=>values.at(-1)?.totalWorkouts===5002); assert.equal(requests,countBeforeWarm+1);
clock += 101; warm();
const expired = store.subscribe('A', value=>values.push(value), error=>errors.push(error));
await waitFor(()=>requests===countBeforeWarm+2); await waitFor(()=>values.at(-1)?.updatedAt===clock);
clock += 301; fail=true; reconnect(); await waitFor(()=>errors.length===1);
assert.equal(values.at(-1)!.recentLogs.length,2, 'Offline keeps last good data');
assert.equal(values.at(-1)!.historyReady,true,'Offline history refresh preserves the verified historical PR cache');
fail=false; await store.retry('A'); assert.equal(values.at(-1)!.historyReady,true);
const beforeInvalidation = requests; store.invalidate('A'); await waitFor(()=>requests>=beforeInvalidation+2);
await waitFor(()=>values.at(-1)!.historyReady && !values.at(-1)!.historyRefreshing);
expired();
hang=true; clock += 1000; const lateValues: StatisticsSnapshot[]=[];
const slow = store.subscribe('A', value=>lateValues.push(value)); await waitFor(()=>signals.at(-1)!=null);
const active = signals.at(-1)!; store.reset(); assert.equal(active.aborted,true); slow(); hang=false;
const B: StatisticsSnapshot[]=[]; const other=store.subscribe('B',value=>B.push(value)); await waitFor(()=>B.at(-1)?.historyReady===true);
assert.equal(B.at(-1)!.logs.length,0,'Account switch cannot publish another user cache'); other(); store.reset();
console.log('PASS statistics cache: 5000-row history, progressive loading, dedup/refcount, warm remount, social filtering, expiry, reconnect, offline recovery, invalidation, cancellation, account isolation and evidence equivalence');

// Differential check: compression must retain historical bodyweight PRs and all
// excluded records for review, while current-period volume remains untouched.
for (const bw of [55, 85, 120]) {
  const raw: WorkoutLog[] = Array.from({length:100}, (_, i) => ({...makeLog(`history${i}`,100+i, i%7===0?900:40+i%40),exercises:[
    {id:`b${i}`,name:'卧推',type:'strength',weight:i%7===0?900:40+i%40,sets:3,reps:1+i%12},
    {id:`p${i}`,name:'引体向上',type:'strength',weight:-20+i%60,sets:3,reps:1+i%12},
  ]}));
  const current = [makeLog('recent',2)];
  const input:StatisticsSnapshot = {recentLogs:current,history:raw,logs:[...current,...raw],historyReady:true,totalWorkouts:101,updatedAt:+ref};
  const ctx={sex:'male' as const,bodyweightKg:bw};
  const all=calculateFullWorkoutAnalytics(input.logs,{},28,ctx,ref);
  const reduced=calculateFullWorkoutAnalytics(getStatisticsAnalysisLogs(input,ctx),{},28,ctx,ref);
  assert.deepEqual(reduced.categorizedPrs,all.categorizedPrs);
  assert.deepEqual(reduced.categoryDetails,all.categoryDetails);
}
console.log('PASS historical evidence compression across bodyweights, assisted loads, mixed rep ranges and multiple excluded records');

// Exercise the production timeout infrastructure inside the progressive store.
const { readRequest } = await import('../src/utils/request');
let stuck=true;const timeoutErrors:Error[]=[];const timeoutValues:StatisticsSnapshot[]=[];
const timeoutStore=createStatisticsDataStore({listen:()=>()=>{},fetch:(uid,options)=>readRequest('statistics-timeout-test',async signal=>{
  if(stuck) await new Promise<void>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  return [];
},{signal:options.signal,timeoutMs:10})});
const stopTimeout=timeoutStore.subscribe('timeout',value=>timeoutValues.push(value),error=>timeoutErrors.push(error));
await waitFor(()=>timeoutErrors.length===1);assert.equal(timeoutErrors[0].name,'TimeoutError');assert.equal(timeoutValues.length,0);
stuck=false;await timeoutStore.retry('timeout');assert.equal(timeoutValues.at(-1)!.historyReady,true);stopTimeout();timeoutStore.reset();
console.log('PASS bounded statistics timeout and explicit retry recovery');
