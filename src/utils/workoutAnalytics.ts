import { WorkoutCategory, WorkoutLog, Exercise, StrengthBodyContext, CardioScoreBreakdown } from '../types';
import {
  EXERCISE_STANDARDS,
  STRENGTH_TIERS,
  StrengthTierKey,
  StrengthTierMeta,
  ExerciseStandard,
  StrengthFamily,
  G_CURVES,
  EXPONENT_B,
  BW_CLAMP_MIN,
  BW_CLAMP_MAX,
  REF_BW,
} from '../constants/strengthStandards';
import {
  CATEGORY_META,
  parseCategories,
  CARDIO_REFERENCE_BODYWEIGHT_KG,
  CARDIO_MAX_DURATION_MINUTES,
  CARDIO_MAX_DISTANCE_KM,
  CARDIO_MAX_CALORIES,
  resolveCardioActivity,
  isCardioExercise,
  estimateCardioCalories,
} from '../constants/workoutPresets';
import {
  SubMuscleGroup,
  CATEGORY_SUB_MUSCLES,
  SUB_MUSCLE_WEIGHTS,
  SUB_MUSCLE_META,
  SCORE_WEIGHTS,
  VOLUME_TARGET_PER_WEEK,
  SCORING_PERIOD_DAYS,
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
  trainingScore: number; // 0 - 100 (category composite; Cardio uses its V2 five-dimension model)
  strengthScore: number; // 0 - 100 (Pure PR Strength Level; always 0 for Cardio)
  cardioScore?: number; // 0 - 100 (Cardio-only multidimensional score)
  activityScore: number; // 0 - 100 (Frequency Score component)
  compositeScore: number; // 0 - 100 (Alias to trainingScore for backward compatibility)
  tier: StrengthTierMeta | CardioTierMeta;
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
    reported?: number;
    estimated?: number;
  };
  cardioMetrics?: CardioScoreBreakdown;
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

export interface CardioTierMeta {
  key: 'cardio_start' | 'cardio_basic' | 'cardio_steady' | 'cardio_good' | 'cardio_excellent';
  level: number;
  score: number;
  zh: string;
  en: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

export interface CardioExerciseMetrics {
  name: string;
  canonicalName: string;
  met: number;
  durationMinutes: number;
  effectiveMinutes: number;
  distanceKm: number;
  weightedMinutes: number;
  intensityScore: number;
  intensityFactor: number;
  speedKph?: number;
  paceMinutesPerKm?: number;
  reportedCalories: number;
  estimatedCalories: number;
  calories: number;
  validForScoring: boolean;
  sessionWeight: number;
}

export interface CardioExerciseRecord extends CardioExerciseMetrics {
  timestamp: string;
}

const CARDIO_MINIMUM_SESSION_MINUTES = 5;
const CARDIO_NORMAL_SESSION_MINUTES = 10;
const CARDIO_SCORE_WEIGHTS = {
  frequency: 0.20,
  duration: 0.30,
  intensity: 0.25,
  volume: 0.15,
  consistency: 0.10,
} as const;

const CARDIO_DURATION_BREAKPOINTS: Array<[number, number]> = [
  [0, 0], [30, 20], [60, 40], [90, 60], [150, 80], [210, 95], [300, 100],
];
const CARDIO_VOLUME_BREAKPOINTS: Array<[number, number]> = [
  [0, 0], [30, 20], [60, 40], [100, 60], [150, 80], [220, 95], [300, 100],
];

function clampCardio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function interpolateCardioScore(value: number, breakpoints: Array<[number, number]>): number {
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  if (safeValue <= breakpoints[0][0]) return breakpoints[0][1];
  for (let i = 1; i < breakpoints.length; i += 1) {
    const [x1, y1] = breakpoints[i - 1];
    const [x2, y2] = breakpoints[i];
    if (safeValue <= x2) {
      const ratio = (safeValue - x1) / (x2 - x1);
      return y1 + ratio * (y2 - y1);
    }
  }
  return breakpoints[breakpoints.length - 1][1];
}

function localDateKey(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calculateCardioIntensityScore(met: number): number {
  return Math.round(clampCardio(((met - 2.5) / 7.5) * 100, 0, 100));
}

export function calculateCardioIntensityFactor(met: number): number {
  return Number(clampCardio(0.5 + ((met - 3) / 7) * 0.5, 0.5, 1).toFixed(3));
}

export const CARDIO_TIERS: CardioTierMeta[] = [
  { key: 'cardio_start', level: 1, score: 0, zh: '起步', en: 'Starting', badgeBg: 'bg-slate-200', badgeText: 'text-slate-800', description: '建立稳定的有氧训练习惯' },
  { key: 'cardio_basic', level: 2, score: 20, zh: '基础', en: 'Basic', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800', description: '开始形成有效的训练投入' },
  { key: 'cardio_steady', level: 3, score: 40, zh: '稳定', en: 'Steady', badgeBg: 'bg-blue-100', badgeText: 'text-blue-800', description: '有氧训练频率和时间较为稳定' },
  { key: 'cardio_good', level: 4, score: 60, zh: '良好', en: 'Good', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800', description: '训练投入、强度和持续性表现良好' },
  { key: 'cardio_excellent', level: 5, score: 80, zh: '优秀', en: 'Excellent', badgeBg: 'bg-amber-300', badgeText: 'text-amber-950', description: '形成高质量且持续的有氧训练模式' },
];

export function getCardioTier(score: number): CardioTierMeta {
  const safeScore = clampCardio(score, 0, 100);
  if (safeScore >= 80) return CARDIO_TIERS[4];
  if (safeScore >= 60) return CARDIO_TIERS[3];
  if (safeScore >= 40) return CARDIO_TIERS[2];
  if (safeScore >= 20) return CARDIO_TIERS[1];
  return CARDIO_TIERS[0];
}

export function calculateCardioExerciseMetrics(
  exercise: Exercise,
  bodyweightKg = CARDIO_REFERENCE_BODYWEIGHT_KG
): CardioExerciseMetrics {
  const activity = resolveCardioActivity(exercise.name);
  const durationInput = typeof exercise.duration === 'number' && Number.isFinite(exercise.duration)
    ? clampCardio(exercise.duration, 0, CARDIO_MAX_DURATION_MINUTES)
    : 0;
  const distanceKm = typeof exercise.distance === 'number' && Number.isFinite(exercise.distance)
    ? clampCardio(exercise.distance, 0, CARDIO_MAX_DISTANCE_KM)
    : 0;
  const reportedCalories = exercise.caloriesSource !== 'estimated' && typeof exercise.calories === 'number' && Number.isFinite(exercise.calories) && exercise.calories > 0
    ? clampCardio(exercise.calories, 0, CARDIO_MAX_CALORIES)
    : 0;
  const fallbackSpeed = activity.meta?.fallbackSpeedKph;
  const inferredDuration = durationInput <= 0 && reportedCalories <= 0 && distanceKm > 0 && fallbackSpeed && fallbackSpeed > 0
    ? clampCardio((distanceKm / fallbackSpeed) * 60, 0, CARDIO_MAX_DURATION_MINUTES)
    : 0;
  const durationMinutes = durationInput > 0 ? durationInput : inferredDuration;
  const validForScoring = durationMinutes >= CARDIO_MINIMUM_SESSION_MINUTES;
  const effectiveMinutes = validForScoring ? durationMinutes : 0;
  const intensityScore = calculateCardioIntensityScore(activity.met);
  const intensityFactor = calculateCardioIntensityFactor(activity.met);
  const weightedMinutes = Number((effectiveMinutes * intensityFactor).toFixed(2));
  const estimatedCalories = reportedCalories === 0 && durationMinutes > 0
    ? estimateCardioCalories(exercise.name, durationMinutes, bodyweightKg)
    : 0;
  const calories = reportedCalories > 0 ? reportedCalories : estimatedCalories;
  const sessionWeight = validForScoring
    ? Number(Math.min(1, durationMinutes / CARDIO_NORMAL_SESSION_MINUTES).toFixed(3))
    : 0;
  const speedKph = distanceKm > 0 && durationMinutes > 0
    ? Number((distanceKm / (durationMinutes / 60)).toFixed(2))
    : undefined;
  const paceMinutesPerKm = distanceKm > 0 && durationMinutes > 0
    ? Number((durationMinutes / distanceKm).toFixed(2))
    : undefined;

  return {
    name: exercise.name?.trim() || '有氧训练',
    canonicalName: activity.name,
    met: activity.met,
    durationMinutes: Number(durationMinutes.toFixed(2)),
    effectiveMinutes: Number(effectiveMinutes.toFixed(2)),
    distanceKm: Number(distanceKm.toFixed(2)),
    weightedMinutes,
    intensityScore,
    intensityFactor,
    speedKph,
    paceMinutesPerKm,
    reportedCalories: Math.round(reportedCalories),
    estimatedCalories: Math.round(estimatedCalories),
    calories: Math.round(calories),
    validForScoring,
    sessionWeight,
  };
}

export function calculateCardioScore(
  records: CardioExerciseRecord[],
  periodDays = SCORING_PERIOD_DAYS,
  periodEndMs = Date.now()
): CardioScoreBreakdown {
  const safeDays = Math.max(1, Number.isFinite(periodDays) ? periodDays : SCORING_PERIOD_DAYS);
  const periodStartMs = periodEndMs - safeDays * 24 * 60 * 60 * 1000;
  const inWindowRecords = records.filter((record) => {
    const timestamp = new Date(record.timestamp).getTime();
    return Number.isFinite(timestamp) && timestamp >= periodStartMs && timestamp <= periodEndMs;
  });
  const validRecords = inWindowRecords.filter((record) => record.validForScoring);
  const weeks = Math.max(1, safeDays / 7);
  const weekCount = Math.max(1, Math.ceil(safeDays / 7));
  const weekDurationMs = safeDays * 24 * 60 * 60 * 1000 / weekCount;
  const days = new Map<string, { weekIndex: number; duration: number; weighted: number; sessionWeight: number; calories: number; reported: number; estimated: number; metDuration: number; intensityDuration: number; bestActivity?: string; bestActivityWeighted: number }>();
  validRecords.forEach((record) => {
    const timestamp = new Date(record.timestamp).getTime();
    const key = localDateKey(record.timestamp) || new Date(timestamp).toISOString().slice(0, 10);
    const weekIndex = Math.min(weekCount - 1, Math.max(0, Math.floor((timestamp - periodStartMs) / weekDurationMs)));
    const current = days.get(key) || { weekIndex, duration: 0, weighted: 0, sessionWeight: 0, calories: 0, reported: 0, estimated: 0, metDuration: 0, intensityDuration: 0, bestActivityWeighted: 0 };
    current.duration += record.effectiveMinutes;
    current.weighted += record.weightedMinutes;
    current.calories += record.calories;
    current.reported += record.reportedCalories;
    current.estimated += record.estimatedCalories;
    current.metDuration += record.met * record.effectiveMinutes;
    current.intensityDuration += record.intensityScore * record.effectiveMinutes;
    current.sessionWeight = Math.min(1, current.duration / CARDIO_NORMAL_SESSION_MINUTES);
    if (record.weightedMinutes > current.bestActivityWeighted) {
      current.bestActivity = record.name;
      current.bestActivityWeighted = record.weightedMinutes;
    }
    days.set(key, current);
  });

  const dayEntries = [...days.entries()];
  const effectiveMinutes = dayEntries.reduce((sum, [, day]) => sum + day.duration, 0);
  const weightedMinutes = dayEntries.reduce((sum, [, day]) => sum + day.weighted, 0);
  const weeklyEffectiveMinutes = effectiveMinutes / weeks;
  const weeklyWeightedMinutes = weightedMinutes / weeks;
  const weeklySessions = dayEntries.reduce((sum, [, day]) => sum + day.sessionWeight, 0) / weeks;
  const frequencyScore = interpolateCardioScore(weeklySessions, [[0, 0], [0.5, 20], [1, 40], [2, 70], [3, 90], [4, 100]]);
  const durationScore = interpolateCardioScore(weeklyEffectiveMinutes, CARDIO_DURATION_BREAKPOINTS);
  const volumeScore = interpolateCardioScore(weeklyWeightedMinutes, CARDIO_VOLUME_BREAKPOINTS);
  const intensityScore = effectiveMinutes > 0
    ? dayEntries.reduce((sum, [, day]) => sum + day.intensityDuration, 0) / effectiveMinutes
    : 0;
  const weeklySessionTotals = Array.from({ length: weekCount }, (_, index) =>
    dayEntries.reduce((sum, [, day]) => day.weekIndex === index ? sum + day.sessionWeight : sum, 0)
  );
  const activeWeeks = weeklySessionTotals.filter((value) => value > 0).length;
  const meanWeeklySessions = weeklySessionTotals.reduce((sum, value) => sum + value, 0) / weeklySessionTotals.length;
  const variance = weeklySessionTotals.reduce((sum, value) => sum + Math.pow(value - meanWeeklySessions, 2), 0) / weeklySessionTotals.length;
  const stability = meanWeeklySessions > 0 ? clampCardio(1 - Math.sqrt(variance) / meanWeeklySessions, 0, 1) : 0;
  const consistencyScore = meanWeeklySessions > 0
    ? (activeWeeks / weeklySessionTotals.length) * (60 + stability * 40)
    : 0;
  const reportedCalories = validRecords.reduce((sum, record) => sum + record.reportedCalories, 0);
  const estimatedCalories = validRecords.reduce((sum, record) => sum + record.estimatedCalories, 0);
  const calories = reportedCalories + estimatedCalories;
  const calorieTarget = DEFAULT_CARDIO_CALORIE_TARGET;
  const bestDay = [...dayEntries].sort(([, a], [, b]) => b.weighted - a.weighted)[0];
  const score = clampCardio(
    frequencyScore * CARDIO_SCORE_WEIGHTS.frequency +
      durationScore * CARDIO_SCORE_WEIGHTS.duration +
      intensityScore * CARDIO_SCORE_WEIGHTS.intensity +
      volumeScore * CARDIO_SCORE_WEIGHTS.volume +
      consistencyScore * CARDIO_SCORE_WEIGHTS.consistency,
    0,
    100
  );

  return {
    score: Math.round(score),
    frequencyScore: Math.round(frequencyScore),
    durationScore: Math.round(durationScore),
    intensityScore: Math.round(intensityScore),
    volumeScore: Math.round(volumeScore),
    consistencyScore: Math.round(consistencyScore),
    validSessions: dayEntries.length,
    activeDays: dayEntries.length,
    activeWeeks,
    effectiveMinutes: Math.round(effectiveMinutes),
    weightedMinutes: Math.round(weightedMinutes),
    weeklyEffectiveMinutes: Number(weeklyEffectiveMinutes.toFixed(1)),
    weeklyWeightedMinutes: Number(weeklyWeightedMinutes.toFixed(1)),
    weeklySessions: Number(weeklySessions.toFixed(2)),
    averageMet: effectiveMinutes > 0 ? Number((dayEntries.reduce((sum, [, day]) => sum + day.metDuration, 0) / effectiveMinutes).toFixed(2)) : 0,
    reportedCalories,
    estimatedCalories,
    calories,
    calorieTarget,
    calorieCompletionRate: Math.round(clampCardio((calories / calorieTarget) * 100, 0, 100)),
    bestActivityName: bestDay?.[1].bestActivity,
  };
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
export interface ExercisePerformanceValidation {
  valid: boolean;
  reason?: string;
  externalLoad: number;
  bodyweight: number;
  effectiveLoad: number;
  estimated1RM: number;
}

/** Calculate Epley 1RM from an already-resolved effective load. */
export function estimateOneRepMax(effectiveLoad: number, reps: number): number {
  if (!Number.isFinite(effectiveLoad) || effectiveLoad <= 0 || !Number.isFinite(reps) || reps <= 0) return 0;
  if (reps <= 1) return Number(effectiveLoad.toFixed(1));
  const validReps = Math.min(10, Math.max(1, Math.round(reps)));
  return Number((effectiveLoad * (1 + validReps / 30)).toFixed(1));
}

/**
 * Pull-up records store the user's external load in Exercise.weight.
 * Ordinary resistance exercises keep their logged load unchanged.
 */
export function isPullUpExercise(name: string): boolean {
  if (!name) return false;
  const clean = normalizeName(name);
  return clean.includes('引体') || clean.includes('pullup') || clean.includes('chinup');
}

export function calculateEffectiveLoad(
  exerciseName: string,
  externalLoad: number,
  bodyweightKg: number = REF_BW
): number {
  const load = Number.isFinite(externalLoad) ? externalLoad : 0;
  if (!isPullUpExercise(exerciseName)) return Math.max(0, Number(load.toFixed(1)));
  const bodyweight = Number.isFinite(bodyweightKg) && bodyweightKg > 0 ? bodyweightKg : REF_BW;
  return Math.max(0, Number((bodyweight + load).toFixed(1)));
}

/** Backward-compatible name; the returned value is always effectiveLoad, not externalLoad. */
export const resolveEffectiveExerciseWeight = calculateEffectiveLoad;

export function validateExercisePerformance(
  exerciseName: string,
  externalLoad: number,
  reps: number,
  bodyweightKg: number = REF_BW
): ExercisePerformanceValidation {
  const bodyweight = Number.isFinite(bodyweightKg) && bodyweightKg > 0 ? bodyweightKg : REF_BW;
  const effectiveLoad = calculateEffectiveLoad(exerciseName, externalLoad, bodyweight);
  const estimated1RM = estimateOneRepMax(effectiveLoad, reps);
  if (!Number.isFinite(externalLoad)) return { valid: false, reason: 'externalLoad is not finite', externalLoad: 0, bodyweight, effectiveLoad: 0, estimated1RM: 0 };
  if (!Number.isFinite(reps) || reps <= 0 || !Number.isInteger(reps)) return { valid: false, reason: 'reps must be a positive integer', externalLoad, bodyweight, effectiveLoad, estimated1RM: 0 };
  if (isPullUpExercise(exerciseName) && effectiveLoad <= 0) return { valid: false, reason: 'effectiveLoad must be positive', externalLoad, bodyweight, effectiveLoad, estimated1RM: 0 };
  if (!Number.isFinite(estimated1RM) || estimated1RM <= 0 || estimated1RM > 5000) return { valid: false, reason: 'estimated1RM is outside the supported range', externalLoad, bodyweight, effectiveLoad, estimated1RM: 0 };
  return { valid: true, externalLoad, bodyweight, effectiveLoad, estimated1RM };
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
  if (
    clean.includes('跑') ||
    clean.includes('骑') ||
    clean.includes('单车') ||
    clean.includes('跳绳') ||
    clean.includes('爬楼') ||
    clean.includes('椭圆') ||
    clean.includes('有氧') ||
    clean.includes('cardio') ||
    clean.includes('run') ||
    clean.includes('hiit') ||
    clean.includes('羽毛球') ||
    clean.includes('篮球') ||
    clean.includes('足球') ||
    clean.includes('乒乓') ||
    clean.includes('网球') ||
    clean.includes('游泳') ||
    clean.includes('拳击') ||
    clean.includes('搏击') ||
    clean.includes('散步') ||
    clean.includes('健走') ||
    clean.includes('瑜伽') ||
    clean.includes('普拉提') ||
    clean.includes('尊巴') ||
    clean.includes('swim')
  ) {
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
 * Extracts normalized StrengthBodyContext from a UserProfile or AppUser object.
 * Returns null if both sex and bodyweight are unset (triggers 70kg Male baseline).
 */
export function bodyContextFromProfile(p?: any): StrengthBodyContext | null {
  if (!p) return null;
  const sex = p.sex === 'female' ? 'female' : p.sex === 'male' ? 'male' : null;
  const rawBw = typeof p.bodyweightKg === 'number' && p.bodyweightKg > 0 ? p.bodyweightKg : null;
  if (!sex && !rawBw) return null;
  return {
    sex: sex || 'male',
    bodyweightKg: rawBw ? Math.min(BW_CLAMP_MAX, Math.max(BW_CLAMP_MIN, rawBw)) : REF_BW,
  };
}

/**
 * Dynamically scales 5-tier standard thresholds based on the user's sex and bodyweight.
 * Uses 70kg Male as the baseline anchor.
 */
export function scaleThresholds(
  std: ExerciseStandard,
  ctx?: StrengthBodyContext | null
): [number, number, number, number, number] {
  if (!ctx || !std.strengthFamily || std.strengthFamily === 'none') {
    return std.thresholds;
  }
  const { sex, bodyweightKg } = ctx;
  const clampedBw = Math.min(BW_CLAMP_MAX, Math.max(BW_CLAMP_MIN, bodyweightKg));
  const b = sex === 'female' ? EXPONENT_B.female : EXPONENT_B.male;
  const gCurve = G_CURVES[std.strengthFamily];

  return std.thresholds.map((refVal, idx) => {
    const g = sex === 'female' && gCurve ? gCurve[idx] : 1.0;
    let scaled = refVal;
    if (std.strengthFamily === 'bodyweight_reps') {
      // Bodyweight reps: reverse scaling (heavier person needs fewer reps for same percentile)
      scaled = refVal * g * Math.pow(REF_BW / clampedBw, EXPONENT_B.bodyweightReps);
    } else {
      // Resistance: allometric power scaling
      scaled = refVal * g * Math.pow(clampedBw / REF_BW, b);
    }
    // Round to 1 decimal place, minimum 1
    return Number(Math.max(1, Math.round(scaled * 10) / 10).toFixed(1));
  }) as [number, number, number, number, number];
}

/**
 * Calculates a standardized 0 - 100 score for a PR value based on 5 standard tiers
 */
export function calculateStandardizedScore(
  exerciseName: string,
  value: number,
  category: WorkoutCategory,
  ctx?: StrengthBodyContext | null
): number {
  if (value <= 0) return 0;
  const std = findExerciseStandard(exerciseName);

  let thresholds: [number, number, number, number, number] = [30, 50, 75, 100, 125];

  if (std && std.thresholds) {
    thresholds = scaleThresholds(std, ctx);
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
  category?: WorkoutCategory,
  ctx?: StrengthBodyContext | null
): { score: number; tier: StrengthTierMeta; nextMilestone?: CategorizedPrItem['nextMilestone'] } {
  const std = findExerciseStandard(exerciseName);
  const score = calculateStandardizedScore(
    exerciseName,
    value,
    category || std?.primaryCategory || WorkoutCategory.Others,
    ctx
  );

  if (!std?.thresholds || value <= 0) {
    return { score, tier: getStrengthTier(score) };
  }

  const scaledThresholds = scaleThresholds(std, ctx);
  const tierOrder: StrengthTierKey[] = ['novice', 'beginner', 'intermediate', 'proficient', 'elite'];
  let tier = STRENGTH_TIERS.novice;
  for (let i = 0; i < scaledThresholds.length; i++) {
    if (value >= scaledThresholds[i]) tier = STRENGTH_TIERS[tierOrder[i]];
  }

  return {
    score,
    tier,
    nextMilestone: getNextMilestone(exerciseName, value, ctx),
  };
}

/**
 * Calculates the next milestone target for an exercise
 */
export function getNextMilestone(
  exerciseName: string,
  currentWeight: number,
  ctx?: StrengthBodyContext | null
) {
  const std = findExerciseStandard(exerciseName);
  if (!std || !std.thresholds) return undefined;

  const scaledThresholds = scaleThresholds(std, ctx);
  const [t1, t2, t3, t4, t5] = scaledThresholds;
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
 * Complete analytics calculation implementing the official 6-dimension scoring framework:
 * - 28-day rolling window
 * - Sub-muscle group breakdown with direct/compound coefficients
 * - Frequency (20%) + Volume (50%) + Weight Progress (30%)
 * - Cardio scored independently from frequency, effective time, MET intensity,
 *   weighted minutes, and four-week consistency
 * - Calorie target retained only as a separate completion indicator
 * - Pure strength PR evaluated independently via 1RM standards
 */
export function calculateFullWorkoutAnalytics(
  logs: WorkoutLog[],
  userPrs: Record<string, number> = {},
  days = SCORING_PERIOD_DAYS,
  ctx?: StrengthBodyContext | null
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

  const analyticsBodyweightKg = ctx?.bodyweightKg && ctx.bodyweightKg > 0
    ? ctx.bodyweightKg
    : CARDIO_REFERENCE_BODYWEIGHT_KG;
  const cardioRecords: CardioExerciseRecord[] = logs.flatMap((log) =>
    (Array.isArray(log.exercises) ? log.exercises : [])
      .filter((exercise) => exercise.type === 'cardio' || isCardioExercise(exercise.name))
      .map((exercise) => ({
        ...calculateCardioExerciseMetrics(exercise, analyticsBodyweightKg),
        timestamp: log.timestamp,
      }))
  );

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
      const rawWeight = typeof ex.weight === 'number' ? ex.weight : 0;
      const effectiveWeight = calculateEffectiveLoad(ex.name, rawWeight, analyticsBodyweightKg);
      const tonnage = effectiveWeight * sets * reps;

      // Cardio never enters strength-volume or strength-score calculations.
      if (ex.type === 'cardio' || isCardioExercise(ex.name)) return;

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



  // 1. Process recent logs (current period)
  recentLogs.forEach((log) => processLogExercises(log, true));

  // 2. Process baseline logs (prior period)
  baselineLogs.forEach((log) => processLogExercises(log, false));

  // Cardio is intentionally scored on a fixed 28-day window, even when the
  // caller is using a 7-day volume view for the other dimensions.
  const cardioSummary = calculateCardioScore(cardioRecords, SCORING_PERIOD_DAYS, now);
  categorySets[WorkoutCategory.Cardio] = cardioSummary.validSessions;
  categoryWorkoutOccurrences[WorkoutCategory.Cardio] = cardioSummary.validSessions;

  // 3. Process Pure Strength (PR) scores from user profile PRs and workout logs
  const categorizedPrs: CategorizedPrItem[] = [];
  type StrengthCandidate = { score: number; name: string; effectiveLoad: number };
  const categoryStrengthScores: Record<WorkoutCategory, { maxScore: number; bestName?: string; bestValue?: number; candidates: StrengthCandidate[] }> = {
    [WorkoutCategory.Chest]: { maxScore: 0, candidates: [] },
    [WorkoutCategory.Back]: { maxScore: 0, candidates: [] },
    [WorkoutCategory.Legs]: { maxScore: 0, candidates: [] },
    [WorkoutCategory.Shoulders]: { maxScore: 0, candidates: [] },
    [WorkoutCategory.Others]: { maxScore: 0, candidates: [] },
    [WorkoutCategory.Cardio]: { maxScore: 0, candidates: [] },
  };

  const recordStrengthCandidate = (category: WorkoutCategory, score: number, name: string, effectiveLoad: number, share = 1) => {
    if (!Number.isFinite(score) || score <= 0 || !Number.isFinite(effectiveLoad) || effectiveLoad <= 0) return;
    const safeScore = Math.max(0, Math.min(100, Math.round(score * (0.8 + 0.2 * Math.min(1, Math.max(0, share))))));
    if (safeScore > 0) categoryStrengthScores[category].candidates.push({ score: safeScore, name, effectiveLoad });
  };

  const userBw = analyticsBodyweightKg;

  // Workout logs are the primary source. Their weight is externalLoad for pull-ups,
  // and calculateEffectiveLoad is the only place that adds bodyweight.
  type PerformanceEntry = { name: string; effectiveLoad: number; estimated1RM: number };
  const performanceByExercise = new Map<string, PerformanceEntry>();
  logs.forEach((log) => {
    (log.exercises || []).forEach((ex) => {
      if (ex.type !== 'strength' || typeof ex.weight !== 'number' || !ex.name) return;
      const name = ex.name.trim();
      const performance = validateExercisePerformance(name, ex.weight, ex.reps || 1, userBw);
      if (!performance.valid) return;
      const standardName = findExerciseStandard(name)?.name || normalizeName(name);
      const prior = performanceByExercise.get(standardName);
      if (!prior || performance.estimated1RM > prior.estimated1RM) {
        performanceByExercise.set(standardName, { name, effectiveLoad: performance.effectiveLoad, estimated1RM: performance.estimated1RM });
      }
    });
  });

  // Profile PRs are a compatibility fallback. For pull-ups, legacy profile values
  // are externalLoad; log-derived entries replace them with validated effective-load 1RM.
  const prEntries = new Map<string, PerformanceEntry>();
  Object.entries(userPrs).forEach(([name, storedValue]) => {
    if (!Number.isFinite(storedValue)) return;
    const effectiveLoad = isPullUpExercise(name) ? calculateEffectiveLoad(name, storedValue, userBw) : Math.max(0, storedValue);
    if (effectiveLoad > 0) {
      prEntries.set(findExerciseStandard(name)?.name || normalizeName(name), { name, effectiveLoad, estimated1RM: effectiveLoad });
    }
  });
  performanceByExercise.forEach((entry, key) => prEntries.set(key, entry));

  prEntries.forEach(({ name, effectiveLoad, estimated1RM }) => {
    const muscles = resolveExerciseMuscles(name);
    const std = findExerciseStandard(name);
    const primary = std?.primaryCategory || (Object.keys(muscles)[0] as WorkoutCategory);
    const assessment = resolveStrengthAssessment(name, estimated1RM, primary, ctx);
    const singleScore = assessment.score;
    if (effectiveLoad <= 0 || !Number.isFinite(singleScore)) return;

    categorizedPrs.push({
      name, category: primary, weight: effectiveLoad, unit: std?.unit || 'kg', score: singleScore,
      estimated1RM, tier: assessment.tier, nextMilestone: getNextMilestone(name, estimated1RM, ctx),
    });
    Object.entries(muscles).forEach(([catStr, share]) => {
      if ((share || 0) >= 0.2) recordStrengthCandidate(catStr as WorkoutCategory, singleScore, name, effectiveLoad, share);
    });
  });

  // A recent set contributes its Epley estimated 1RM. Invalid or non-positive
  // effective loads never enter either PRs or muscle strength aggregation.
  recentLogs.forEach((log) => {
    (log.exercises || []).forEach((ex) => {
      if (ex.type !== 'strength' || typeof ex.weight !== 'number') return;
      const performance = validateExercisePerformance(ex.name, ex.weight, ex.reps || 1, userBw);
      if (!performance.valid) return;
      const muscles = resolveExerciseMuscles(ex.name);
      const std = findExerciseStandard(ex.name);
      const primary = std?.primaryCategory || (Object.keys(muscles)[0] as WorkoutCategory);
      const score = calculateStandardizedScore(ex.name, performance.estimated1RM, primary, ctx);
      Object.entries(muscles).forEach(([catStr, share]) => {
        if ((share || 0) >= 0.2) recordStrengthCandidate(catStr as WorkoutCategory, score, ex.name, performance.effectiveLoad, share);
      });
    });
  });

  // Do not let one outlier define an entire muscle group. Use the best three
  // distinct movements, weighted toward the best result, then apply a modest
  // coverage factor when fewer than three movements are represented.
  Object.values(WorkoutCategory).forEach((cat) => {
    const state = categoryStrengthScores[cat];
    if (cat === WorkoutCategory.Cardio || state.candidates.length === 0) return;
    const byName = new Map<string, StrengthCandidate>();
    state.candidates.forEach((candidate) => {
      const prior = byName.get(candidate.name);
      if (!prior || candidate.score > prior.score) byName.set(candidate.name, candidate);
    });
    const top = [...byName.values()].sort((a, b) => b.score - a.score).slice(0, 3);
    const rankWeights = [0.5, 0.3, 0.2];
    const weighted = top.reduce((sum, candidate, index) => sum + candidate.score * (rankWeights[index] || 0), 0) / rankWeights.slice(0, top.length).reduce((a, b) => a + b, 0);
    const coverage = 0.65 + 0.35 * Math.min(1, top.length / 3);
    state.maxScore = Math.max(0, Math.min(100, Math.round(weighted * coverage)));
    state.bestName = top[0]?.name;
    state.bestValue = top[0]?.effectiveLoad;
  });



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
      const cardioTier = getCardioTier(cardioSummary.score);
      categoryDetails[cat] = {
        category: cat,
        zh: meta.zh,
        en: meta.en,
        trainingScore: cardioSummary.score,
        cardioScore: cardioSummary.score,
        // Cardio is not a strength PR dimension and must not be displayed as one.
        strengthScore: 0,
        activityScore: cardioSummary.frequencyScore,
        compositeScore: cardioSummary.score,
        tier: cardioTier,
        recentSets: cardioSummary.validSessions,
        totalVolumeKg: 0,
        bestExerciseName: cardioSummary.bestActivityName,
        bestRecordValue: cardioSummary.effectiveMinutes,
        bestRecordText: cardioSummary.effectiveMinutes > 0 ? `${cardioSummary.effectiveMinutes} min` : undefined,
        weeklyWorkouts: cardioSummary.weeklySessions,
        cardioCalories: {
          actual: cardioSummary.calories,
          target: cardioSummary.calorieTarget,
          completionRate: cardioSummary.calorieCompletionRate,
          reported: cardioSummary.reportedCalories,
          estimated: cardioSummary.estimatedCalories,
        },
        cardioMetrics: cardioSummary,
      };

      radarData.push({
        subject: meta.zh,
        category: cat,
        composite: cardioSummary.score,
        strength: 0,
        activity: cardioSummary.frequencyScore,
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
