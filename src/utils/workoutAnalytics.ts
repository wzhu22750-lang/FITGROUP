import { WorkoutCategory, WorkoutLog, Exercise } from '../types';
import {
  EXERCISE_STANDARDS,
  STRENGTH_TIERS,
  StrengthTierKey,
  StrengthTierMeta,
  ExerciseStandard,
} from '../constants/strengthStandards';
import { CATEGORY_META, parseCategories } from '../constants/workoutPresets';
import {
  SubMuscleGroup,
  CATEGORY_SUB_MUSCLES,
  SUB_MUSCLE_WEIGHTS,
  SUB_MUSCLE_META,
  SCORE_WEIGHTS,
  FREQUENCY_FULL_SCORE_PER_WEEK,
  VOLUME_TARGET_PER_WEEK,
  SCORING_PERIOD_DAYS,
  CARDIO_CALORIE_TARGETS,
  DEFAULT_CARDIO_CALORIE_TARGET,
  findMuscleCoefficient,
} from '../constants/muscleCoefficients';

export interface SubMuscleScoreDetail {
  subMuscle: SubMuscleGroup;
  zh: string;
  en: string;
  weight: number; // e.g. 0.35 (35%)
  score: number; // 0 - 100
  frequencyScore: number; // 0 - 100
  volumeScore: number; // 0 - 100
  weightScore: number; // 0 - 100
  weeklyFrequency: number; // e.g. 1.5 times/week
  weeklyWeightedSets: number; // e.g. 8.4 sets/week
  currentPeriodWeightedVolumeKg: number;
  baselineWeightedVolumeKg: number;
}

export interface CategoryScoreDetail {
  category: WorkoutCategory;
  zh: string;
  en: string;
  trainingScore: number; // 0 - 100 (Training Capacity Index: Freq 20% + Vol 50% + Weight 30%)
  strengthScore: number; // 0 - 100 (Pure PR Strength Level)
  activityScore: number; // 0 - 100 (Frequency Score component)
  compositeScore: number; // 0 - 100 (Alias to trainingScore for backward compatibility)
  tier: StrengthTierMeta;
  recentSets: number; // Sets in timeframe
  totalVolumeKg: number; // Approximate tonnage
  bestExerciseName?: string;
  bestRecordText?: string;
  bestRecordValue?: number;

  // Granular sub-dimension metrics
  subMuscleScores?: SubMuscleScoreDetail[];
  frequencyScore?: number;
  volumeScore?: number;
  weightScore?: number;
  weeklyWorkouts?: number;

  // Cardio specific metrics
  cardioCalories?: {
    actual: number;
    target: number;
    completionRate: number;
  };
}

export interface RadarDataPoint {
  subject: string;
  category: WorkoutCategory;
  composite: number; // Training capacity score (0-100)
  strength: number;  // Pure PR strength score (0-100)
  activity: number;  // Frequency score (0-100)
  fullMark: number;
}

export interface WorkoutInsights {
  balanceScore: number; // 0 - 100 (100 = perfectly balanced)
  balanceLevel: '极度均衡' | '均衡良好' | '局部偏强' | '偏科明显' | '蓄势起步';
  dominantCategory?: WorkoutCategory;
  laggingCategory?: WorkoutCategory;
  dominantScore: number;
  laggingScore: number;
  highlights: string[];
  recommendations: string[];
}

export interface CategorizedPrItem {
  name: string;
  category: WorkoutCategory;
  weight: number;
  unit: string;
  score: number;
  estimated1RM?: number;
  tier: StrengthTierMeta;
  nextMilestone?: {
    targetWeight: number;
    deltaWeight: number;
    nextTier: StrengthTierMeta;
  };
}

export interface VolumeDistributionItem {
  category: WorkoutCategory;
  zh: string;
  color: string;
  /** Inline-style-safe hex matching `color` */
  hex: string;
  sets: number;
  percentage: number;
  workoutCount: number;
}

/**
 * Normalizes an exercise string for fuzzy matching
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-_（）()【】\[\]+、,/|]/g, '')
    .trim();
}

/**
 * Calculates Estimated 1RM using the standard Epley formula:
 * 1RM = Weight * (1 + Reps / 30)
 * Only valid for reps in [1..10] range.
 */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (weight <= 0) return 0;
  if (reps <= 1) return weight;
  const validReps = Math.min(10, Math.max(1, reps));
  return Number((weight * (1 + validReps / 30)).toFixed(1));
}

/**
 * Finds standard definition for an exercise by exact or alias matching
 */
export function findExerciseStandard(name: string): ExerciseStandard | undefined {
  if (!name) return undefined;
  const clean = normalizeName(name);

  // Exact or alias match
  for (const std of EXERCISE_STANDARDS) {
    if (normalizeName(std.name) === clean) return std;
    if (std.aliases.some((alias) => normalizeName(alias) === clean)) return std;
  }

  // Substring match
  for (const std of EXERCISE_STANDARDS) {
    if (clean.includes(normalizeName(std.name))) return std;
    if (std.aliases.some((alias) => clean.includes(normalizeName(alias)))) return std;
  }

  return undefined;
}

/**
 * Resolves compound muscle group contribution for any exercise name.
 * Uses the comprehensive muscleCoefficients table first, falling back to keywords.
 * Returns map of category to relative weight (summing to 1.0).
 */
export function resolveExerciseMuscles(
  exerciseName: string,
  fallbackCategories?: WorkoutCategory[] | string[] | string
): Record<WorkoutCategory, number> {
  const result: Record<WorkoutCategory, number> = {
    [WorkoutCategory.Chest]: 0,
    [WorkoutCategory.Back]: 0,
    [WorkoutCategory.Legs]: 0,
    [WorkoutCategory.Shoulders]: 0,
    [WorkoutCategory.Others]: 0,
    [WorkoutCategory.Cardio]: 0,
  };

  // 1. Try finding in muscle coefficient table
  const coeff = findMuscleCoefficient(exerciseName);
  if (coeff) {
    let totalAssigned = 0;
    // Map each subMuscle to its parent Category
    for (const [subMuscleStr, weight] of Object.entries(coeff.subMuscles)) {
      const subMuscle = subMuscleStr as SubMuscleGroup;
      const w = weight || 0;
      if (w <= 0) continue;

      for (const [cat, subList] of Object.entries(CATEGORY_SUB_MUSCLES)) {
        if (subList.includes(subMuscle)) {
          result[cat as WorkoutCategory] += w;
          totalAssigned += w;
          break;
        }
      }
    }

    if (totalAssigned > 0) {
      // Normalize to sum to 1.0
      for (const cat of Object.keys(result) as WorkoutCategory[]) {
        result[cat] = Number((result[cat] / totalAssigned).toFixed(3));
      }
      return result;
    }
  }

  // 2. Try finding standard definition
  const std = findExerciseStandard(exerciseName);
  if (std && std.muscleWeights) {
    for (const [cat, w] of Object.entries(std.muscleWeights)) {
      result[cat as WorkoutCategory] = w || 0;
    }
    return result;
  }

  const clean = normalizeName(exerciseName);
  const matchedCategories = new Set<WorkoutCategory>();

  // Keyword rules
  if (clean.includes('胸') || clean.includes('卧推') || clean.includes('夹胸') || clean.includes('pushup') || clean.includes('bench') || clean.includes('chest')) {
    matchedCategories.add(WorkoutCategory.Chest);
  }
  if (clean.includes('背') || clean.includes('划船') || clean.includes('下拉') || clean.includes('引体') || clean.includes('硬拉') || clean.includes('deadlift') || clean.includes('pull') || clean.includes('row')) {
    matchedCategories.add(WorkoutCategory.Back);
  }
  if (clean.includes('蹲') || clean.includes('腿') || clean.includes('臀') || clean.includes('提踵') || clean.includes('倒蹬') || clean.includes('箭步') || clean.includes('squat') || clean.includes('lunge') || clean.includes('leg')) {
    matchedCategories.add(WorkoutCategory.Legs);
  }
  if (clean.includes('肩') || clean.includes('推举') || clean.includes('侧平举') || clean.includes('飞鸟') || clean.includes('面拉') || clean.includes('耸肩') || clean.includes('shoulder') || clean.includes('press') || clean.includes('delt')) {
    matchedCategories.add(WorkoutCategory.Shoulders);
  }
  if (clean.includes('弯举') || clean.includes('臂屈伸') || clean.includes('二头') || clean.includes('三头') || clean.includes('手臂') || clean.includes('腹') || clean.includes('核心') || clean.includes('支撑') || clean.includes('arm') || clean.includes('abs') || clean.includes('curl')) {
    matchedCategories.add(WorkoutCategory.Others);
  }
  if (clean.includes('跑') || clean.includes('骑') || clean.includes('单车') || clean.includes('跳绳') || clean.includes('爬楼') || clean.includes('椭圆') || clean.includes('有氧') || clean.includes('cardio') || clean.includes('run') || clean.includes('hiit')) {
    matchedCategories.add(WorkoutCategory.Cardio);
  }

  // Hard compound exceptions: e.g. 硬拉 stimulation
  if (clean.includes('硬拉') || clean.includes('deadlift')) {
    matchedCategories.add(WorkoutCategory.Legs);
    matchedCategories.add(WorkoutCategory.Back);
  }

  if (matchedCategories.size > 0) {
    const share = 1 / matchedCategories.size;
    matchedCategories.forEach((cat) => {
      result[cat] = share;
    });
    return result;
  }

  // Fallback to workout log categories if present
  let cats: WorkoutCategory[] = [];
  if (Array.isArray(fallbackCategories)) {
    cats = fallbackCategories.filter((c) => Object.values(WorkoutCategory).includes(c as WorkoutCategory)) as WorkoutCategory[];
  } else if (typeof fallbackCategories === 'string') {
    cats = parseCategories(fallbackCategories);
  }

  if (cats.length > 0) {
    const share = 1 / cats.length;
    cats.forEach((cat) => {
      result[cat] = share;
    });
    return result;
  }

  result[WorkoutCategory.Others] = 1.0;
  return result;
}

/**
 * Calculates a standardized 0 - 100 score for a PR value based on 5 standard tiers
 */
export function calculateStandardizedScore(
  exerciseName: string,
  value: number,
  category: WorkoutCategory
): number {
  if (value <= 0) return 0;
  const std = findExerciseStandard(exerciseName);

  let thresholds: [number, number, number, number, number] = [30, 50, 75, 100, 125];

  if (std && std.thresholds) {
    thresholds = std.thresholds;
  } else {
    // Default fallback thresholds by category
    switch (category) {
      case WorkoutCategory.Chest:
        thresholds = [30, 50, 75, 100, 125];
        break;
      case WorkoutCategory.Back:
        thresholds = [30, 50, 70, 90, 115];
        break;
      case WorkoutCategory.Legs:
        thresholds = [40, 70, 100, 140, 180];
        break;
      case WorkoutCategory.Shoulders:
        thresholds = [15, 30, 45, 60, 75];
        break;
      case WorkoutCategory.Others:
        thresholds = [15, 25, 35, 45, 55];
        break;
      case WorkoutCategory.Cardio:
        thresholds = [15, 30, 45, 60, 90]; // Minutes
        break;
    }
  }

  const [t1, t2, t3, t4, t5] = thresholds;

  if (value <= t1) {
    return Math.max(0, Math.round((value / t1) * 20));
  }
  if (value <= t2) {
    return Math.round(20 + ((value - t1) / (t2 - t1)) * 20);
  }
  if (value <= t3) {
    return Math.round(40 + ((value - t2) / (t3 - t2)) * 20);
  }
  if (value <= t4) {
    return Math.round(60 + ((value - t3) / (t4 - t3)) * 20);
  }
  if (value <= t5) {
    return Math.round(80 + ((value - t4) / (t5 - t4)) * 20);
  }

  // Beyond the elite threshold: score saturates at 100
  return 100;
}

/**
 * Maps 0 - 100 score to StrengthTierMeta.
 */
export function getStrengthTier(score: number): StrengthTierMeta {
  if (score >= 80) return STRENGTH_TIERS.elite;
  if (score >= 60) return STRENGTH_TIERS.proficient;
  if (score >= 40) return STRENGTH_TIERS.intermediate;
  if (score >= 20) return STRENGTH_TIERS.beginner;
  return STRENGTH_TIERS.novice;
}

/**
 * Resolves assessment for a PR record
 */
export function resolveStrengthAssessment(
  exerciseName: string,
  value: number,
  category?: WorkoutCategory
): { score: number; tier: StrengthTierMeta; nextMilestone?: CategorizedPrItem['nextMilestone'] } {
  const std = findExerciseStandard(exerciseName);
  const score = calculateStandardizedScore(
    exerciseName,
    value,
    category || std?.primaryCategory || WorkoutCategory.Others
  );

  if (!std?.thresholds || value <= 0) {
    return { score, tier: getStrengthTier(score) };
  }

  const tierOrder: StrengthTierKey[] = ['novice', 'beginner', 'intermediate', 'proficient', 'elite'];
  let tier = STRENGTH_TIERS.novice;
  for (let i = 0; i < std.thresholds.length; i++) {
    if (value >= std.thresholds[i]) tier = STRENGTH_TIERS[tierOrder[i]];
  }

  return {
    score,
    tier,
    nextMilestone: getNextMilestone(exerciseName, value),
  };
}

/**
 * Calculates the next milestone target for an exercise
 */
export function getNextMilestone(exerciseName: string, currentWeight: number) {
  const std = findExerciseStandard(exerciseName);
  if (!std || !std.thresholds) return undefined;

  const [t1, t2, t3, t4, t5] = std.thresholds;
  const tiers: Array<{ threshold: number; tier: StrengthTierMeta }> = [
    { threshold: t1, tier: STRENGTH_TIERS.novice },
    { threshold: t2, tier: STRENGTH_TIERS.beginner },
    { threshold: t3, tier: STRENGTH_TIERS.intermediate },
    { threshold: t4, tier: STRENGTH_TIERS.proficient },
    { threshold: t5, tier: STRENGTH_TIERS.elite },
  ];

  for (const item of tiers) {
    if (currentWeight < item.threshold) {
      return {
        targetWeight: item.threshold,
        deltaWeight: Number((item.threshold - currentWeight).toFixed(1)),
        nextTier: item.tier,
      };
    }
  }

  return undefined;
}

/**
 * Helper to estimate calories from a cardio exercise
 */
function extractOrEstimateCalories(ex: Exercise): number {
  if (typeof ex.calories === 'number' && ex.calories > 0) {
    return ex.calories;
  }
  const dur = ex.duration || 0;
  const dist = ex.distance || 0;
  if (dist > 0) {
    // ~60 kcal per km running/cycling average
    return Math.round(dist * 60);
  }
  if (dur > 0) {
    // ~8 kcal per minute moderate intensity
    return Math.round(dur * 8);
  }
  return 0;
}

/**
 * Complete analytics calculation implementing the official 6-dimension scoring framework:
 * - 28-day rolling window
 * - Sub-muscle group breakdown with direct/compound coefficients
 * - Frequency (20%) + Volume (50%) + Weight Progress (30%)
 * - Cardio scored against 28-day calorie target (default 2000 kcal)
 * - Pure strength PR evaluated independently via 1RM standards
 */
export function calculateFullWorkoutAnalytics(
  logs: WorkoutLog[],
  userPrs: Record<string, number> = {},
  days = SCORING_PERIOD_DAYS
): {
  categoryDetails: Record<WorkoutCategory, CategoryScoreDetail>;
  radarData: RadarDataPoint[];
  volumeDistribution: VolumeDistributionItem[];
  insights: WorkoutInsights;
  categorizedPrs: CategorizedPrItem[];
  recentWorkoutsCount: number;
  recentSetsCount: number;
} {
  const now = Date.now();
  const currentPeriodMs = days * 24 * 60 * 60 * 1000;
  const cutoffTime = now - currentPeriodMs;
  // Baseline period: previous 4 to 8 weeks before current window
  const baselineCutoffTime = cutoffTime - currentPeriodMs;

  const recentLogs = logs.filter((l) => {
    const t = new Date(l.timestamp).getTime();
    return !isNaN(t) && t >= cutoffTime && t <= now;
  });

  const baselineLogs = logs.filter((l) => {
    const t = new Date(l.timestamp).getTime();
    return !isNaN(t) && t >= baselineCutoffTime && t < cutoffTime;
  });

  // Track sub-muscle group training data
  const subMuscleWeightedSets: Record<SubMuscleGroup, number> = {} as any;
  const subMuscleWeightedVolumeKg: Record<SubMuscleGroup, number> = {} as any;
  const subMuscleWorkoutDates: Record<SubMuscleGroup, Set<string>> = {} as any;

  // Baseline sub-muscle group volume
  const baselineSubMuscleWeightedVolumeKg: Record<SubMuscleGroup, number> = {} as any;

  // Initialize all sub-muscle counters
  Object.values(SubMuscleGroup).forEach((sm) => {
    subMuscleWeightedSets[sm] = 0;
    subMuscleWeightedVolumeKg[sm] = 0;
    subMuscleWorkoutDates[sm] = new Set<string>();
    baselineSubMuscleWeightedVolumeKg[sm] = 0;
  });

  // Category aggregate sets & volume (for volume distribution charts)
  const categorySets: Record<WorkoutCategory, number> = {
    [WorkoutCategory.Chest]: 0,
    [WorkoutCategory.Back]: 0,
    [WorkoutCategory.Legs]: 0,
    [WorkoutCategory.Shoulders]: 0,
    [WorkoutCategory.Others]: 0,
    [WorkoutCategory.Cardio]: 0,
  };

  const categoryTonnage: Record<WorkoutCategory, number> = {
    [WorkoutCategory.Chest]: 0,
    [WorkoutCategory.Back]: 0,
    [WorkoutCategory.Legs]: 0,
    [WorkoutCategory.Shoulders]: 0,
    [WorkoutCategory.Others]: 0,
    [WorkoutCategory.Cardio]: 0,
  };

  const categoryWorkoutOccurrences: Record<WorkoutCategory, number> = {
    [WorkoutCategory.Chest]: 0,
    [WorkoutCategory.Back]: 0,
    [WorkoutCategory.Legs]: 0,
    [WorkoutCategory.Shoulders]: 0,
    [WorkoutCategory.Others]: 0,
    [WorkoutCategory.Cardio]: 0,
  };

  let totalCardioCalories = 0;
  let maxCardioDuration = { minutes: 0, exerciseName: '有氧训练' };

  // Helper to process a log's exercises into sub-muscle accumulators
  function processLogExercises(
    log: WorkoutLog,
    isCurrent: boolean
  ) {
    const dateKey = log.timestamp ? log.timestamp.split('T')[0] : '';
    const logCategories = parseCategories(typeof log.category === 'string' ? log.category : '');
    const exercises = Array.isArray(log.exercises) ? log.exercises : [];
    const logCategoriesTouched = new Set<WorkoutCategory>();

    exercises.forEach((ex) => {
      const sets = Math.max(ex.sets || 1, 1);
      const reps = Math.max(ex.reps || 10, 1);
      const weight = typeof ex.weight === 'number' ? ex.weight : 0;
      // Assisted bodyweight (negative weight) doesn't produce negative volume tonnage
      const tonnage = Math.max(0, weight) * sets * reps;

      if (ex.type === 'cardio' || cleanIsCardio(ex.name)) {
        if (isCurrent) {
          const cal = extractOrEstimateCalories(ex);
          totalCardioCalories += cal;
          categorySets[WorkoutCategory.Cardio] += sets;
          logCategoriesTouched.add(WorkoutCategory.Cardio);

          const dur = ex.duration || 0;
          if (dur > maxCardioDuration.minutes) {
            maxCardioDuration.minutes = dur;
            maxCardioDuration.exerciseName = ex.name || '跑步';
          }
        }
        return;
      }

      // Check sub-muscle coefficients
      const coeff = findMuscleCoefficient(ex.name);
      if (coeff && Object.keys(coeff.subMuscles).length > 0) {
        for (const [smStr, share] of Object.entries(coeff.subMuscles)) {
          const sm = smStr as SubMuscleGroup;
          const s = share || 0;
          if (s <= 0) continue;

          if (isCurrent) {
            subMuscleWeightedSets[sm] += sets * s;
            subMuscleWeightedVolumeKg[sm] += tonnage * s;
            if (dateKey) subMuscleWorkoutDates[sm].add(dateKey);

            // Find parent category
            for (const [cat, subList] of Object.entries(CATEGORY_SUB_MUSCLES)) {
              if (subList.includes(sm)) {
                categorySets[cat as WorkoutCategory] += sets * s;
                categoryTonnage[cat as WorkoutCategory] += tonnage * s;
                logCategoriesTouched.add(cat as WorkoutCategory);
                break;
              }
            }
          } else {
            baselineSubMuscleWeightedVolumeKg[sm] += tonnage * s;
          }
        }
      } else {
        // Fallback using resolveExerciseMuscles
        const muscles = resolveExerciseMuscles(ex.name, logCategories);
        for (const [catStr, share] of Object.entries(muscles)) {
          const cat = catStr as WorkoutCategory;
          const s = share || 0;
          if (s <= 0) continue;

          if (isCurrent) {
            categorySets[cat] += sets * s;
            categoryTonnage[cat] += tonnage * s;
            logCategoriesTouched.add(cat);

            // Distribute evenly among sub-muscles of that category
            const subMuscles = CATEGORY_SUB_MUSCLES[cat] || [];
            if (subMuscles.length > 0) {
              const subShare = s / subMuscles.length;
              subMuscles.forEach((sm) => {
                subMuscleWeightedSets[sm] += sets * subShare;
                subMuscleWeightedVolumeKg[sm] += tonnage * subShare;
                if (dateKey) subMuscleWorkoutDates[sm].add(dateKey);
              });
            }
          } else {
            const subMuscles = CATEGORY_SUB_MUSCLES[cat] || [];
            if (subMuscles.length > 0) {
              const subShare = s / subMuscles.length;
              subMuscles.forEach((sm) => {
                baselineSubMuscleWeightedVolumeKg[sm] += tonnage * subShare;
              });
            }
          }
        }
      }
    });

    if (isCurrent) {
      logCategoriesTouched.forEach((cat) => {
        categoryWorkoutOccurrences[cat] += 1;
      });
    }
  }

  function cleanIsCardio(name: string): boolean {
    const clean = normalizeName(name);
    return clean.includes('跑') || clean.includes('骑') || clean.includes('单车') || clean.includes('跳绳') || clean.includes('爬楼') || clean.includes('椭圆') || clean.includes('有氧') || clean.includes('cardio') || clean.includes('run') || clean.includes('hiit');
  }

  // 1. Process recent logs (current period)
  recentLogs.forEach((log) => processLogExercises(log, true));

  // 2. Process baseline logs (prior period)
  baselineLogs.forEach((log) => processLogExercises(log, false));

  // 3. Process Pure Strength (PR) scores from user profile PRs and workout logs
  const categorizedPrs: CategorizedPrItem[] = [];
  const categoryStrengthScores: Record<
    WorkoutCategory,
    { maxScore: number; bestName?: string; bestValue?: number }
  > = {
    [WorkoutCategory.Chest]: { maxScore: 0 },
    [WorkoutCategory.Back]: { maxScore: 0 },
    [WorkoutCategory.Legs]: { maxScore: 0 },
    [WorkoutCategory.Shoulders]: { maxScore: 0 },
    [WorkoutCategory.Others]: { maxScore: 0 },
    [WorkoutCategory.Cardio]: { maxScore: 0 },
  };

  // Evaluate user PRs
  Object.entries(userPrs).forEach(([name, weight]) => {
    if (typeof weight !== 'number') return;
    const muscles = resolveExerciseMuscles(name);
    const std = findExerciseStandard(name);
    const primary = std?.primaryCategory || (Object.keys(muscles)[0] as WorkoutCategory);

    const assessment = resolveStrengthAssessment(name, Math.max(0, weight), primary);
    const singleScore = weight < 0 ? Math.max(5, Math.round(20 + weight)) : assessment.score;

    categorizedPrs.push({
      name,
      category: primary,
      weight,
      unit: std?.unit || 'kg',
      score: singleScore,
      estimated1RM: weight,
      tier: assessment.tier,
      nextMilestone: assessment.nextMilestone,
    });

    for (const [catStr, share] of Object.entries(muscles)) {
      const cat = catStr as WorkoutCategory;
      if (share >= 0.2) {
        const weightedScore = Math.round(singleScore * (0.8 + 0.2 * share));
        if (weightedScore > categoryStrengthScores[cat].maxScore) {
          categoryStrengthScores[cat].maxScore = weightedScore;
          categoryStrengthScores[cat].bestName = name;
          categoryStrengthScores[cat].bestValue = weight;
        }
      }
    }
  });

  // Also check best single-set performances in recent logs for PRs
  recentLogs.forEach((log) => {
    (log.exercises || []).forEach((ex) => {
      if (ex.type === 'strength' && ex.weight && ex.weight > 0) {
        const est1RM = estimateOneRepMax(ex.weight, ex.reps || 1);
        const muscles = resolveExerciseMuscles(ex.name);
        const std = findExerciseStandard(ex.name);
        const primary = std?.primaryCategory || (Object.keys(muscles)[0] as WorkoutCategory);
        const score = calculateStandardizedScore(ex.name, est1RM, primary);

        for (const [catStr, share] of Object.entries(muscles)) {
          const cat = catStr as WorkoutCategory;
          if (share >= 0.2 && score > categoryStrengthScores[cat].maxScore) {
            categoryStrengthScores[cat].maxScore = score;
            categoryStrengthScores[cat].bestName = ex.name;
            categoryStrengthScores[cat].bestValue = ex.weight;
          }
        }
      }
    });
  });

  // Evaluate cardio score for PR view
  if (maxCardioDuration.minutes > 0) {
    const cardioScore = calculateStandardizedScore(
      maxCardioDuration.exerciseName,
      maxCardioDuration.minutes,
      WorkoutCategory.Cardio
    );
    categoryStrengthScores[WorkoutCategory.Cardio] = {
      maxScore: cardioScore,
      bestName: maxCardioDuration.exerciseName,
      bestValue: maxCardioDuration.minutes,
    };
  }

  // 4. Calculate Sub-muscle scores and 6-Dimension Category details
  const weeksInPeriod = Math.max(1, days / 7);
  const categoryDetails: Record<WorkoutCategory, CategoryScoreDetail> = {} as any;
  const radarData: RadarDataPoint[] = [];

  const totalSetsAll = Object.values(categorySets).reduce((a, b) => a + b, 0);

  Object.values(WorkoutCategory).forEach((cat) => {
    const meta = CATEGORY_META[cat];
    const strengthPRScore = categoryStrengthScores[cat].maxScore || 0;
    const sets = Math.round(categorySets[cat]);
    const workouts = categoryWorkoutOccurrences[cat];

    if (cat === WorkoutCategory.Cardio) {
      // Cardio Dimension: calculated based on 28-day total calories
      const cardioTarget = DEFAULT_CARDIO_CALORIE_TARGET;
      const cardioScore = Math.min(100, Math.round((totalCardioCalories / cardioTarget) * 100));
      const activity = Math.min(100, Math.round((workouts / (FREQUENCY_FULL_SCORE_PER_WEEK * weeksInPeriod)) * 100));
      const tier = getStrengthTier(cardioScore);

      categoryDetails[cat] = {
        category: cat,
        zh: meta.zh,
        en: meta.en,
        trainingScore: cardioScore,
        strengthScore: strengthPRScore > 0 ? strengthPRScore : cardioScore,
        activityScore: activity,
        compositeScore: cardioScore,
        tier,
        recentSets: sets,
        totalVolumeKg: 0,
        bestExerciseName: maxCardioDuration.exerciseName,
        bestRecordValue: totalCardioCalories,
        bestRecordText: totalCardioCalories > 0 ? `${totalCardioCalories} kcal` : undefined,
        weeklyWorkouts: Number((workouts / weeksInPeriod).toFixed(1)),
        cardioCalories: {
          actual: totalCardioCalories,
          target: cardioTarget,
          completionRate: Math.round((totalCardioCalories / cardioTarget) * 100),
        },
      };

      radarData.push({
        subject: meta.zh,
        category: cat,
        composite: cardioScore,
        strength: strengthPRScore > 0 ? strengthPRScore : cardioScore,
        activity,
        fullMark: 100,
      });
      return;
    }

    // Strength Dimensions: Calculate sub-muscle scores
    const subMuscleList = CATEGORY_SUB_MUSCLES[cat] || [];
    const weightsMap = SUB_MUSCLE_WEIGHTS[cat] || {};
    const subMuscleScoreDetails: SubMuscleScoreDetail[] = [];

    let categoryWeightedScoreSum = 0;
    let sumFrequencyScore = 0;
    let sumVolumeScore = 0;
    let sumWeightScore = 0;

    subMuscleList.forEach((sm) => {
      const smMeta = SUB_MUSCLE_META[sm];
      const smWeight = weightsMap[sm] ?? (1 / subMuscleList.length);

      // A. Frequency Score
      const trainingDaysCount = subMuscleWorkoutDates[sm].size;
      const weeklyFrequency = trainingDaysCount / weeksInPeriod;
      let frequencyScore = 0;
      if (weeklyFrequency > 0) {
        // 0 -> 0; 1/week -> 50; 2/week -> 75; 3+/week -> 100
        frequencyScore = Math.min(100, Math.round(25 + weeklyFrequency * 25));
      }

      // B. Volume Score (weekly加权组数 vs 目标组数 12组)
      const weeklyWeightedSets = subMuscleWeightedSets[sm] / weeksInPeriod;
      const volumeScore = Math.min(100, Math.round((weeklyWeightedSets / VOLUME_TARGET_PER_WEEK) * 100));

      // C. Weight Score (Current 28d vs Baseline)
      const currentPeriodVolume = subMuscleWeightedVolumeKg[sm];
      const baselinePeriodVolume = baselineSubMuscleWeightedVolumeKg[sm];

      let weightScore = 50; // Default when no baseline is available
      if (baselinePeriodVolume > 0) {
        weightScore = Math.min(100, Math.max(0, Math.round((currentPeriodVolume / baselinePeriodVolume) * 100)));
      } else if (currentPeriodVolume > 0) {
        // If has workouts in current period but no prior baseline, base on volume accomplishment
        weightScore = Math.min(100, Math.max(50, Math.round(50 + (volumeScore / 2))));
      } else {
        weightScore = 0;
      }

      // Sub-muscle composite score: 20% Frequency + 50% Volume + 30% Weight
      const subScore = Math.min(
        100,
        Math.round(
          frequencyScore * SCORE_WEIGHTS.frequency +
          volumeScore * SCORE_WEIGHTS.volume +
          weightScore * SCORE_WEIGHTS.weight
        )
      );

      subMuscleScoreDetails.push({
        subMuscle: sm,
        zh: smMeta.zh,
        en: smMeta.en,
        weight: smWeight,
        score: subScore,
        frequencyScore,
        volumeScore,
        weightScore,
        weeklyFrequency: Number(weeklyFrequency.toFixed(1)),
        weeklyWeightedSets: Number(weeklyWeightedSets.toFixed(1)),
        currentPeriodWeightedVolumeKg: Math.round(currentPeriodVolume),
        baselineWeightedVolumeKg: Math.round(baselinePeriodVolume),
      });

      categoryWeightedScoreSum += subScore * smWeight;
      sumFrequencyScore += frequencyScore * smWeight;
      sumVolumeScore += volumeScore * smWeight;
      sumWeightScore += weightScore * smWeight;
    });

    const trainingScore = Math.min(100, Math.round(categoryWeightedScoreSum));
    const avgFreqScore = Math.min(100, Math.round(sumFrequencyScore));
    const avgVolScore = Math.min(100, Math.round(sumVolumeScore));
    const avgWeightScore = Math.min(100, Math.round(sumWeightScore));

    const tier = getStrengthTier(trainingScore);

    categoryDetails[cat] = {
      category: cat,
      zh: meta.zh,
      en: meta.en,
      trainingScore,
      strengthScore: strengthPRScore,
      activityScore: avgFreqScore,
      compositeScore: trainingScore,
      tier,
      recentSets: sets,
      totalVolumeKg: Math.round(categoryTonnage[cat]),
      bestExerciseName: categoryStrengthScores[cat].bestName,
      bestRecordValue: categoryStrengthScores[cat].bestValue,
      bestRecordText: categoryStrengthScores[cat].bestValue
        ? `${categoryStrengthScores[cat].bestValue} KG`
        : undefined,
      subMuscleScores: subMuscleScoreDetails,
      frequencyScore: avgFreqScore,
      volumeScore: avgVolScore,
      weightScore: avgWeightScore,
      weeklyWorkouts: Number((workouts / weeksInPeriod).toFixed(1)),
    };

    radarData.push({
      subject: meta.zh,
      category: cat,
      composite: trainingScore,
      strength: strengthPRScore,
      activity: avgFreqScore,
      fullMark: 100,
    });
  });

  // 5. Volume Distribution (Normalized across active categories)
  const volumeDistribution: VolumeDistributionItem[] = Object.values(WorkoutCategory).map((cat) => {
    const meta = CATEGORY_META[cat];
    const sets = Math.round(categorySets[cat]);
    const percentage = totalSetsAll > 0 ? Math.round((sets / totalSetsAll) * 100) : 0;
    return {
      category: cat,
      zh: meta.zh,
      color: meta.color,
      hex: meta.hex,
      sets,
      percentage,
      workoutCount: categoryWorkoutOccurrences[cat],
    };
  });

  // 6. Intelligent Insights & Recommendations
  const activeScores = Object.values(categoryDetails).map((c) => c.trainingScore);
  const maxScore = Math.max(...activeScores, 0);

  const sortedCategories = [...Object.values(categoryDetails)].sort(
    (a, b) => b.trainingScore - a.trainingScore
  );

  const dominant = sortedCategories[0]?.trainingScore > 0 ? sortedCategories[0] : undefined;
  const lagging =
    sortedCategories[sortedCategories.length - 1]?.trainingScore >= 0
      ? sortedCategories[sortedCategories.length - 1]
      : undefined;

  const avgScore = activeScores.reduce((a, b) => a + b, 0) / (activeScores.length || 1);
  const variance =
    activeScores.reduce((acc, val) => acc + Math.pow(val - avgScore, 2), 0) /
    (activeScores.length || 1);
  const stdDev = Math.sqrt(variance);

  let balanceScore = 100;
  let balanceLevel: WorkoutInsights['balanceLevel'] = '极度均衡';

  if (maxScore === 0) {
    balanceScore = 0;
    balanceLevel = '蓄势起步';
  } else {
    balanceScore = Math.max(20, Math.min(100, Math.round(100 - stdDev * 1.5)));
    if (balanceScore >= 85) balanceLevel = '极度均衡';
    else if (balanceScore >= 70) balanceLevel = '均衡良好';
    else if (balanceScore >= 50) balanceLevel = '局部偏强';
    else balanceLevel = '偏科明显';
  }

  const highlights: string[] = [];
  const recommendations: string[] = [];

  if (dominant && dominant.trainingScore >= 40) {
    highlights.push(
      `优势部位：${dominant.zh} (${dominant.trainingScore}分 · ${dominant.tier.zh})，近期训练覆盖与容量饱满。`
    );
  } else if (recentLogs.length > 0) {
    highlights.push(`训练状态良好，近 ${days} 天累计完成 ${recentLogs.length} 次训练打卡！`);
  } else {
    highlights.push('记录你的第一次训练，即可激活六维健身能力图谱！');
  }

  if (lagging && lagging.trainingScore < (dominant?.trainingScore || 50) - 20) {
    recommendations.push(
      `薄弱提醒：${lagging.zh} (${lagging.trainingScore}分) 相对滞后，建议增加针对性训练，提升全身均衡发展。`
    );
  }

  if (categorySets[WorkoutCategory.Legs] === 0 && recentLogs.length >= 3) {
    recommendations.push('提示：近期下肢腿部训练较少，适度深蹲与硬拉可强化核心及下肢力量！');
  } else if (categorySets[WorkoutCategory.Cardio] === 0 && recentLogs.length >= 4) {
    recommendations.push('心肺建议：每周穿插 1-2 次有氧或 HIIT，有助于提升心肺体能与代谢恢复。');
  }

  if (recommendations.length === 0) {
    recommendations.push('各部位力量与频次发展均衡，请继续保持当前的训练节奏与渐进超负荷！');
  }

  return {
    categoryDetails,
    radarData,
    volumeDistribution,
    insights: {
      balanceScore,
      balanceLevel,
      dominantCategory: dominant?.category,
      laggingCategory: lagging?.category,
      dominantScore: dominant?.trainingScore || 0,
      laggingScore: lagging?.trainingScore || 0,
      highlights,
      recommendations,
    },
    categorizedPrs: categorizedPrs.sort((a, b) => b.score - a.score),
    recentWorkoutsCount: recentLogs.length,
    recentSetsCount: Math.round(totalSetsAll),
  };
}
