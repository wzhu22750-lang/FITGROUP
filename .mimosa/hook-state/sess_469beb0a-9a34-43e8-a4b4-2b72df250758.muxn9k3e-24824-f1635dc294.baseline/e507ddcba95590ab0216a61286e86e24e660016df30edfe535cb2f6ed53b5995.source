import { WorkoutCategory, WorkoutLog } from '../src/types';
import {
  calculateCardioExerciseMetrics,
  calculateCardioScore,
  calculateFullWorkoutAnalytics,
  getCardioTier,
} from '../src/utils/workoutAnalytics';
import {
  CARDIO_REFERENCE_BODYWEIGHT_KG,
  CARDIO_MET_TABLE,
  findCardioActivityMeta,
  getCardioMET,
  isCardioExercise,
  isCardioDistanceOptional,
} from '../src/constants/workoutPresets';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

const periodEnd = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

function metric(name: string, duration?: number, distance?: number, calories?: number) {
  return calculateCardioExerciseMetrics({
    id: name,
    name,
    type: 'cardio',
    duration,
    distance,
    calories,
  }, CARDIO_REFERENCE_BODYWEIGHT_KG);
}

function record(name: string, daysAgo: number, duration = 30) {
  return {
    ...metric(name, duration),
    timestamp: new Date(periodEnd - daysAgo * dayMs).toISOString(),
  };
}

function log(name: string, timestamp: string, duration = 30, distance?: number, calories?: number): WorkoutLog {
  return {
    id: `${name}-${timestamp}`,
    userId: 'cardio-test-user',
    userName: 'Cardio Tester',
    userPhoto: '',
    timestamp,
    category: WorkoutCategory.Cardio,
    exercises: [{ id: `${name}-exercise`, name, type: 'cardio', duration, distance, calories }],
    likesCount: 0,
    commentsCount: 0,
  };
}

console.log('--- Testing Unified Cardio Activity Metadata ---');
{
  assert(CARDIO_MET_TABLE.every((item) => Number.isFinite(item.met) && item.met > 0 && item.met <= 12), 'All configured MET values are finite and physiologically bounded');
  assert(findCardioActivityMeta('跑步')?.name === '户外跑步', 'Exact alias resolves 跑步 to outdoor running, not treadmill');
  assert(getCardioMET('跑步') === 9.0, 'Shared activity resolver returns outdoor running MET');
  assert(isCardioExercise('划船机'), 'Rowing machine is recognized as cardio');
  assert(!isCardioExercise('杠铃划船'), 'Barbell row is not misclassified as cardio');
  assert(isCardioDistanceOptional('羽毛球'), 'Badminton does not require distance');
  assert(!isCardioDistanceOptional('户外跑步'), 'Running keeps distance as an optional quality signal');
}

console.log('--- Testing Cardio Exercise Metrics ---');
{
  const run30 = metric('户外跑步', 30, 5);
  const run60 = metric('户外跑步', 60, 10);
  assert(run30.met === 9 && run30.speedKph === 10 && run30.paceMinutesPerKm === 6, 'Running exposes MET, speed, and pace');
  assert(run30.estimatedCalories === 315 && run30.reportedCalories === 0, 'Missing running calories are explicitly estimated');
  assert(run60.effectiveMinutes > run30.effectiveMinutes && run60.weightedMinutes > run30.weightedMinutes, 'Duration and weighted volume are monotonic');

  const badminton = metric('羽毛球', 60);
  const basketball = metric('篮球', 60);
  const walking = metric('健走 / 散步', 60);
  const hiit = metric('HIIT间歇训练', 20);
  assert(badminton.met === 6.5 && badminton.distanceKm === 0, 'Badminton uses duration and MET without requiring distance');
  assert(basketball.intensityScore > badminton.intensityScore && badminton.intensityScore > walking.intensityScore, 'MET intensity ordering is continuous and interpretable');
  assert(hiit.intensityScore > badminton.intensityScore, 'HIIT is more intense without being an unbounded volume multiplier');
  assert(hiit.weightedMinutes < badminton.weightedMinutes, '20-minute HIIT does not automatically beat 60-minute badminton on volume');

  const reported = metric('户外跑步', 30, 5, 100);
  assert(reported.reportedCalories === 100 && reported.estimatedCalories === 0 && reported.calories === 100, 'Reported calories take priority over estimates');
  const estimatedRecord = { ...run30, timestamp: new Date(periodEnd - dayMs).toISOString() };
  const reportedRecord = { ...reported, timestamp: new Date(periodEnd - dayMs).toISOString() };
  assert(calculateCardioScore([estimatedRecord], 28, periodEnd).score === calculateCardioScore([reportedRecord], 28, periodEnd).score, 'Changing reported calories does not change the multidimensional Cardio Score');

  const distanceOnlyRun = metric('户外跑步', undefined, 5);
  const distanceOnlyBike = metric('户外骑行', undefined, 5);
  assert(distanceOnlyRun.durationMinutes === 30, 'Distance-only running uses activity-specific fallback speed');
  assert(distanceOnlyBike.durationMinutes !== distanceOnlyRun.durationMinutes && distanceOnlyBike.calories !== distanceOnlyRun.calories, 'Distance-only cycling does not use a global kcal/km constant');

  const short = metric('户外跑步', 3);
  const partial = metric('户外跑步', 7);
  const normal = metric('户外跑步', 10);
  assert(!short.validForScoring && short.effectiveMinutes === 0 && short.sessionWeight === 0, 'Under-5-minute records do not create cardio sessions');
  assert(partial.validForScoring && partial.effectiveMinutes === 7 && partial.sessionWeight === 0.7, '5-10-minute records count with a partial session weight');
  assert(normal.sessionWeight === 1, '10-minute records receive a full session weight');

  const noWeight = metric('羽毛球', 60);
  const explicitDefault = calculateCardioExerciseMetrics({ id: 'x', name: '羽毛球', type: 'cardio', duration: 60 }, 0);
  assert(noWeight.calories === explicitDefault.calories && Number.isFinite(explicitDefault.calories), 'Missing or invalid bodyweight uses one finite reference weight');
}

console.log('--- Testing Cardio Score Dimensions and Consistency ---');
{
  const balancedDays = [27, 25, 22, 20, 18, 13, 11, 9, 6, 4];
  const balanced = calculateCardioScore(balancedDays.map((daysAgo) => record('户外跑步', daysAgo)), 28, periodEnd);
  assert(balanced.activeWeeks === 4 && balanced.consistencyScore >= 80, `3/2/3/2 weekly distribution has high consistency (actual: ${balanced.consistencyScore})`);
  assert(balanced.frequencyScore > 0 && balanced.durationScore > 0 && balanced.intensityScore > 0 && balanced.volumeScore > 0, 'All cardio score dimensions activate independently');
  assert(balanced.score >= 0 && balanced.score <= 100, 'Cardio score is bounded');

  const concentrated = Array.from({ length: 10 }, (_, index) => record('户外跑步', index % 7, 30));
  const concentratedScore = calculateCardioScore(concentrated, 28, periodEnd);
  assert(concentratedScore.activeWeeks === 1, 'Ten records concentrated in the final week activate one week after date aggregation');
  assert(concentratedScore.consistencyScore < balanced.consistencyScore, 'Concentrated training has lower consistency than distributed training');
  assert(concentratedScore.score <= 100, 'Concentrated high-volume training remains bounded with diminishing returns');

  const sparse = calculateCardioScore([record('户外跑步', 1, 30), record('户外跑步', 2, 30), record('户外跑步', 3, 30), record('户外跑步', 4, 30), record('户外跑步', 5, 30), record('户外跑步', 6, 30), record('户外跑步', 0, 30), record('户外跑步', 0, 30), record('户外跑步', 0, 30), record('户外跑步', 0, 30)], 28, periodEnd);
  assert(sparse.activeWeeks === 1 && sparse.consistencyScore < balanced.consistencyScore, '0/0/0/10-style distribution has materially lower consistency');

  const sameDay = calculateCardioScore([
    record('户外跑步', 1, 10),
    record('羽毛球', 1, 15),
  ], 28, periodEnd);
  assert(sameDay.validSessions === 1, 'Multiple cardio exercises on one date count as one effective session');
  assert(sameDay.weeklySessions <= 0.25, 'Same-day exercise entries do not become multiple complete weekly sessions');

  const timeShort = calculateCardioScore([record('户外跑步', 1, 30)], 28, periodEnd);
  const timeLong = calculateCardioScore([record('户外跑步', 1, 60)], 28, periodEnd);
  const timeVeryLong = calculateCardioScore([record('户外跑步', 1, 1200)], 28, periodEnd);
  assert(timeLong.score >= timeShort.score, 'Longer same-intensity training does not lower Cardio Score');
  assert(timeVeryLong.score <= 100 && timeVeryLong.durationScore === 100 && timeVeryLong.volumeScore >= 95, 'Very long sessions saturate instead of increasing without bound');
}

console.log('--- Testing Cardio Analytics Integration and Strength Isolation ---');
{
  const logs = [
    log('户外跑步', new Date(periodEnd - dayMs).toISOString(), 30, 5),
    log('羽毛球', new Date(periodEnd - 8 * dayMs).toISOString(), 60),
  ];
  const analytics = calculateFullWorkoutAnalytics(logs, {}, 28, { sex: 'male', bodyweightKg: 70 });
  const cardio = analytics.categoryDetails[WorkoutCategory.Cardio];
  assert(cardio.cardioMetrics?.effectiveMinutes === 90, 'Full analytics exposes effective cardio minutes');
  assert(cardio.cardioMetrics?.estimatedCalories === 770, 'Full analytics separates and sums estimated calories');
  assert(cardio.cardioScore === cardio.trainingScore && cardio.strengthScore === 0, 'Cardio Score is separate from strength PR score');
  assert(cardio.tier.zh === getCardioTier(cardio.trainingScore).zh, 'Cardio uses cardio-specific tier labels');
  assert(analytics.categorizedPrs.length === 0, 'Cardio records cannot become strength PRs');

  const bench = log('杠铃平板卧推', new Date(periodEnd - dayMs).toISOString(), 0, undefined, undefined);
  bench.exercises[0] = { id: 'bench', name: '杠铃平板卧推', type: 'strength', weight: 80, sets: 3, reps: 8 };
  const strengthOnly = calculateFullWorkoutAnalytics([bench], {}, 28, { sex: 'male', bodyweightKg: 70 });
  const mixed = calculateFullWorkoutAnalytics([bench, ...logs], {}, 28, { sex: 'male', bodyweightKg: 70 });
  assert(mixed.categoryDetails[WorkoutCategory.Chest].strengthScore === strengthOnly.categoryDetails[WorkoutCategory.Chest].strengthScore, 'Adding cardio does not change chest strength score');
  assert(mixed.categoryDetails[WorkoutCategory.Chest].trainingScore === strengthOnly.categoryDetails[WorkoutCategory.Chest].trainingScore, 'Adding cardio does not change chest training score');
}

console.log('\n🎉 ALL CARDIO V2 TESTS PASSED SUCCESSFULLY!\n');
