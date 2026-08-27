import { WorkoutCategory, WorkoutLog, Exercise } from '../types';
import {
  EXERCISE_STANDARDS,
  STRENGTH_TIERS,
  StrengthTierKey,
  StrengthTierMeta,
  ExerciseStandard,
} from '../constants/strengthStandards';
import { CATEGORY_META, parseCategories } from '../constants/workoutPresets';

export interface CategoryScoreDetail {
  category: WorkoutCategory;
  zh: string;
  en: string;
  strengthScore: number; // 0 - 100
  activityScore: number; // 0 - 100
  compositeScore: number; // 0 - 100
  tier: StrengthTierMeta;
  recentSets: number; // Sets in timeframe
  totalVolumeKg: number; // Approximate tonnage
  bestExerciseName?: string;
  bestRecordText?: string;
  bestRecordValue?: number;
}

export interface RadarDataPoint {
  subject: string;
  category: WorkoutCategory;
  composite: number;
  strength: number;
  activity: number;
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
  /** Inline-style-safe hex matching `color` (Tailwind class names are not valid CSS colors) */
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
 * Returns map of category to relative weight (summing to 1.0).
 */
export function resolveExerciseMuscles(
  exerciseName: string,
  fallbackCategories?: WorkoutCategory[] | string[] | string
): Record<WorkoutCategory, number> {
  const std = findExerciseStandard(exerciseName);
  if (std && std.muscleWeights) {
    const result: Record<WorkoutCategory, number> = {
      [WorkoutCategory.Chest]: 0,
      [WorkoutCategory.Back]: 0,
      [WorkoutCategory.Legs]: 0,
      [WorkoutCategory.Shoulders]: 0,
      [WorkoutCategory.Others]: 0,
      [WorkoutCategory.Cardio]: 0,
    };
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

  const result: Record<WorkoutCategory, number> = {
    [WorkoutCategory.Chest]: 0,
    [WorkoutCategory.Back]: 0,
    [WorkoutCategory.Legs]: 0,
    [WorkoutCategory.Shoulders]: 0,
    [WorkoutCategory.Others]: 0,
    [WorkoutCategory.Cardio]: 0,
  };

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
 * Calculates a standardized 0 - 100 score for an exercise value
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

  // Beyond the elite threshold: score saturates at 100 (must never regress)
  return 100;
}

/**
 * Maps 0 - 100 score to StrengthTierMeta.
 * Bands are aligned with the standard thresholds: reaching standard N scores
 * exactly 20N, so score bands are 40/60/80/100 — a score of 71 can never show
 * a tier higher than the weight actually justifies.
 */
export function getStrengthTier(score: number): StrengthTierMeta {
  if (score >= 100) return STRENGTH_TIERS.elite;
  if (score >= 80) return STRENGTH_TIERS.proficient;
  if (score >= 60) return STRENGTH_TIERS.intermediate;
  if (score >= 40) return STRENGTH_TIERS.beginner;
  return STRENGTH_TIERS.novice;
}

/**
 * Single source of truth for a PR's tier assessment: the current tier is the
 * highest standard threshold reached, and the next milestone is the next
 * threshold above. Keeps the tier badge and the "next tier" hint consistent.
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
 * Full analytics calculation over user's workout logs and PR records
 */
export function calculateFullWorkoutAnalytics(
  logs: WorkoutLog[],
  userPrs: Record<string, number> = {},
  days = 30
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
  const cutoffTime = now - days * 24 * 60 * 60 * 1000;

  const recentLogs = logs.filter((l) => {
    const t = new Date(l.timestamp).getTime();
    return !isNaN(t) && t >= cutoffTime;
  });

  // 1. Calculate sets, volume & workout count per category with compound distribution
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

  // Track max cardio stats from logs
  const maxCardioDuration = { minutes: 0, exerciseName: '有氧训练' };

  recentLogs.forEach((log) => {
    const logCategories = parseCategories(typeof log.category === 'string' ? log.category : '');
    const exercises = Array.isArray(log.exercises) ? log.exercises : [];
    const logCategoryTouched = new Set<WorkoutCategory>();

    exercises.forEach((ex) => {
      const muscles = resolveExerciseMuscles(ex.name, logCategories);
      const sets = Math.max(ex.sets || 1, 1);
      const weight = ex.weight || 0;
      const reps = ex.reps || 10;
      const tonnage = weight * sets * reps;

      if (ex.type === 'cardio') {
        const dur = ex.duration || 0;
        if (dur > maxCardioDuration.minutes) {
          maxCardioDuration.minutes = dur;
          maxCardioDuration.exerciseName = ex.name || '跑步';
        }
      }

      for (const [catStr, share] of Object.entries(muscles)) {
        const cat = catStr as WorkoutCategory;
        if (share > 0) {
          categorySets[cat] += sets * share;
          categoryTonnage[cat] += tonnage * share;
          logCategoryTouched.add(cat);
        }
      }
    });

    logCategoryTouched.forEach((cat) => {
      categoryWorkoutOccurrences[cat] += 1;
    });
  });

  // 2. Calculate category strength score from PRs
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

  const categorizedPrs: CategorizedPrItem[] = [];

  // Evaluate each strength PR in user profile
  Object.entries(userPrs).forEach(([name, weight]) => {
    if (typeof weight !== 'number' || weight <= 0) return;
    const muscles = resolveExerciseMuscles(name);
    const std = findExerciseStandard(name);
    const primary = std?.primaryCategory || Object.keys(muscles)[0] as WorkoutCategory;

    const assessment = resolveStrengthAssessment(name, weight, primary);
    const singleScore = assessment.score;

    categorizedPrs.push({
      name,
      category: primary,
      weight,
      unit: std?.unit || 'kg',
      score: singleScore,
      tier: assessment.tier,
      nextMilestone: assessment.nextMilestone,
    });

    // Distribute score across all stimulated categories
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

  // Factor in cardio PR / max duration
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

  // 3. Assemble category details & radar points
  const categoryDetails: Record<WorkoutCategory, CategoryScoreDetail> = {} as any;
  const radarData: RadarDataPoint[] = [];

  const totalSetsAll = Object.values(categorySets).reduce((a, b) => a + b, 0);

  Object.values(WorkoutCategory).forEach((cat) => {
    const meta = CATEGORY_META[cat];
    const strength = categoryStrengthScores[cat].maxScore || 0;
    const sets = Math.round(categorySets[cat]);
    const workouts = categoryWorkoutOccurrences[cat];

    // Activity score: 0-100 based on recent 30-day training frequency & sets
    // 0 sets -> 0 pts; 8 sets (~2 workouts) -> 50 pts; 16+ sets (~4+ workouts) -> 90+ pts
    let activity = 0;
    if (sets > 0) {
      activity = Math.min(100, Math.round(Math.min(sets * 5, 60) + Math.min(workouts * 10, 40)));
    }

    // Composite: 70% Strength + 30% Activity (if PR exists), otherwise activity-boosted
    let composite = 0;
    if (strength > 0) {
      composite = Math.round(strength * 0.7 + activity * 0.3);
    } else if (activity > 0) {
      composite = Math.round(activity * 0.5); // Has logs but no tracked heavy strength PR
    }

    const tier = getStrengthTier(composite);

    categoryDetails[cat] = {
      category: cat,
      zh: meta.zh,
      en: meta.en,
      strengthScore: strength,
      activityScore: activity,
      compositeScore: composite,
      tier,
      recentSets: sets,
      totalVolumeKg: Math.round(categoryTonnage[cat]),
      bestExerciseName: categoryStrengthScores[cat].bestName,
      bestRecordValue: categoryStrengthScores[cat].bestValue,
      bestRecordText:
        cat === WorkoutCategory.Cardio
          ? categoryStrengthScores[cat].bestValue
            ? `${categoryStrengthScores[cat].bestValue} 分钟`
            : undefined
          : categoryStrengthScores[cat].bestValue
          ? `${categoryStrengthScores[cat].bestValue} KG`
          : undefined,
    };

    radarData.push({
      subject: meta.zh,
      category: cat,
      composite,
      strength,
      activity,
      fullMark: 100,
    });
  });

  // 4. Volume Distribution
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

  // 5. Intelligent Insights & Recommendations
  const activeScores = Object.values(categoryDetails).map((c) => c.compositeScore);
  const maxScore = Math.max(...activeScores, 0);
  const minScore = Math.min(...activeScores, 0);

  const sortedCategories = [...Object.values(categoryDetails)].sort(
    (a, b) => b.compositeScore - a.compositeScore
  );

  const dominant = sortedCategories[0]?.compositeScore > 0 ? sortedCategories[0] : undefined;
  const lagging =
    sortedCategories[sortedCategories.length - 1]?.compositeScore >= 0
      ? sortedCategories[sortedCategories.length - 1]
      : undefined;

  // Balance calculation (standard deviation / spread)
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

  if (dominant && dominant.compositeScore >= 40) {
    highlights.push(
      `优势部位：${dominant.zh} (${dominant.compositeScore}分 · ${dominant.tier.zh})，基础力量扎实。`
    );
  } else if (recentLogs.length > 0) {
    highlights.push(`训练状态良好，近 ${days} 天累计完成 ${recentLogs.length} 次训练打卡！`);
  } else {
    highlights.push('记录你的第一次训练，即可激活全维度力量能力图谱！');
  }

  if (lagging && lagging.compositeScore < (dominant?.compositeScore || 50) - 20) {
    recommendations.push(
      `薄弱提醒：${lagging.zh} (${lagging.compositeScore}分) 相对滞后，建议增加 1-2 次针对性训练，提升全身肌力协调。`
    );
  }

  if (categorySets[WorkoutCategory.Legs] === 0 && recentLogs.length >= 3) {
    recommendations.push('提示：近期下肢腿部训练较少，适度深蹲硬拉可促进睾酮分泌与力量进阶！');
  } else if (categorySets[WorkoutCategory.Cardio] === 0 && recentLogs.length >= 4) {
    recommendations.push('心肺建议：每周穿插 1 次 20-30 分钟有氧或 HIIT，有助于提升体能恢复效率。');
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
      dominantScore: dominant?.compositeScore || 0,
      laggingScore: lagging?.compositeScore || 0,
      highlights,
      recommendations,
    },
    categorizedPrs: categorizedPrs.sort((a, b) => b.score - a.score),
    recentWorkoutsCount: recentLogs.length,
    recentSetsCount: Math.round(totalSetsAll),
  };
}
