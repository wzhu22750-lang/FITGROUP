import assert from 'node:assert/strict';
import { recentTrainingDays, summarizeTraining } from '../src/utils/trainingPresentation';
import type { WorkoutLog } from '../src/types';

assert.deepEqual(summarizeTraining([]), { actions: 0, sets: 0, cardioMinutes: 0, distance: 0 });
assert.deepEqual(summarizeTraining([
  { id: 'a', name: '卧推', type: 'strength', sets: 4, reps: 10, weight: 60 },
  { id: 'b', name: '跑步', type: 'cardio', duration: 25, distance: 3.5 },
  { id: 'c', name: '旧数据', type: 'strength', sets: -1 },
  { id: 'd', name: '无效数据', type: 'cardio', duration: NaN, distance: Infinity },
]), { actions: 4, sets: 4, cardioMinutes: 25, distance: 3.5 });

const now = new Date(2026, 9, 6, 12);
const makeLog = (timestamp: string): WorkoutLog => ({ id: timestamp, timestamp, userId: 'test', userName: 'Test', userPhoto: '', category: 'Chest', exercises: [], likesCount: 0, commentsCount: 0 });
const logs = [
  new Date(2026, 8, 30, 0), // first included local day
  new Date(2026, 8, 30, 23), // two sessions, one active day
  new Date(2026, 8, 29, 23, 59), // excluded
  new Date(2026, 9, 6, 11),
  new Date(2026, 9, 6, 13), // future time, excluded
].map(date => makeLog(date.toISOString()));
logs.push(makeLog('invalid'));
const days = recentTrainingDays(logs, now);
assert.equal(days.length, 7);
assert.deepEqual(days.map(day => day.count), [2, 0, 0, 0, 0, 0, 1]);
assert.equal(days.filter(day => day.count > 0).length, 2);
assert.equal(days[6].date.getDate(), 6);
assert.ok(recentTrainingDays([], now).every(day => day.count === 0));
console.log('PASS training presentation: mixed metrics, invalid data, local dates, future exclusion, empty state');
