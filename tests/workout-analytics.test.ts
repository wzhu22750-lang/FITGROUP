import { WorkoutCategory, WorkoutLog } from '../src/types';
import {
  resolveExerciseMuscles,
  calculateStandardizedScore,
  getStrengthTier,
  getNextMilestone,
  calculateFullWorkoutAnalytics,
  findExerciseStandard,
  estimateOneRepMax,
} from '../src/utils/workoutAnalytics';
import { STRENGTH_TIERS, EXERCISE_STANDARDS } from '../src/constants/strengthStandards';
import { CATEGORY_META } from '../src/constants/workoutPresets';
import {
  SubMuscleGroup,
  findMuscleCoefficient,
  SCORE_WEIGHTS,
  DEFAULT_CARDIO_CALORIE_TARGET,
  VOLUME_TARGET_PER_WEEK,
} from '../src/constants/muscleCoefficients';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- Testing Muscle Coefficients & Compound Resolution ---');

// 1. Test Muscle Coefficient Table Lookup & Resolution
{
  const benchCoeff = findMuscleCoefficient('杠铃平板卧推');
  assert(Boolean(benchCoeff), 'findMuscleCoefficient resolves 杠铃平板卧推');
  assert(benchCoeff?.subMuscles[SubMuscleGroup.UpperChest] === 0.2, 'Bench upper chest is 0.2');
  assert(benchCoeff?.subMuscles[SubMuscleGroup.MiddleChest] === 0.8, 'Bench middle chest is 0.8');

  const shoulderCoeff = findMuscleCoefficient('坐姿哑铃推举');
  assert(Boolean(shoulderCoeff), 'findMuscleCoefficient resolves 坐姿哑铃推举 (alias for 杠铃肩推)');
  assert(shoulderCoeff?.subMuscles[SubMuscleGroup.FrontDelt] === 0.7, 'Shoulder front delt is 0.7');
  assert(shoulderCoeff?.subMuscles[SubMuscleGroup.MiddleDelt] === 0.3, 'Shoulder middle delt is 0.3');

  const reverseFly = findMuscleCoefficient('蝴蝶机反向飞鸟');
  assert(Boolean(reverseFly), 'findMuscleCoefficient resolves 蝴蝶机反向飞鸟');
  assert(reverseFly?.subMuscles[SubMuscleGroup.MiddleDelt] === 0.2, 'Reverse fly middle delt is 0.2');
  assert(reverseFly?.subMuscles[SubMuscleGroup.RearDelt] === 0.8, 'Reverse fly rear delt is 0.8');

  // 传统硬拉 stimulates Back sub-muscles (ErectorSpinae 0.55, Lats 0.15, UpperBack 0.15, UpperTraps 0.15)
  const deadliftMuscles = resolveExerciseMuscles('传统硬拉');
  assert(deadliftMuscles[WorkoutCategory.Back] === 1.0, 'Deadlift resolves to Back category');

  // 哑铃上斜卧推 stimulates Chest (Upper 0.8, Middle 0.2)
  const inclineBench = resolveExerciseMuscles('哑铃上斜卧推');
  assert(inclineBench[WorkoutCategory.Chest] === 1.0, 'Incline bench resolves to Chest category');
}

console.log('--- Testing Estimated 1RM Formula (Epley) ---');

// 2. Test Epley 1RM Calculation: 1RM = Weight * (1 + Reps / 30)
{
  // 80kg x 8 reps -> 80 * (1 + 8/30) = 80 * 1.2667 ≈ 101.3kg
  const est1 = estimateOneRepMax(80, 8);
  assert(est1 >= 101.2 && est1 <= 101.4, `80kg x 8 reps = 101.3kg (actual: ${est1})`);

  // 100kg x 1 rep -> 100kg
  const est2 = estimateOneRepMax(100, 1);
  assert(est2 === 100, `100kg x 1 rep = 100kg (actual: ${est2})`);

  // 0kg -> 0kg
  const est3 = estimateOneRepMax(0, 10);
  assert(est3 === 0, `0kg x 10 reps = 0kg (actual: ${est3})`);
}

console.log('--- Testing Standardized 5-Tier Strength Benchmarks ---');

// 3. Test Standardized Scoring Across Exercises
{
  const bench30 = calculateStandardizedScore('杠铃平板卧推', 30, WorkoutCategory.Chest);
  assert(bench30 === 13, `Bench 30kg = 13 pts (actual: ${bench30})`);

  const bench50 = calculateStandardizedScore('杠铃平板卧推', 50, WorkoutCategory.Chest);
  assert(bench50 === 24, `Bench 50kg = 24 pts (actual: ${bench50})`);

  const bench75 = calculateStandardizedScore('杠铃平板卧推', 75, WorkoutCategory.Chest);
  assert(bench75 === 50, `Bench 75kg = 50 pts (actual: ${bench75})`);

  const squat100 = calculateStandardizedScore('杠铃深蹲', 100, WorkoutCategory.Legs);
  assert(squat100 === 49, `Squat 100kg = 49 pts (actual: ${squat100})`);

  const deadlift120 = calculateStandardizedScore('传统硬拉', 120, WorkoutCategory.Back);
  assert(deadlift120 === 50, `Deadlift 120kg = 50 pts (actual: ${deadlift120})`);
}

console.log('--- Testing Milestone Next Goal Target ---');

// 4. Test Milestone next-tier target
{
  const nextFromBench50 = getNextMilestone('杠铃平板卧推', 50);
  assert(Boolean(nextFromBench50), 'Next milestone calculated for Bench 50kg');
  assert(nextFromBench50?.targetWeight === 64, `Next milestone target weight is 64kg (actual: ${nextFromBench50?.targetWeight})`);
  assert(nextFromBench50?.deltaWeight === 14, `Next milestone delta is 14kg (actual: ${nextFromBench50?.deltaWeight})`);
  assert(nextFromBench50?.nextTier.zh === '入门', `Next tier is 入门 (actual: ${nextFromBench50?.nextTier.zh})`);
}

console.log('--- Testing 6-Dimension 28-Day Scoring Engine & Sub-Muscles ---');

// 5. Test Full Analytics Engine with Sub-muscle breakdown
{
  const now = new Date().toISOString();
  const mockLogs: WorkoutLog[] = [
    {
      id: 'log1',
      userId: 'u1',
      userName: 'Alice',
      userPhoto: '',
      timestamp: now,
      category: 'Shoulders',
      categories: [WorkoutCategory.Shoulders],
      exercises: [
        { id: 'e1', name: '坐姿哑铃推举', type: 'strength', weight: 16, sets: 4, reps: 10 },
        { id: 'e2', name: '哑铃侧平举', type: 'strength', weight: 8, sets: 4, reps: 15 },
        { id: 'e3', name: '蝴蝶机反向飞鸟', type: 'strength', weight: 10, sets: 4, reps: 12 },
      ],
      likesCount: 0,
      commentsCount: 0,
    },
    {
      id: 'log2',
      userId: 'u1',
      userName: 'Alice',
      userPhoto: '',
      timestamp: now,
      category: 'Cardio',
      categories: [WorkoutCategory.Cardio],
      exercises: [
        { id: 'e4', name: '跑步机跑步', type: 'cardio', duration: 30, calories: 300 },
      ],
      likesCount: 0,
      commentsCount: 0,
    },
  ];

  const mockPrs = {
    '坐姿哑铃推举': 18,
    '杠铃平板卧推': 80,
    '引体向上': -15, // Assisted pull-up (-15kg assistance)
  };

  const analytics = calculateFullWorkoutAnalytics(mockLogs, mockPrs, 28);

  // Check 6 dimensions
  assert(analytics.radarData.length === 6, 'Radar data has all 6 dimensions');

  const pullUpPr = analytics.categorizedPrs.find(p => p.name === '引体向上');
  assert(Boolean(pullUpPr), 'Assisted pull-up PR is preserved');
  assert(pullUpPr?.weight === -15, 'Assisted pull-up PR weight is -15kg');

  const shoulderDetail = analytics.categoryDetails[WorkoutCategory.Shoulders];
  assert(shoulderDetail.trainingScore > 0, `Shoulder training score > 0 (actual: ${shoulderDetail.trainingScore})`);
  assert(Boolean(shoulderDetail.subMuscleScores), 'Shoulder contains subMuscleScores');
  assert(shoulderDetail.subMuscleScores?.length === 3, 'Shoulder has 3 sub-muscles (Front, Middle, Rear)');

  // Check sub-muscle names
  const subNames = shoulderDetail.subMuscleScores?.map((sm) => sm.zh);
  assert(subNames?.includes('前束') && subNames?.includes('中束') && subNames?.includes('后束'), 'Shoulder includes 前束, 中束, 后束');

  // Check Cardio 28-day Calories
  const cardioDetail = analytics.categoryDetails[WorkoutCategory.Cardio];
  assert(cardioDetail.cardioCalories?.actual === 300, `Cardio calories actual is 300 (actual: ${cardioDetail.cardioCalories?.actual})`);
  assert(cardioDetail.cardioCalories?.target === DEFAULT_CARDIO_CALORIE_TARGET, 'Cardio target is 2000 kcal');
  assert(cardioDetail.trainingScore === 15, `Cardio training score = 300/2000 * 100 = 15 (actual: ${cardioDetail.trainingScore})`);

  // Insights generated
  assert(analytics.insights.highlights.length > 0, 'Highlights generated');
  assert(analytics.insights.recommendations.length > 0, 'Recommendations generated');
}

console.log('--- Testing Tier Alignment & Monotonicity ---');

// 6. Tier mapping and monotonicity
{
  assert(getStrengthTier(80).zh === '精英', `Score 80 maps to 精英 (actual: ${getStrengthTier(80).zh})`);
  assert(getStrengthTier(60).zh === '熟练', `Score 60 maps to 熟练 (actual: ${getStrengthTier(60).zh})`);
  assert(getStrengthTier(40).zh === '进阶', `Score 40 maps to 进阶 (actual: ${getStrengthTier(40).zh})`);
  assert(getStrengthTier(20).zh === '入门', `Score 20 maps to 入门 (actual: ${getStrengthTier(20).zh})`);
  assert(getStrengthTier(10).zh === '新手', `Score 10 maps to 新手 (actual: ${getStrengthTier(10).zh})`);
}

console.log('\n🎉 ALL 6-DIMENSION WORKOUT ANALYTICS TESTS PASSED SUCCESSFULLY!\n');
