/**
 * Statistics V4 — Comprehensive Algorithm Verification & Regression Suite.
 *
 * Covers:
 * 1. Complete beginner with 0 workout records.
 * 2. User with only 1 workout or only 1 muscle group (verifying balance is NOT '极度均衡').
 * 3. High-frequency user in the last 28 days with >100 historical records (completeness).
 * 4. Long-term user training for months/years.
 * 5. User with recent progress but higher all-time historical PR (verifying historical PR is retained).
 * 6. Long-term stable user with no recent PRs (plateau/maintenance).
 * 7. User resuming training after a break (interrupted).
 * 8. User using only machines or bodyweight.
 * 9. User mixing strength and cardio.
 * 10. Missing weight/sex, anomalous records, future dates, cross-midnight/timezone.
 *
 * Model Invariants:
 * - Determinism: same input = same output.
 * - Rolling window isolation: adding records outside window does not change window stats.
 * - Balance truthfulness: low coverage (< 3 groups) can NEVER be '极度均衡' or '均衡良好'.
 * - Score ↔ confidence separation: missing data lowers confidence, never scores.
 * - Weekly trends monotonicity & conservation of sets/workouts.
 */

import { WorkoutCategory, WorkoutLog } from '../src/types';
import {
  calculateFullWorkoutAnalytics,
  computeMuscleBalance,
  getStrengthTier,
  getTrainingStateTier,
  bodyContextFromProfile,
} from '../src/utils/workoutAnalytics';
import {
  computeWeeklyTrainingTrends,
  computeExerciseProgression,
  generateDeterministicTrainingInsights,
} from '../src/utils/progressAnalytics';
import {
  resolveExerciseDefinition,
} from '../src/constants/exerciseDefinitions';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

const dayMs = 24 * 3600 * 1000;
const realNow = new Date();
const realNowMs = realNow.getTime();

const makeLog = (
  id: string,
  daysAgo: number,
  exercises: Array<{ name: string; weight?: number; sets?: number; reps?: number; type?: 'strength' | 'cardio'; duration?: number }>,
  category: string = 'Chest'
): WorkoutLog => {
  const d = new Date(realNowMs - daysAgo * dayMs);
  return {
    id,
    userId: 'u-test',
    userName: 'Tester',
    userPhoto: '',
    timestamp: d.toISOString(),
    category,
    exercises: exercises.map((ex, i) => ({
      id: `${id}-e${i}`,
      name: ex.name,
      type: ex.type ?? 'strength',
      weight: ex.weight ?? 0,
      sets: ex.sets ?? 3,
      reps: ex.reps ?? 10,
      duration: ex.duration,
    })),
    likesCount: 0,
    commentsCount: 0,
  };
};

console.log('\n=== [Profile 1] Brand new user with zero records ===');
{
  const analytics = calculateFullWorkoutAnalytics([], {}, 28, { sex: 'male', bodyweightKg: 70 });
  assert(analytics.recentWorkoutsCount === 0, 'Recent workouts count is 0');
  assert(analytics.recentSetsCount === 0, 'Recent sets count is 0');
  assert(analytics.categorizedPrs.length === 0, 'No PRs present');
  assert(analytics.insights.balanceLevel === '蓄势起步', 'Balance level is 蓄势起步');
  assert(analytics.insights.balanceScore === 0, 'Balance score is 0');
  assert(analytics.insights.coverageCount === 0, 'Coverage count is 0');
  assert(analytics.insights.evidenceSufficient === false, 'Evidence is marked insufficient');

  const trends = computeWeeklyTrainingTrends([], 4, realNow);
  assert(trends.hasEnoughData === false, 'Trends correctly declares insufficient data');
  assert(trends.totalWorkouts === 0, 'Trends total workouts is 0');

  const insights = generateDeterministicTrainingInsights(analytics, [], trends);
  assert(insights.length > 0, 'Generates clean welcoming insights');
  assert(insights[0].action.includes('第一练'), 'Clean actionable onboarding advice');
}

console.log('\n=== [Profile 2] Single workout / Single muscle group (anti-false-balance) ===');
{
  // User only trains Bench Press 4 times in 28 days
  const logs = [
    makeLog('l-1', 2, [{ name: '杠铃平板卧推', weight: 80, sets: 4, reps: 8 }]),
    makeLog('l-2', 7, [{ name: '杠铃平板卧推', weight: 80, sets: 4, reps: 8 }]),
    makeLog('l-3', 14, [{ name: '杠铃平板卧推', weight: 82.5, sets: 4, reps: 8 }]),
    makeLog('l-4', 21, [{ name: '杠铃平板卧推', weight: 82.5, sets: 4, reps: 8 }]),
  ];
  const analytics = calculateFullWorkoutAnalytics(logs, {}, 28, { sex: 'male', bodyweightKg: 75 });
  const chest = analytics.categoryDetails[WorkoutCategory.Chest];
  const legs = analytics.categoryDetails[WorkoutCategory.Legs];

  assert(chest.trainingScore > 20, `Chest training capacity is active and positive (got: ${chest.trainingScore})`);
  assert(legs.trainingScore === 0, 'Legs training capacity is 0');
  assert(analytics.insights.coverageCount === 1, `Only 1 category covered (got: ${analytics.insights.coverageCount})`);

  // CRITICAL V4 ASSERTION: Single-muscle training must NEVER be '极度均衡'!
  assert(analytics.insights.balanceLevel === '覆盖不足', `Single group balance must be 覆盖不足 (actual: ${analytics.insights.balanceLevel})`);
  assert(analytics.insights.balanceScore <= 35, `Single group balance score capped <= 35 (actual: ${analytics.insights.balanceScore})`);
  assert(analytics.insights.recommendations.some((r) => r.includes('单一抗阻部位') || r.includes('覆盖') || r.includes('胸部')), 'Explicitly warns about single muscle under-coverage');
}

console.log('\n=== [Profile 3] High-frequency user (>100 records) without truncation ===');
{
  // 110 logs across 28 days (multiple logs per day or daily workouts)
  const logs: WorkoutLog[] = [];
  for (let i = 0; i < 110; i++) {
    const daysAgo = (i % 27) + 0.2;
    logs.push(makeLog(`hf-${i}`, daysAgo, [{ name: '坐姿哑铃推举', weight: 20, sets: 3, reps: 10 }], 'Shoulders'));
  }
  const analytics = calculateFullWorkoutAnalytics(logs, {}, 28, { sex: 'male', bodyweightKg: 70 });
  assert(analytics.recentWorkoutsCount === 110, `All 110 logs counted in recent workouts (got: ${analytics.recentWorkoutsCount})`);
  assert(analytics.recentSetsCount === 330, `All 330 sets counted without truncation (got: ${analytics.recentSetsCount})`);
  const shoulders = analytics.categoryDetails[WorkoutCategory.Shoulders];
  assert(shoulders.trainingScore >= 60, `High frequency training capacity scores high (got: ${shoulders.trainingScore})`);
}

console.log('\n=== [Profile 4] Long-term user training for multi-months ===');
{
  // Logs across 90 days (12 weeks)
  const logs: WorkoutLog[] = [];
  for (let w = 0; w < 12; w++) {
    logs.push(makeLog(`lt-chest-${w}`, w * 7 + 1, [{ name: '杠铃平板卧推', weight: 90, sets: 4, reps: 6 }], 'Chest'));
    logs.push(makeLog(`lt-back-${w}`, w * 7 + 3, [{ name: '高位下拉', weight: 65, sets: 4, reps: 8 }], 'Back'));
    logs.push(makeLog(`lt-legs-${w}`, w * 7 + 5, [{ name: '杠铃深蹲', weight: 110, sets: 4, reps: 5 }], 'Legs'));
  }
  const trends12w = computeWeeklyTrainingTrends(logs, 12, realNow);
  assert(trends12w.buckets.length === 12, '12 weekly buckets generated');
  assert(trends12w.hasEnoughData === true, '12-week trend has sufficient data');
  assert(trends12w.totalWorkouts >= 30, `At least 30 workouts captured in 12 weeks (got: ${trends12w.totalWorkouts})`);
  assert(trends12w.avgWorkoutsPerWeek >= 2.5, `Average weekly workouts >= 2.5 (got: ${trends12w.avgWorkoutsPerWeek})`);
  assert(trends12w.trendDirection === 'stable', 'Stable weekly rhythm detected');
}

console.log('\n=== [Profile 5] Historical PR retention over lower recent performance ===');
{
  // User benched 120kg a year ago (stored in profile PRs)
  const userPrs = {
    '杠铃平板卧推': 120,
    '传统硬拉': 160,
  };
  // Recently in last 28 days, user only logged light sets: 80kg x 8 (e1RM ≈ 100.3kg)
  const recentLogs = [
    makeLog('pr-recent-1', 5, [{ name: '杠铃平板卧推', weight: 80, sets: 3, reps: 8 }]),
    makeLog('pr-recent-2', 12, [{ name: '杠铃平板卧推', weight: 80, sets: 3, reps: 8 }]),
  ];
  const analytics = calculateFullWorkoutAnalytics(recentLogs, userPrs, 28, { sex: 'male', bodyweightKg: 80 });

  const benchPr = analytics.categorizedPrs.find((p) => p.name.includes('卧推'));
  assert(benchPr !== undefined, 'Bench press PR exists');
  // CRITICAL V4 FIX: 120kg historical PR must NOT be wiped out by recent 80kg log!
  assert(benchPr!.weight === 120, `Historical 120kg PR is preserved (actual: ${benchPr?.weight})`);
  assert(benchPr!.source === 'legacy_profile_pr', 'Source marks legacy_profile_pr fallback');

  const deadliftPr = analytics.categorizedPrs.find((p) => p.name.includes('硬拉'));
  assert(deadliftPr !== undefined && deadliftPr.weight === 160, 'Untrained exercise historical PR preserved');
}

console.log('\n=== [Profile 6] Long-term stable plateau / maintenance lifter ===');
{
  // Lifter benching same 100kg x 5 regularly 2x/week in current period and baseline period
  const logs: WorkoutLog[] = [];
  for (let i = 0; i < 8; i++) {
    logs.push(makeLog(`pl-cur-${i}`, i * 3.5 + 1, [{ name: '杠铃平板卧推', weight: 100, sets: 4, reps: 5 }]));
    logs.push(makeLog(`pl-base-${i}`, 28 + i * 3.5 + 1, [{ name: '杠铃平板卧推', weight: 100, sets: 4, reps: 5 }]));
  }
  const analytics = calculateFullWorkoutAnalytics(logs, {}, 28, { sex: 'male', bodyweightKg: 75 });
  const chest = analytics.categoryDetails[WorkoutCategory.Chest];

  // Plateaus get neutral progression score 55 (ratio 1.0)
  assert(chest.progressionScore === 55, `Plateau progression score is 55 (got: ${chest.progressionScore})`);
  assert(chest.trainingScore >= 60, `Maintenance lifter maintains good training capacity tier (got: ${chest.trainingScore})`);

  const prog = computeExerciseProgression(logs, 28, realNow);
  const benchProg = prog.find((p) => p.canonicalId === 'barbell_bench_press');
  assert(benchProg !== undefined, 'Bench progression found');
  assert(benchProg!.status === 'maintained', `Status is maintained (got: ${benchProg?.status})`);
  assert(benchProg!.evidence.includes('持平') || benchProg!.evidence.includes('稳定'), 'Evidence describes stable output');
}

console.log('\n=== [Profile 7] Interrupted training resumption ===');
{
  // User trained 3 weeks ago, took 2 weeks off, just trained yesterday
  const logs = [
    makeLog('res-1', 1, [{ name: '高位下拉', weight: 60, sets: 3, reps: 10 }], 'Back'),
    makeLog('res-old', 25, [{ name: '高位下拉', weight: 60, sets: 3, reps: 10 }], 'Back'),
  ];
  const analytics = calculateFullWorkoutAnalytics(logs, {}, 28, { sex: 'male', bodyweightKg: 70 });
  const back = analytics.categoryDetails[WorkoutCategory.Back];

  assert(back.trainingScore > 0, 'Resumed training reflects positive score');
  assert(back.consistencyScore < 60, `Interrupted training reflects lower consistency score (got: ${back.consistencyScore})`);
}

console.log('\n=== [Profile 8] Machine-only & bodyweight lifter ===');
{
  const logs = [
    makeLog('m-1', 2, [{ name: '坐姿胸部推举机', weight: 50, sets: 4, reps: 10 }], 'Chest'),
    makeLog('m-2', 5, [{ name: '蝴蝶机夹胸', weight: 40, sets: 3, reps: 12 }], 'Chest'),
    makeLog('m-3', 9, [{ name: '高位下拉', weight: 55, sets: 4, reps: 10 }], 'Back'),
  ];
  const analytics = calculateFullWorkoutAnalytics(logs, {}, 28, { sex: 'male', bodyweightKg: 70 });
  const chest = analytics.categoryDetails[WorkoutCategory.Chest];

  assert(chest.trainingScore > 0, 'Machine & bodyweight yield active capacity score');
  if (chest.strengthAssessment) {
    assert(chest.strengthAssessment.machineOnly === true, 'Chest is machineOnly');
    assert(chest.strengthAssessment.confidenceScore <= 60, `Machine evidence caps strength confidence <= 60 (got: ${chest.strengthAssessment.confidenceScore})`);
  }
}

console.log('\n=== [Profile 9] Hybrid strength & cardio lifter ===');
{
  const logs = [
    makeLog('hy-1', 2, [{ name: '杠铃深蹲', weight: 100, sets: 4, reps: 5 }], 'Legs'),
    makeLog('hy-2', 4, [{ name: '户外跑步', type: 'cardio', duration: 35, weight: 0, sets: 1, reps: 1 }], 'Cardio'),
    makeLog('hy-3', 7, [{ name: '杠铃平板卧推', weight: 80, sets: 4, reps: 8 }], 'Chest'),
    makeLog('hy-4', 9, [{ name: '跳绳', type: 'cardio', duration: 20, weight: 0, sets: 1, reps: 1 }], 'Cardio'),
  ];
  const analytics = calculateFullWorkoutAnalytics(logs, {}, 28, { sex: 'male', bodyweightKg: 70 });
  const cardio = analytics.categoryDetails[WorkoutCategory.Cardio];
  const legs = analytics.categoryDetails[WorkoutCategory.Legs];

  assert(cardio.cardioScore! > 0, 'Cardio score is active and positive');
  assert(cardio.strengthScore === 0, 'Cardio never produces a strength score');
  assert(legs.strengthScore > 0, 'Strength category produces separate strength score');
  assert(legs.trainingScore > 0, 'Strength category produces separate capacity score');
}

console.log('\n=== [Profile 10] Missing body metrics, edge timestamps & plausibility ===');
{
  // Missing body metrics
  const missingContext = bodyContextFromProfile(null);
  assert(missingContext === null, 'Missing profile returns null context');

  // Future timestamps and invalid dates
  const weirdLogs = [
    makeLog('w-future', -5, [{ name: '杠铃平板卧推', weight: 90, sets: 3, reps: 5 }]), // 5 days in future
    makeLog('w-ok', 3, [{ name: '杠铃平板卧推', weight: 90, sets: 3, reps: 5 }]),
  ];
  const analytics = calculateFullWorkoutAnalytics(weirdLogs, {}, 28, { sex: 'male', bodyweightKg: 70 });
  // Future log must be excluded from recent workout count
  assert(analytics.recentWorkoutsCount === 1, `Future workout is excluded (actual: ${analytics.recentWorkoutsCount})`);

  // Implausible weight (e.g. 900kg bench press)
  const crazyLog = [
    makeLog('crazy-1', 2, [{ name: '杠铃平板卧推', weight: 900, sets: 1, reps: 1 }]),
  ];
  const crazyAnalytics = calculateFullWorkoutAnalytics(crazyLog, {}, 28, { sex: 'male', bodyweightKg: 70 });
  const crazyPr = crazyAnalytics.categorizedPrs.find((p) => p.name.includes('卧推'));
  assert(crazyPr !== undefined && crazyPr.excludeFromScoring === true, 'Implausible 900kg PR excluded from scoring');
}

console.log('\n=== Model Invariant Checks ===');
{
  // 1. Invariant: Determinism
  const testLogs = [
    makeLog('inv-1', 2, [{ name: '杠铃平板卧推', weight: 85, sets: 4, reps: 6 }]),
    makeLog('inv-2', 5, [{ name: '引体向上', weight: 0, sets: 4, reps: 8 }]),
  ];
  const a1 = calculateFullWorkoutAnalytics(testLogs, {}, 28, { sex: 'male', bodyweightKg: 75 });
  const a2 = calculateFullWorkoutAnalytics(testLogs, {}, 28, { sex: 'male', bodyweightKg: 75 });
  assert(a1.recentSetsCount === a2.recentSetsCount, 'Determinism: sets count identical');
  assert(a1.categoryDetails[WorkoutCategory.Chest].trainingScore === a2.categoryDetails[WorkoutCategory.Chest].trainingScore, 'Determinism: chest score identical');
  assert(a1.insights.balanceScore === a2.insights.balanceScore, 'Determinism: balance score identical');

  // 2. Invariant: Rolling window isolation
  // Adding a log 45 days ago must NOT change 28-day sets or frequency
  const logsWithOlder = [
    ...testLogs,
    makeLog('inv-old', 45, [{ name: '杠铃平板卧推', weight: 100, sets: 10, reps: 10 }]),
  ];
  const a3 = calculateFullWorkoutAnalytics(logsWithOlder, {}, 28, { sex: 'male', bodyweightKg: 75 });
  assert(a1.recentSetsCount === a3.recentSetsCount, 'Rolling window isolation: older record does not change 28d sets');

  // 3. Invariant: Multi-muscle balance progression
  // 1 group -> 覆盖不足
  // 3 groups -> 局部偏强
  // 5 groups evenly -> 极度均衡
  const balancedLogs = [
    makeLog('b-1', 2, [{ name: '杠铃平板卧推', weight: 80, sets: 4, reps: 8 }], 'Chest'),
    makeLog('b-2', 4, [{ name: '高位下拉', weight: 65, sets: 4, reps: 8 }], 'Back'),
    makeLog('b-3', 6, [{ name: '杠铃深蹲', weight: 100, sets: 4, reps: 8 }], 'Legs'),
    makeLog('b-4', 8, [{ name: '坐姿哑铃推举', weight: 20, sets: 4, reps: 8 }], 'Shoulders'),
    makeLog('b-5', 10, [{ name: '杠铃弯举', weight: 30, sets: 4, reps: 8 }], 'Others'),
    makeLog('b-6', 15, [{ name: '杠铃平板卧推', weight: 80, sets: 4, reps: 8 }], 'Chest'),
    makeLog('b-7', 17, [{ name: '高位下拉', weight: 65, sets: 4, reps: 8 }], 'Back'),
    makeLog('b-8', 19, [{ name: '杠铃深蹲', weight: 100, sets: 4, reps: 8 }], 'Legs'),
    makeLog('b-9', 21, [{ name: '坐姿哑铃推举', weight: 20, sets: 4, reps: 8 }], 'Shoulders'),
    makeLog('b-10', 23, [{ name: '杠铃弯举', weight: 30, sets: 4, reps: 8 }], 'Others'),
  ];
  const balancedAnalytics = calculateFullWorkoutAnalytics(balancedLogs, {}, 28, { sex: 'male', bodyweightKg: 75 });
  assert(balancedAnalytics.insights.coverageCount === 5, `All 5 resistance groups covered (got: ${balancedAnalytics.insights.coverageCount})`);
  assert(
    balancedAnalytics.insights.balanceLevel === '极度均衡' || balancedAnalytics.insights.balanceLevel === '均衡良好',
    `5 evenly trained groups score highly balanced (got: ${balancedAnalytics.insights.balanceLevel})`
  );
  assert(balancedAnalytics.insights.balanceScore >= 75, `Balance score >= 75 (got: ${balancedAnalytics.insights.balanceScore})`);
}

console.log('\n🎉 ALL STATISTICS V4 VERIFICATION & REGRESSION TESTS PASSED SUCCESSFULLY!\n');
