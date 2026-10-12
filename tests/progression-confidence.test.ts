import assert from 'node:assert/strict';
import { computeExerciseProgression, generateDeterministicTrainingInsights, computeWeeklyTrainingTrends } from '../src/utils/progressAnalytics';
import { calculateFullWorkoutAnalytics } from '../src/utils/workoutAnalytics';
import type { WorkoutLog } from '../src/types';
const now = new Date('2026-10-12T12:00:00Z');
const log = (id: string, days: number, weight: number, reps=8, name='卧推'): WorkoutLog => ({ id, userId:'u', userName:'', userPhoto:'', timestamp:new Date(+now-days*86400000).toISOString(), category:'Chest', exercises:[{id:id+'e',name,type:'strength',weight,sets:3,reps}],likesCount:0,commentsCount:0 });
const body = {sex:'male' as const,bodyweightKg:75};
const compare = (logs:WorkoutLog[]) => computeExerciseProgression(logs,28,now,body)[0];
assert.equal(compare([log('c',2,80),log('b',35,60)]).verdict,'possible_progress');
assert.equal(compare([log('c1',2,65),log('c2',7,65),log('b1',35,60),log('b2',42,60)]).verdict,'clear_progress');
assert.equal(compare([log('c1',2,60),log('c2',7,60),log('b1',35,60),log('b2',42,60)]).verdict,'stable');
assert.equal(compare([log('c1',2,50),log('c2',7,50),log('b1',35,60),log('b2',42,60)]).verdict,'regressed');
assert.equal(compare([log('c1',2,60),log('b1',35,60)]).verdict,'insufficient_evidence');
assert.equal(compare([log('c1',2,80),log('c2',2,80),log('b1',35,60),log('b2',35,60)]).verdict,'possible_progress','Same-day repetitions do not create independent evidence');
assert.equal(compare([log('c1',2,60),log('c2',7,60),log('spike',9,100),log('b1',35,60),log('b2',42,60)]).verdict,'possible_progress','One spike cannot confirm progress');
assert.equal(compare([log('c1',2,80,12),log('c2',7,80,12),log('b1',35,60,12),log('b2',42,60,12)]).verdict,'possible_progress','Low-confidence rep ranges cannot confirm progress');
assert.equal(compare([log('c1',2,10,8,'引体向上'),log('c2',7,10,8,'引体向上'),log('b1',35,0,8,'引体向上'),log('b2',42,0,8,'引体向上')]).verdict,'possible_progress','Historical bodyweight is not recorded, so current bodyweight cannot confirm a two-period strength change');
const evidence=compare([log('c1',2,65),log('c2',7,65),log('b1',35,60),log('b2',42,60)]);
assert.deepEqual(new Set(evidence.sourceLogIds),new Set(['c1','c2','b1','b2']));
for(const logs of [[log('c',2,80),log('b',35,60)], [log('only',2,60)]]) {
  const insights=generateDeterministicTrainingInsights(calculateFullWorkoutAnalytics(logs,{},28,body,now),computeExerciseProgression(logs,28,now,body),computeWeeklyTrainingTrends(logs,4,now,body));
  assert.ok(!JSON.stringify(insights).includes('实质性超负荷'));
  assert.ok(!insights.some(item=>item.interpretation.includes('肌肥大成效')));
}
console.log('PASS progression confidence: five verdicts, independent days, isolated spikes, rep reliability, missing baselines and traceable record IDs');

const {bodyContextFromProfile,resolveBodyContext}=await import('../src/utils/strengthAssessment');
const partialContext=bodyContextFromProfile({sex:'female'});
assert.equal(resolveBodyContext(partialContext).assessmentMode,'partial','Assumed bodyweight must remain disclosed through the profile adapter');
const unknownSex=bodyContextFromProfile({bodyweightKg:75});
assert.equal(resolveBodyContext(unknownSex).sexAssumed,true,'Assumed sex cannot become personalized metadata');
console.log('PASS partial profile assumptions stay distinct from personalized strength evidence');
