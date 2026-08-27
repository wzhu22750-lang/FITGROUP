import { WorkoutCategory, WorkoutLog } from '../src/types';
import {
  resolveExerciseMuscles,
  calculateStandardizedScore,
  getStrengthTier,
  getNextMilestone,
  calculateFullWorkoutAnalytics,
  findExerciseStandard,
} from '../src/utils/workoutAnalytics';
import { STRENGTH_TIERS, EXERCISE_STANDARDS } from '../src/constants/strengthStandards';
import { CATEGORY_META } from '../src/constants/workoutPresets';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- Testing Compound Movement & Multi-Category Resolution ---');

// 1. Test Compound Exercise Muscle Resolution
{
  // 传统硬拉 should stimulate both Legs (0.55) and Back (0.45)
  const deadliftMuscles = resolveExerciseMuscles('传统硬拉');
  assert(deadliftMuscles[WorkoutCategory.Legs] > 0.5, 'Deadlift gives majority weight to Legs');
  assert(deadliftMuscles[WorkoutCategory.Back] > 0.4, 'Deadlift also stimulates Back');

  // 绳索面拉 should stimulate Shoulders (0.6) and Back (0.4)
  const facePullMuscles = resolveExerciseMuscles('绳索面拉');
  assert(facePullMuscles[WorkoutCategory.Shoulders] >= 0.6, 'Face pull stimulates Shoulders');
  assert(facePullMuscles[WorkoutCategory.Back] >= 0.4, 'Face pull stimulates Back');

  // 哑铃上斜卧推 stimulates Chest (0.75) and Shoulders (0.25)
  const inclineBench = resolveExerciseMuscles('哑铃上斜卧推');
  assert(inclineBench[WorkoutCategory.Chest] === 0.75, 'Incline bench stimulates Chest');
  assert(inclineBench[WorkoutCategory.Shoulders] === 0.25, 'Incline bench stimulates Shoulders');

  // Custom text with multiple keywords: "肩背超级组"
  const customShoulderBack = resolveExerciseMuscles('肩背超级组');
  assert(customShoulderBack[WorkoutCategory.Shoulders] === 0.5, 'Custom "肩背" splits to Shoulders');
  assert(customShoulderBack[WorkoutCategory.Back] === 0.5, 'Custom "肩背" splits to Back');

  // Fallback to log multi-category: "Chest, Shoulders"
  const fallbackGeneric = resolveExerciseMuscles('力量循环训练', ['Chest', 'Shoulders']);
  assert(fallbackGeneric[WorkoutCategory.Chest] === 0.5, 'Fallback generic splits to Chest');
  assert(fallbackGeneric[WorkoutCategory.Shoulders] === 0.5, 'Fallback generic splits to Shoulders');
}

console.log('--- Testing Standardized 5-Tier Strength Benchmarks ---');

// 2. Test Standardized Scoring Across Different Exercises
{
  // 卧推 30kg -> Tier 1 (Novice, ~20 pts)
  const bench30 = calculateStandardizedScore('杠铃平板卧推', 30, WorkoutCategory.Chest);
  assert(bench30 === 20, `Bench 30kg = 20 pts (Novice) (actual: ${bench30})`);

  // 哑铃推肩 8kg (单手) -> Tier 1 (Novice, ~20 pts)
  const shoulderPress8 = calculateStandardizedScore('坐姿哑铃推举', 8, WorkoutCategory.Shoulders);
  assert(shoulderPress8 === 20, `Dumbbell shoulder press 8kg = 20 pts (Novice) (actual: ${shoulderPress8})`);

  // 卧推 50kg -> Tier 2 (Beginner, ~40 pts)
  const bench50 = calculateStandardizedScore('杠铃平板卧推', 50, WorkoutCategory.Chest);
  assert(bench50 === 40, `Bench 50kg = 40 pts (Beginner) (actual: ${bench50})`);

  // 高位下拉 45kg -> Tier 2 (Beginner, ~40 pts)
  const latPulldown45 = calculateStandardizedScore('高位下拉', 45, WorkoutCategory.Back);
  assert(latPulldown45 === 40, `Lat pulldown 45kg = 40 pts (Beginner) (actual: ${latPulldown45})`);

  // 卧推 75kg -> Tier 3 (Intermediate, ~60 pts)
  const bench75 = calculateStandardizedScore('杠铃平板卧推', 75, WorkoutCategory.Chest);
  assert(bench75 === 60, `Bench 75kg = 60 pts (Intermediate) (actual: ${bench75})`);

  // 深蹲 100kg -> Tier 3 (Intermediate, ~60 pts)
  const squat100 = calculateStandardizedScore('杠铃深蹲', 100, WorkoutCategory.Legs);
  assert(squat100 === 60, `Squat 100kg = 60 pts (Intermediate) (actual: ${squat100})`);

  // 硬拉 120kg -> Tier 3 (Intermediate, ~60 pts)
  const deadlift120 = calculateStandardizedScore('传统硬拉', 120, WorkoutCategory.Back);
  assert(deadlift120 === 60, `Deadlift 120kg = 60 pts (Intermediate) (actual: ${deadlift120})`);

  // 推肩 24kg (单手) -> Tier 3 (Intermediate, ~60 pts)
  const shoulderPress24 = calculateStandardizedScore('坐姿哑铃推举', 24, WorkoutCategory.Shoulders);
  assert(shoulderPress24 === 60, `Dumbbell shoulder press 24kg = 60 pts (Intermediate) (actual: ${shoulderPress24})`);
}

console.log('--- Testing Milestone Next Goal Target ---');

// 3. Test Milestone next-tier target
{
  const nextFromBench50 = getNextMilestone('杠铃平板卧推', 50);
  assert(Boolean(nextFromBench50), 'Next milestone calculated for Bench 50kg');
  assert(nextFromBench50?.targetWeight === 75, `Next milestone target weight is 75kg (actual: ${nextFromBench50?.targetWeight})`);
  assert(nextFromBench50?.deltaWeight === 25, `Next milestone delta is 25kg (actual: ${nextFromBench50?.deltaWeight})`);
  assert(nextFromBench50?.nextTier.zh === '进阶', `Next tier is 进阶 (actual: ${nextFromBench50?.nextTier.zh})`);
}

console.log('--- Testing Full Workout Analytics & Compound Volume Split ---');

// 4. Test Full Analytics Engine
{
  const now = new Date().toISOString();
  const mockLogs: WorkoutLog[] = [
    {
      id: 'log1',
      userId: 'u1',
      userName: 'Alice',
      userPhoto: '',
      timestamp: now,
      category: 'Shoulders, Back',
      categories: [WorkoutCategory.Shoulders, WorkoutCategory.Back],
      exercises: [
        { id: 'e1', name: '坐姿哑铃推举', type: 'strength', weight: 16, sets: 4, reps: 10 },
        { id: 'e2', name: '绳索面拉', type: 'strength', weight: 25, sets: 4, reps: 15 },
        { id: 'e3', name: '高位下拉', type: 'strength', weight: 45, sets: 4, reps: 10 },
      ],
      likesCount: 0,
      commentsCount: 0,
    },
  ];

  const mockPrs = {
    '坐姿哑铃推举': 16,
    '高位下拉': 45,
    '绳索面拉': 25,
  };

  const analytics = calculateFullWorkoutAnalytics(mockLogs, mockPrs, 30);

  // Check Shoulders & Back both got tracked
  const shoulderDetail = analytics.categoryDetails[WorkoutCategory.Shoulders];
  const backDetail = analytics.categoryDetails[WorkoutCategory.Back];

  assert(shoulderDetail.strengthScore > 0, `Shoulder strength score > 0 (actual: ${shoulderDetail.strengthScore})`);
  assert(backDetail.strengthScore > 0, `Back strength score > 0 (actual: ${backDetail.strengthScore})`);

  // Both should have received training sets
  assert(shoulderDetail.recentSets > 0, `Shoulder recent sets > 0 (actual: ${shoulderDetail.recentSets})`);
  assert(backDetail.recentSets > 0, `Back recent sets > 0 (actual: ${backDetail.recentSets})`);

  // Radar points count is 6
  assert(analytics.radarData.length === 6, 'Radar data has 6 category data points');

  // Insights generated
  assert(analytics.insights.highlights.length > 0, 'Highlights generated');
  assert(analytics.insights.recommendations.length > 0, 'Recommendations generated');
}

console.log('--- Testing Tier Consistency (PR badge vs next milestone) ---');

// 5. The current tier badge and the "next tier" hint must never show the same tier,
//    and the next tier must be exactly one level above the current tier.
{
  // Regression: bench 40kg used to show badge 入门 with next tier 入门 (50kg)
  const bench40 = calculateFullWorkoutAnalytics([], { '杠铃平板卧推': 40 }, 30);
  const pr40 = bench40.categorizedPrs[0];
  assert(pr40.tier.zh === '新手', `Bench 40kg current tier is 新手 (actual: ${pr40.tier.zh})`);
  assert(
    pr40.nextMilestone?.nextTier.zh === '入门',
    `Bench 40kg next tier is 入门 (actual: ${pr40.nextMilestone?.nextTier.zh})`
  );

  // Regression: bench 52kg badge 入门 must point to 进阶 (75kg), not 入门 again
  const bench52 = calculateFullWorkoutAnalytics([], { '杠铃平板卧推': 52 }, 30);
  const pr52 = bench52.categorizedPrs[0];
  assert(pr52.tier.zh === '入门', `Bench 52kg current tier is 入门 (actual: ${pr52.tier.zh})`);
  assert(
    pr52.nextMilestone?.nextTier.zh === '进阶',
    `Bench 52kg next tier is 进阶 (actual: ${pr52.nextMilestone?.nextTier.zh})`
  );

  // Invariant across ALL standard exercises: at 75% of each tier segment,
  // current tier and next tier must be exactly one level apart.
  EXERCISE_STANDARDS.forEach((std) => {
    for (let i = 0; i < std.thresholds.length - 1; i++) {
      const value = std.thresholds[i] + (std.thresholds[i + 1] - std.thresholds[i]) * 0.75;
      const result = calculateFullWorkoutAnalytics([], { [std.name]: value }, 30);
      const pr = result.categorizedPrs[0];
      if (pr?.nextMilestone) {
        assert(
          pr.nextMilestone.nextTier.level === pr.tier.level + 1,
          `${std.name} @${value}${std.unit}: tier ${pr.tier.zh}(L${pr.tier.level}) -> next ${pr.nextMilestone.nextTier.zh}(L${pr.nextMilestone.nextTier.level}) is exactly one level up`
        );
      }
    }
  });
}

console.log('--- Testing Score Monotonicity Beyond Elite Threshold ---');

// 6. Score must never decrease as weight increases; exceeding the elite
//    threshold used to drop the score from 100 back to ~87.
{
  let prev = -1;
  let monotonic = true;
  let dropAt = '';
  for (let w = 0; w <= 200; w += 0.5) {
    const s = calculateStandardizedScore('杠铃平板卧推', w, WorkoutCategory.Chest);
    if (s < prev) {
      monotonic = false;
      dropAt = `${prev} -> ${s} at ${w}kg`;
      break;
    }
    prev = s;
  }
  assert(monotonic, `Bench score is monotonically non-decreasing up to 200kg (drop: ${dropAt || 'none'})`);
  assert(
    calculateStandardizedScore('杠铃平板卧推', 126, WorkoutCategory.Chest) === 100,
    'Score beyond elite threshold stays at 100 (actual: ' +
      calculateStandardizedScore('杠铃平板卧推', 126, WorkoutCategory.Chest) +
      ')'
  );
}

console.log('--- Testing Category Meta Colors Are Valid CSS Colors ---');

// 7. Colors are used in inline styles, so they must be real CSS colors,
//    not Tailwind class names.
{
  Object.values(CATEGORY_META).forEach((meta) => {
    assert(
      /^#[0-9a-f]{6}$/i.test(meta.hex ?? ''),
      `CATEGORY_META[${meta.zh}] has valid hex color (actual: ${meta.hex})`
    );
  });
}

console.log('\n🎉 ALL WORKOUT ANALYTICS & STRENGTH STANDARDS TESTS PASSED SUCCESSFULLY!\n');
