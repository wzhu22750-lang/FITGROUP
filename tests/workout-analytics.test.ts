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
//    Expected values are recomputed from the researched thresholds in strengthStandards.ts:
//    卧推 [47,64,85,110,136] · 坐姿哑铃推举 [7,12,20,29,39] · 高位下拉 [42,57,77,99,123]
//    深蹲 [62,86,116,149,185] · 硬拉 [75,103,137,175,216]
{
  // 卧推 30kg -> below Novice tier (~13 pts), new t1=47
  const bench30 = calculateStandardizedScore('杠铃平板卧推', 30, WorkoutCategory.Chest);
  assert(bench30 === 13, `Bench 30kg = 13 pts (below Novice) (actual: ${bench30})`);

  // 哑铃推肩 8kg (单手) -> ~24 pts, new t1=7/t2=12
  const shoulderPress8 = calculateStandardizedScore('坐姿哑铃推举', 8, WorkoutCategory.Shoulders);
  assert(shoulderPress8 === 24, `Dumbbell shoulder press 8kg = 24 pts (Novice) (actual: ${shoulderPress8})`);

  // 卧推 50kg -> ~24 pts (Novice tier), new t1=47/t2=64
  const bench50 = calculateStandardizedScore('杠铃平板卧推', 50, WorkoutCategory.Chest);
  assert(bench50 === 24, `Bench 50kg = 24 pts (Novice) (actual: ${bench50})`);

  // 高位下拉 45kg -> ~24 pts (Novice), new t1=42/t2=57
  const latPulldown45 = calculateStandardizedScore('高位下拉', 45, WorkoutCategory.Back);
  assert(latPulldown45 === 24, `Lat pulldown 45kg = 24 pts (Novice) (actual: ${latPulldown45})`);

  // 卧推 75kg -> ~50 pts (approaching Intermediate), new t2=64/t3=85
  const bench75 = calculateStandardizedScore('杠铃平板卧推', 75, WorkoutCategory.Chest);
  assert(bench75 === 50, `Bench 75kg = 50 pts (approaching Intermediate) (actual: ${bench75})`);

  // 深蹲 100kg -> ~49 pts (Beginner tier), new t2=86/t3=116
  const squat100 = calculateStandardizedScore('杠铃深蹲', 100, WorkoutCategory.Legs);
  assert(squat100 === 49, `Squat 100kg = 49 pts (Beginner) (actual: ${squat100})`);

  // 硬拉 120kg -> 50 pts (approaching Intermediate), new t2=103/t3=137
  const deadlift120 = calculateStandardizedScore('传统硬拉', 120, WorkoutCategory.Back);
  assert(deadlift120 === 50, `Deadlift 120kg = 50 pts (approaching Intermediate) (actual: ${deadlift120})`);

  // 推肩 24kg (单手) -> ~69 pts (Intermediate tier), new t3=20/t4=29
  const shoulderPress24 = calculateStandardizedScore('坐姿哑铃推举', 24, WorkoutCategory.Shoulders);
  assert(shoulderPress24 === 69, `Dumbbell shoulder press 24kg = 69 pts (Intermediate) (actual: ${shoulderPress24})`);
}

console.log('--- Testing Milestone Next Goal Target ---');

// 3. Test Milestone next-tier target
//    New 卧推 thresholds [47,64,85,110,136]: 50kg sits in the novice band (47-64),
//    so the next milestone is 64kg (入门).
{
  const nextFromBench50 = getNextMilestone('杠铃平板卧推', 50);
  assert(Boolean(nextFromBench50), 'Next milestone calculated for Bench 50kg');
  assert(nextFromBench50?.targetWeight === 64, `Next milestone target weight is 64kg (actual: ${nextFromBench50?.targetWeight})`);
  assert(nextFromBench50?.deltaWeight === 14, `Next milestone delta is 14kg (actual: ${nextFromBench50?.deltaWeight})`);
  assert(nextFromBench50?.nextTier.zh === '入门', `Next tier is 入门 (actual: ${nextFromBench50?.nextTier.zh})`);
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
//    New 卧推 thresholds [47,64,85,110,136]: 50kg -> 新手, next 64kg 入门;
//    65kg -> 入门, next 85kg 进阶.
{
  // Regression: bench 50kg must show 新手 (not the inflated 入门 of the old
  // [30,50,75,...] thresholds), with the next milestone pointing to 入门 (64kg).
  const bench50 = calculateFullWorkoutAnalytics([], { '杠铃平板卧推': 50 }, 30);
  const pr50 = bench50.categorizedPrs[0];
  assert(pr50.tier.zh === '新手', `Bench 50kg current tier is 新手 (actual: ${pr50.tier.zh})`);
  assert(
    pr50.nextMilestone?.nextTier.zh === '入门',
    `Bench 50kg next tier is 入门 (actual: ${pr50.nextMilestone?.nextTier.zh})`
  );

  // Regression: bench 65kg badge 入门 must point to 进阶 (85kg), not 入门 again
  const bench65 = calculateFullWorkoutAnalytics([], { '杠铃平板卧推': 65 }, 30);
  const pr65 = bench65.categorizedPrs[0];
  assert(pr65.tier.zh === '入门', `Bench 65kg current tier is 入门 (actual: ${pr65.tier.zh})`);
  assert(
    pr65.nextMilestone?.nextTier.zh === '进阶',
    `Bench 65kg next tier is 进阶 (actual: ${pr65.nextMilestone?.nextTier.zh})`
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
  // New elite threshold is 136kg, so 150kg (beyond elite) must saturate at 100.
  assert(
    calculateStandardizedScore('杠铃平板卧推', 150, WorkoutCategory.Chest) === 100,
    'Score beyond elite threshold stays at 100 (actual: ' +
      calculateStandardizedScore('杠铃平板卧推', 150, WorkoutCategory.Chest) +
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

console.log('--- Testing Tier Bands Aligned To Threshold Semantics ---');

// 8. Score-to-tier mapping must agree with weight-to-threshold mapping:
//    reaching standard N (score 20N) puts you in tier N. A composite/strength
//    score of 71 must show 进阶, never 熟练 (user-reported inflation).
{
  assert(getStrengthTier(71).zh === '进阶', `Score 71 maps to 进阶 (actual: ${getStrengthTier(71).zh})`);
  assert(getStrengthTier(40).zh === '入门', `Score 40 maps to 入门 (actual: ${getStrengthTier(40).zh})`);
  assert(getStrengthTier(80).zh === '熟练', `Score 80 maps to 熟练 (actual: ${getStrengthTier(80).zh})`);
  assert(getStrengthTier(100).zh === '精英', `Score 100 maps to 精英 (actual: ${getStrengthTier(100).zh})`);
  assert(getStrengthTier(20).zh === '新手', `Score 20 maps to 新手 (actual: ${getStrengthTier(20).zh})`);

  // Invariant: hitting each standard threshold exactly yields the matching tier
  const tierOrder = ['novice', 'beginner', 'intermediate', 'proficient', 'elite'] as const;
  EXERCISE_STANDARDS.forEach((std) => {
    std.thresholds.forEach((t, i) => {
      const score = calculateStandardizedScore(std.name, t, std.primaryCategory);
      assert(
        getStrengthTier(score).key === tierOrder[i],
        `${std.name} @${t}${std.unit} (score ${score}) maps to ${tierOrder[i]} (actual: ${getStrengthTier(score).key})`
      );
    });
  });
}

console.log('--- Testing Newly Added Strength Exercises ---');

// 9. New exercises: 蝴蝶机反向飞鸟 (reverse pec deck) and 杠铃上斜卧推 (barbell incline bench).
//    Both must resolve by name and by alias, carry the researched thresholds, and
//    contribute to the correct muscle groups.
{
  const reversePec = findExerciseStandard('蝴蝶机反向飞鸟');
  assert(Boolean(reversePec), 'findExerciseStandard resolves 蝴蝶机反向飞鸟');
  assert(reversePec?.aliases.includes('reverse pec deck'), 'reverse pec deck alias resolves');
  assert(
    reversePec?.muscleWeights[WorkoutCategory.Shoulders] === 0.8 &&
      reversePec?.muscleWeights[WorkoutCategory.Back] === 0.2,
    `Reverse pec deck muscle split 0.8 Shoulders / 0.2 Back (actual: ${JSON.stringify(reversePec?.muscleWeights)})`
  );
  assert(
    JSON.stringify(reversePec?.thresholds) === JSON.stringify([5, 8, 12, 16, 20]),
    `Reverse pec deck thresholds [5,8,12,16,20] (actual: ${JSON.stringify(reversePec?.thresholds)})`
  );

  const inclineBench = findExerciseStandard('杠铃上斜卧推');
  assert(Boolean(inclineBench), 'findExerciseStandard resolves 杠铃上斜卧推');
  assert(inclineBench?.aliases.includes('incline bench'), 'incline bench alias resolves');
  assert(
    inclineBench?.muscleWeights[WorkoutCategory.Chest] === 0.8 &&
      inclineBench?.muscleWeights[WorkoutCategory.Shoulders] === 0.2,
    `Incline bench muscle split 0.8 Chest / 0.2 Shoulders (actual: ${JSON.stringify(inclineBench?.muscleWeights)})`
  );
  assert(
    JSON.stringify(inclineBench?.thresholds) === JSON.stringify([35, 48, 64, 83, 102]),
    `Incline bench thresholds [35,48,64,83,102] (actual: ${JSON.stringify(inclineBench?.thresholds)})`
  );

  // Alias 'incline bench' must resolve to the barbell version, never 哑铃上斜卧推.
  const viaAlias = findExerciseStandard('incline bench');
  assert(viaAlias?.name === '杠铃上斜卧推', `incline bench resolves to 杠铃上斜卧推 (actual: ${viaAlias?.name})`);
}

console.log('\n🎉 ALL WORKOUT ANALYTICS & STRENGTH STANDARDS TESTS PASSED SUCCESSFULLY!\n');
