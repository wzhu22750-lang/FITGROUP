/**
 * Training Capacity V3 — "近 28 天训练状态" score.
 *
 * Answers ONLY "how has this person been training lately", never "how strong
 * are they" (spec #21). Four dimensions:
 *   Frequency (25%)  — continuous weekly trained-days curve, no 0→25 jump
 *   Volume (30%)     — effective sets vs per-muscle targets, capped piecewise
 *   Progression (25%)— e1RM change vs the previous period, NOT tonnage ratio
 *   Consistency (20%)— active weeks + week-to-week stability
 * Pure functions; the orchestrator in workoutAnalytics feeds per-muscle stats.
 */
import {
  FREQUENCY_BREAKPOINTS,
  PROGRESSION_BREAKPOINTS,
  PROGRESSION_NEUTRAL_SCORE,
  SubMuscleGroup,
  SubMuscleTrainingTarget,
  SUB_MUSCLE_TRAINING_TARGETS,
  TRAINING_SCORE_WEIGHTS,
  interpolateScore,
  volumeScoreForSets,
} from '../constants/muscleCoefficients';

export interface SubMuscleTrainingStats {
  subMuscle: SubMuscleGroup;
  /** Distinct training days touching this muscle in the scoring period. */
  trainingDays: number;
  /** Total effective sets in the scoring period (stimulus coefficients applied). */
  effectiveSets: number;
  /** Weekly effective-set counts per iso-week of the window (consistency input). */
  weeklyEffectiveSets: number[];
}

export interface SubMuscleCapacityDetail {
  subMuscle: SubMuscleGroup;
  target: SubMuscleTrainingTarget;
  frequencyScore: number;
  volumeScore: number;
  progressionScore: number;
  consistencyScore: number;
  score: number;
  weeklyFrequency: number;
  weeklyEffectiveSets: number;
  hasProgressionBaseline: boolean;
}

export interface TrainingCapacityResult {
  /** 0-100 composite training-state score. */
  score: number;
  frequencyScore: number;
  volumeScore: number;
  progressionScore: number;
  consistencyScore: number;
  /** False when there is no training data at all in the window. */
  hasData: boolean;
  /** Weighted sub-muscle details (informational + UI drill-down). */
  subMuscleDetails: SubMuscleCapacityDetail[];
}

const weeksOf = (windowDays: number) => Math.max(1, windowDays / 7);

/** A. Frequency: continuous interpolation over weekly trained days. */
export function frequencyScore(weeklyTrainedDays: number): number {
  return interpolateScore(weeklyTrainedDays, FREQUENCY_BREAKPOINTS);
}

/** B. Volume: piecewise against the muscle's own target range. */
export function volumeScore(weeklyEffectiveSets: number, subMuscle: SubMuscleGroup): number {
  return volumeScoreForSets(weeklyEffectiveSets, SUB_MUSCLE_TRAINING_TARGETS[subMuscle]);
}

/**
 * C. Progression: maps the e1RM ratio of a muscle's evidence to a score.
 * `null` ratio means "no baseline in the previous period" → neutral 50 with
 * the caller expected to mark low confidence (spec #17) — never 100.
 */
export function progressionScore(ratio: number | null): number {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return PROGRESSION_NEUTRAL_SCORE;
  return interpolateScore(ratio, PROGRESSION_BREAKPOINTS);
}

/**
 * D. Consistency: 60% weight on how many of the window's weeks had any
 * training, 40% on week-to-week stability (1 − CV of weekly sets). A single
 * cramming week therefore scores far below an evenly distributed month.
 */
export function consistencyScore(weeklyEffectiveSets: number[]): { score: number; activeWeeks: number } {
  const weeks = weeklyEffectiveSets.length;
  if (weeks === 0) return { score: 0, activeWeeks: 0 };
  const total = weeklyEffectiveSets.reduce((a, b) => a + b, 0);
  if (total <= 0) return { score: 0, activeWeeks: 0 };
  const activeWeeks = weeklyEffectiveSets.filter((s) => s > 0).length;
  const mean = total / weeks;
  const variance = weeklyEffectiveSets.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / weeks;
  const stability = mean > 0 ? Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / mean)) : 0;
  const score = (activeWeeks / weeks) * 60 + stability * 40;
  return { score: Math.min(100, score), activeWeeks };
}

/**
 * Aggregate one muscle's four dimension scores into its composite.
 * Weights: Frequency 25% / Volume 30% / Progression 25% / Consistency 20%.
 */
export function subMuscleCapacityScore(detail: {
  frequencyScore: number;
  volumeScore: number;
  progressionScore: number;
  consistencyScore: number;
}): number {
  return Math.min(100, Math.round(
    detail.frequencyScore * TRAINING_SCORE_WEIGHTS.frequency +
    detail.volumeScore * TRAINING_SCORE_WEIGHTS.volume +
    detail.progressionScore * TRAINING_SCORE_WEIGHTS.progression +
    detail.consistencyScore * TRAINING_SCORE_WEIGHTS.consistency
  ));
}

/**
 * Compute the V3 training capacity for one category from its sub-muscles.
 * `progressionRatioByMuscle` maps sub-muscle → aggregated e1RM ratio (or null
 * when no baseline exists). Sub-muscle composite scores are then averaged with
 * the category's configured sub-muscle weights.
 */
export function computeTrainingCapacity(
  subMuscleWeights: Record<string, number>,
  statsByMuscle: Map<SubMuscleGroup, SubMuscleTrainingStats>,
  progressionRatioByMuscle: Map<SubMuscleGroup, number | null>,
  windowDays: number
): TrainingCapacityResult {
  const weeks = weeksOf(windowDays);
  const details: SubMuscleCapacityDetail[] = [];
  let weightedScore = 0;
  let weightSum = 0;
  let weightedFrequency = 0;
  let weightedVolume = 0;
  let weightedProgression = 0;
  let weightedConsistency = 0;
  let anyData = false;

  Object.keys(subMuscleWeights).forEach((smKey) => {
    const subMuscle = smKey as SubMuscleGroup;
    const weight = subMuscleWeights[smKey];
    if (!Number.isFinite(weight) || weight <= 0) return;
    weightSum += weight;

    const stats = statsByMuscle.get(subMuscle);
    const effectiveSets = stats?.effectiveSets ?? 0;
    const trainingDays = stats?.trainingDays ?? 0;
    const weekly = stats?.weeklyEffectiveSets?.length
      ? stats.weeklyEffectiveSets
      : new Array(Math.max(1, Math.round(windowDays / 7))).fill(0);

    if (effectiveSets > 0 || trainingDays > 0) anyData = true;

    const weeklyTrainedDays = trainingDays / weeks;
    const weeklySets = effectiveSets / weeks;
    const freq = frequencyScore(weeklyTrainedDays);
    const vol = volumeScore(weeklySets, subMuscle);
    const ratio = progressionRatioByMuscle.get(subMuscle) ?? null;
    const prog = progressionScore(ratio);
    const cons = consistencyScore(weekly).score;

    const detail: SubMuscleCapacityDetail = {
      subMuscle,
      target: SUB_MUSCLE_TRAINING_TARGETS[subMuscle],
      frequencyScore: Math.round(freq),
      volumeScore: Math.round(vol),
      progressionScore: Math.round(prog),
      consistencyScore: Math.round(cons),
      score: 0,
      weeklyFrequency: Number(weeklyTrainedDays.toFixed(1)),
      weeklyEffectiveSets: Number(weeklySets.toFixed(1)),
      hasProgressionBaseline: ratio !== null,
    };
    detail.score = subMuscleCapacityScore(detail);
    details.push(detail);

    weightedScore += detail.score * weight;
    weightedFrequency += detail.frequencyScore * weight;
    weightedVolume += detail.volumeScore * weight;
    weightedProgression += detail.progressionScore * weight;
    weightedConsistency += detail.consistencyScore * weight;
  });

  if (weightSum === 0) {
    return {
      score: 0,
      frequencyScore: 0,
      volumeScore: 0,
      progressionScore: 0,
      consistencyScore: 0,
      hasData: false,
      subMuscleDetails: [],
    };
  }

  return {
    score: Math.min(100, Math.round(weightedScore / weightSum)),
    frequencyScore: Math.min(100, Math.round(weightedFrequency / weightSum)),
    volumeScore: Math.min(100, Math.round(weightedVolume / weightSum)),
    progressionScore: Math.min(100, Math.round(weightedProgression / weightSum)),
    consistencyScore: Math.min(100, Math.round(weightedConsistency / weightSum)),
    hasData: anyData,
    subMuscleDetails: details,
  };
}
