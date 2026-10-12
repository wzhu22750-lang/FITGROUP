import assert from 'node:assert/strict';
import { WorkoutCategory, type WorkoutLog, type Exercise } from '../src/types';
import { calculateFullWorkoutAnalytics, categoryMetricState } from '../src/utils/workoutAnalytics';
import { computeExerciseProgression, computeWeeklyTrainingTrends } from '../src/utils/progressAnalytics';

const now = new Date('2026-10-12T12:00:00.000Z');
const exercise = (name: string, weight: number, reps = 8, sets = 3): Exercise => ({ id: name, name, type: 'strength', weight, reps, sets });
const log = (id: string, daysAgo: number, exercises: Exercise[]): WorkoutLog => ({
  id, userId: 'u1', userName: 'Test', userPhoto: '', category: 'Back',
  timestamp: new Date(now.getTime() - daysAgo * 86400000).toISOString(), exercises, likesCount: 0, commentsCount: 0,
});
const body = { sex: 'male' as const, bodyweightKg: 85 };
const cases: Array<[string, () => void]> = [
  ['assisted bodyweight progression retains zero and negative external loads', () => {
    const logs = [log('current', 2, [exercise('引体向上', 0)]), log('baseline', 35, [exercise('引体向上', -10)])];
    const full = calculateFullWorkoutAnalytics(logs, {}, 28, body, now);
    const progress = computeExerciseProgression(logs, 28, now, body);
    assert.equal(progress[0]?.status, 'progressed');
    assert.equal(progress[0]?.currentBest?.estimated1RM, full.categorizedPrs[0]?.estimated1RM);
  }],
  ['high reps and implausible loads never create progression evidence', () => {
    assert.equal(computeExerciseProgression([log('high', 2, [exercise('卧推', 60, 30)])], 28, now).length, 0);
    assert.equal(computeExerciseProgression([log('bad', 2, [exercise('卧推', 900)])], 28, now).length, 0);
  }],
  ['future and invalid dates never create historical strength PRs', () => {
    const invalid = log('invalid', 1, [exercise('卧推', 120)]); invalid.timestamp = 'invalid';
    assert.equal(calculateFullWorkoutAnalytics([invalid, log('future', -1, [exercise('卧推', 130)])], {}, 28, body, now).categorizedPrs.length, 0);
  }],
  ['weekly tonnage equals analytics for dumbbell and assisted bodyweight', () => {
    const logs = [log('valid', 1, [exercise('哑铃卧推', 20), exercise('引体向上', -10)])];
    const full = calculateFullWorkoutAnalytics(logs, {}, 28, body, now);
    const trend = computeWeeklyTrainingTrends(logs, 4, now, body);
    assert.equal(trend.buckets.reduce((s, b) => s + b.tonnageKg, 0), Object.values(full.categoryDetails).reduce((s, d) => s + d.totalVolumeKg, 0));
  }],
  ['nonfinite sets cannot poison any score or volume', () => {
    const logs = [log('bad', 1, [exercise('卧推', 60, 8, Infinity)])];
    const full = calculateFullWorkoutAnalytics(logs, {}, 28, body, now);
    assert.equal(full.recentSetsCount, 0);
    assert.ok(Object.values(full.categoryDetails).every(d => Number.isFinite(d.trainingScore)));
    assert.equal(computeWeeklyTrainingTrends(logs, 4, now).totalSets, 0);
  }],
  ['weekly keys are unique across months', () => {
    const trend = computeWeeklyTrainingTrends([], 12, now);
    assert.equal(new Set(trend.buckets.map(b => b.weekKey)).size, 12);
  }],
  ['empty submuscles have zero component scores', () => {
    const full = calculateFullWorkoutAnalytics([], {}, 28, body, now);
    assert.ok(full.categoryDetails[WorkoutCategory.Legs].subMuscleScores?.every(d => d.score === 0 && d.progressionScore === 0));
  }],
  ['cardio volume follows selected window without changing capacity or resistance sets', () => {
    const cardio: Exercise = { id: 'run', name: '户外跑步', type: 'cardio', duration: 30 };
    const logs = [log('strength', 2, [exercise('卧推', 60)]), log('run', 2, [cardio]), log('olderRun', 14, [cardio])];
    const week = calculateFullWorkoutAnalytics(logs, {}, 7, body, now);
    const month = calculateFullWorkoutAnalytics(logs, {}, 28, body, now);
    assert.equal(week.recentSetsCount, 3);
    assert.equal(month.recentSetsCount, 3);
    assert.equal(week.categoryDetails.Cardio.cardioScore, month.categoryDetails.Cardio.cardioScore);
    assert.equal(week.categoryDetails.Cardio.cardioVolumeMetrics?.effectiveMinutes, 30);
    assert.equal(month.categoryDetails.Cardio.cardioVolumeMetrics?.effectiveMinutes, 60);
    assert.equal(computeWeeklyTrainingTrends(logs, 4, now, body).totalSets, month.recentSetsCount);
    assert.equal(month.volumeDistribution.find(d => d.category === WorkoutCategory.Chest)?.percentage, 100);
  }],
  ['equal PRs and alias order never manufacture outliers or choose a lower legacy PR', () => {
    const logs = [log('a', 2, [exercise('卧推', 60)]), log('b', 4, [exercise('卧推', 60)])];
    const full = calculateFullWorkoutAnalytics(logs, {}, 28, body, now);
    assert.equal(full.categorizedPrs[0].suspectedOutlier, false);
    const legacy = calculateFullWorkoutAnalytics([], { '卧推': 120, '杠铃平板卧推': 100 }, 28, body, now);
    const reversed = calculateFullWorkoutAnalytics([], { '杠铃平板卧推': 100, '卧推': 120 }, 28, body, now);
    assert.equal(legacy.categorizedPrs[0].weight, 120);
    assert.deepEqual(legacy, reversed);
    assert.equal(calculateFullWorkoutAnalytics([], { '卧推': 900 }, 28, body, now).categorizedPrs.length, 0);
  }],
  ['measured zero, missing evidence and inapplicable cardio are distinct', () => {
    const full = calculateFullWorkoutAnalytics([log('tiny', 2, [exercise('卧推', 0.1, 1)])], {}, 28, body, now);
    assert.equal(full.categoryDetails.Chest.strengthScore, 0);
    assert.equal(categoryMetricState(full.categoryDetails.Chest, 'strength'), 'measured');
    assert.equal(categoryMetricState(full.categoryDetails.Legs, 'strength'), 'no_data');
    assert.equal(categoryMetricState(full.categoryDetails.Cardio, 'strength'), 'not_applicable');
  }],
  ['partial current week cannot generate a false decreasing trend', () => {
    const monday = new Date(2026, 9, 12, 12);
    const logs = [1, 2, 3].map(weeksAgo => {
      const item = log(`week-${weeksAgo}`, 1, [exercise('卧推', 60)]);
      const time = new Date(monday); time.setDate(time.getDate() - weeksAgo * 7 + 2); item.timestamp = time.toISOString(); return item;
    });
    assert.equal(computeWeeklyTrainingTrends(logs, 4, monday).trendDirection, 'stable');
  }],
  ['local dates agree across strength, cardio and trends, including DST', () => {
    const priorTZ = process.env.TZ;
    try {
      for (const tz of ['Asia/Shanghai', 'America/New_York']) {
        process.env.TZ = tz;
        const localNow = new Date(2026, 10, 2, 12);
        const timestamps = [new Date(2026, 10, 1, 0, 30), new Date(2026, 10, 1, 23, 30)];
        const logs = timestamps.map((time, i) => ({ ...log(`tz-${i}`, 1, [exercise('卧推', 60), { id: 'run', name: '户外跑步', type: 'cardio' as const, duration: 30 }]), timestamp: time.toISOString() }));
        const full = calculateFullWorkoutAnalytics(logs, {}, 28, body, localNow);
        assert.equal(full.categoryDetails.Cardio.cardioMetrics?.activeDays, 1);
        assert.equal(computeWeeklyTrainingTrends(logs, 4, localNow, body).buckets.reduce((s, b) => s + b.activeDays, 0), 1);
        assert.equal(full.categoryDetails.Chest.subMuscleScores?.[0].weeklyFrequency, 0.3);
        assert.deepEqual(full, calculateFullWorkoutAnalytics([...logs].reverse(), {}, 28, body, localNow));
      }
    } finally { if (priorTZ === undefined) delete process.env.TZ; else process.env.TZ = priorTZ; }
  }],

];
let failures = 0;
for (const [name, check] of cases) {
  try { check(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}:`, (error as Error).message); }
}
assert.equal(failures, 0, 'Statistics boundary regressions');
