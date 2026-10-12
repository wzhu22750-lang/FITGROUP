import assert from 'node:assert/strict';
import {supabase} from '../src/lib/supabase';
import {statisticsDataStore,subscribeToStatisticsData} from '../src/api';
import type {StatisticsSnapshot} from '../src/utils/statisticsData';
globalThis.fetch=async()=>{throw Error('Unexpected network in subscription fixture');};
const row=(id:string,days:number,weight:number)=>({id,user_id:'owner',created_at:new Date(Date.now()-days*86400000).toISOString(),category:'Chest',exercises:[{id:'e',name:'卧推',type:'strength',sets:3,reps:8,weight}]});
let rows=[row('recent',2,60),row('old',200,120)],reads=0;
const registrations:Array<{filter:any;callback:(event:any)=>void}>=[];let status:(value:string)=>void=()=>{};
const original={from:supabase.from,channel:supabase.channel,removeChannel:supabase.removeChannel};
(supabase as any).from=()=>{let since='',before='',cursor='',limit=400;const q:any={select:()=>q,eq:()=>q,order:()=>q,lte:()=>q,abortSignal:()=>q,
 gte:(_:string,v:string)=>{since=v;return q;},lt:(key:string,v:string)=>{if(key==='id')cursor=v;else before=v;return q;},limit:(v:number)=>{limit=v;return q;},
 then:(resolve:any,reject:any)=>{reads++;return Promise.resolve({data:rows.filter(r=>(!since||r.created_at>=since)&&(!before||r.created_at<before)&&(!cursor||r.id<cursor)).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,limit),error:null}).then(resolve,reject);}};return q;};
(supabase as any).channel=()=>{const ch={on:(_:string,filter:any,callback:any)=>{registrations.push({filter,callback});return ch;},subscribe:(cb:any)=>{status=cb;return ch;}};return ch;};
supabase.removeChannel=async()=>'ok';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(test:()=>boolean)=>{for(let i=0;i<150;i++){if(test())return;await sleep(5);}assert.fail('Subscription fixture timeout');};
try{
 statisticsDataStore.reset();const snapshots:StatisticsSnapshot[]=[];
 const stop=subscribeToStatisticsData('owner',s=>snapshots.push(s));
 await waitFor(()=>snapshots.at(-1)?.historyReady===true);
 assert.equal(registrations.length,3);
 assert.ok(registrations.every(r=>r.filter.filter?.endsWith('eq.owner')),'All topics are scoped to this user');
 assert.ok(!registrations.some(r=>r.filter.event==='DELETE'),'No subscription to unfiltered private delete IDs');
 const workout=registrations.find(r=>r.filter.table==='workout_logs'&&r.filter.event==='UPDATE')!.callback;
 const profile=registrations.find(r=>r.filter.table==='profiles')!.callback;
 profile({new:{total_workouts:2}});await sleep(160);await waitFor(()=>snapshots.at(-1)?.historyReady===true);
 const count=reads;
 const reordered=[{weight:60,reps:8,sets:3,type:'strength',name:'卧推',id:'e'}];
 workout({eventType:'UPDATE',new:{...rows[0],exercises:reordered,likes_count:5,comments_count:1},old:{id:'recent'}});
 await sleep(150);assert.equal(reads,count,'Social counters and JSON key order do not refresh stats');
 rows=[{...rows[0],exercises:[{...rows[0].exercises[0],weight:65}]},rows[1]];
 workout({eventType:'UPDATE',new:rows[0],old:{id:'recent'}});await waitFor(()=>snapshots.at(-1)!.recentLogs[0].exercises[0].weight===65);
 assert.equal(reads,count+2,'Known recent update reuses history; one data page and one empty page');
 rows=[rows[0]];profile({new:{total_workouts:1}});await waitFor(()=>snapshots.at(-1)?.totalWorkouts===1);
 assert.equal(snapshots.at(-1)!.history.length,0,'Own profile decrement invalidates deleted PR history');
 const beforeReconnect=reads;status('CHANNEL_ERROR');status('SUBSCRIBED');await waitFor(()=>reads>beforeReconnect);
 await waitFor(()=>snapshots.at(-1)?.historyReady===true && !snapshots.at(-1)?.historyRefreshing);
 const beforeSecondReconnect=reads;status('CHANNEL_ERROR');status('SUBSCRIBED');await waitFor(()=>reads>beforeSecondReconnect);
 stop();statisticsDataStore.reset();
 console.log('PASS production statistics subscription: user-scoped channels, social filtering, semantic JSON comparison, cached recent edits, own delete detection and reconnect invalidation');
}finally{Object.assign(supabase,original);statisticsDataStore.reset();}
