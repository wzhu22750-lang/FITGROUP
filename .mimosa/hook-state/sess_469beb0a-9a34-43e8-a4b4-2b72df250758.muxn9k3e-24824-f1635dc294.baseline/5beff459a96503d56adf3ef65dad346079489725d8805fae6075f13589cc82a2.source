/**
 * Strength Assessment V3 — pure functions, no React, no UI coupling.
 *
 * Chain: WorkoutLog → resolvePerformanceLoad (load semantics) →
 * estimateOneRepMaxDetailed (formula consensus + rep-range confidence) →
 * plausibility screen → assessExerciseStrength (population benchmark, score,
 * tier, confidence) → aggregateCategoryStrength (primary/secondary evidence).
 *
 * Separations enforced here (spec #5/#21):
 * - score vs confidence are separate fields; missing data lowers confidence,
 *   never the score itself
 * - coverage is informational; it never multiplies a strength score
 */
import { StrengthBodyContext } from '../types';
import {
  EXERCISE_DEFINITIONS,
  ExerciseDefinition,
  LoadMode,
  normalizeExerciseName,
  resolveExerciseDefinition,
} from '../constants/exerciseDefinitions';
import {
  BENCHMARK_PROVENANCE,
  GENERIC_BODY_CONTEXT,
  BW_CLAMP_MIN,
  BW_CLAMP_MAX,
  REF_BW,
  STRENGTH_BENCHMARKS,
  STRENGTH_TIERS,
  StrengthBenchmark,
  StrengthLevelDefinition,
  getStrengthTier,
  getTierForBenchmarkValue,
  getNextMilestoneForValue,
  scaleThresholds,
  scoreFromBenchmarkValue,
} from '../constants/strengthStandards';

export type ConfidenceLabel = 'high' | 'medium' | 'low';
export type StrengthDataSource = 'logged_1rm' | 'logged_e1rm' | 'legacy_profile_pr';

// ---------------------------------------------------------------------------
// Load semantics (spec #8/#9/#15)
// ---------------------------------------------------------------------------

export interface PerformanceLoad {
  loadMode: LoadMode;
  /** Load exactly as recorded (may be negative = assistance). */
  externalLoad: number;
  /** Bodyweight used for bodyweight-inclusive movements. */
  bodyweightKg: number;
  /**
   * Load used for benchmark math. For bodyweight_plus_external movements this
   * is bodyweight + external (assistance subtracts); for dumbbell lifts it is
   * the per-hand weight (benchmarks are per-hand); otherwise the recorded load.
   */
  benchmarkLoad: number;
  /**
   * Tonnage multiplier for volume: bilateral dumbbell lifts move two implements
   * (×2); unilateral lifts count one side (recorded sets are per-side work);
   * everything else ×1.
   */
  tonnageMultiplier: number;
  /** bodyweight + external total, for display of bodyweight movements. */
  effectiveTotalLoad: number;
}

const BW_EXTERNAL_MODES: LoadMode[] = ['bodyweight_plus_external'];

/**
 * Resolve what a recorded Exercise.weight means for one movement.
 * All special-casing lives here — call sites never branch on exercise names.
 */
export function resolvePerformanceLoad(
  definition: ExerciseDefinition | undefined,
  exerciseName: string,
  externalLoad: number,
  bodyweightKg: number = REF_BW
): PerformanceLoad {
  const load = Number.isFinite(externalLoad) ? externalLoad : 0;
  const bodyweight = Number.isFinite(bodyweightKg) && bodyweightKg > 0 ? bodyweightKg : REF_BW;
  const loadMode: LoadMode = definition?.loadMode ?? 'barbell_total';

  if (BW_EXTERNAL_MODES.includes(loadMode)) {
    const total = Math.max(0, bodyweight + load);
    return {
      loadMode,
      externalLoad: load,
      bodyweightKg: bodyweight,
      benchmarkLoad: total,
      tonnageMultiplier: 1,
      effectiveTotalLoad: total,
    };
  }
  if (loadMode === 'dumbbell_per_hand') {
    return {
      loadMode,
      externalLoad: load,
      bodyweightKg: bodyweight,
      benchmarkLoad: Math.max(0, load),
      tonnageMultiplier: 2,
      effectiveTotalLoad: Math.max(0, load),
    };
  }
  if (loadMode === 'bodyweight') {
    return {
      loadMode,
      externalLoad: load,
      bodyweightKg: bodyweight,
      benchmarkLoad: 0,
      tonnageMultiplier: 1,
      effectiveTotalLoad: bodyweight,
    };
  }
  return {
    loadMode,
    externalLoad: load,
    bodyweightKg: bodyweight,
    benchmarkLoad: Math.max(0, load),
    tonnageMultiplier: 1,
    effectiveTotalLoad: Math.max(0, load),
  };
}

// ---------------------------------------------------------------------------
// Estimated 1RM (spec #10/#11)
// ---------------------------------------------------------------------------

export type RepConfidence = 'actual_1rm' | 'high' | 'medium' | 'low' | 'excluded';

export interface OneRepMaxEstimate {
  /** Consensus estimated 1RM (0 when not computable). */
  estimated1RM: number;
  /** Which formula contributed; 'consensus' = median of supported formulas. */
  formula: 'actual' | 'epley' | 'consensus' | 'epley_low_confidence' | 'none';
  /** Relative spread |Epley − Brzycki| / mean, when both formulas apply. */
  estimateSpread?: number;
  repConfidence: RepConfidence;
  /** > 12 reps are training volume only — never strength benchmarks. */
  usableForStrength: boolean;
}

/** Pure Epley, kept for callers that want the raw formula. */
export function epley1RM(load: number, reps: number): number {
  if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(reps) || reps <= 0) return 0;
  if (reps <= 1) return load;
  return load * (1 + reps / 30);
}

/** Brzycki: load × 36 / (37 − reps); undefined beyond 36 reps. */
export function brzycki1RM(load: number, reps: number): number | undefined {
  if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(reps) || reps <= 0) return undefined;
  if (reps <= 1) return load;
  if (reps >= 37) return undefined;
  return (load * 36) / (37 - reps);
}

/** Max reps still accepted as a strength benchmark (anything above = volume only). */
export const MAX_BENCHMARK_REPS = 12;

/**
 * Estimated 1RM with explicit semantics:
 * - 1 rep        → the actual load, no estimation (high confidence)
 * - 2–5 reps     → Epley/Brzycki consensus, high confidence
 * - 6–10 reps    → consensus, medium confidence
 * - 11–12 reps   → Epley only, low confidence (kept, flagged)
 * - > 12 reps    → usableForStrength=false; NEVER silently clamped (spec #10)
 */
export function estimateOneRepMaxDetailed(load: number, reps: number): OneRepMaxEstimate {
  const safeLoad = Number.isFinite(load) ? load : 0;
  const safeReps = Number.isFinite(reps) ? reps : 0;
  if (safeLoad <= 0 || safeReps <= 0) {
    return { estimated1RM: 0, formula: 'none', repConfidence: 'excluded', usableForStrength: false };
  }
  const round = (v: number) => Number(v.toFixed(1));

  if (safeReps <= 1) {
    return { estimated1RM: round(safeLoad), formula: 'actual', repConfidence: 'actual_1rm', usableForStrength: true };
  }
  if (safeReps <= 10) {
    const epley = epley1RM(safeLoad, safeReps);
    const brzycki = brzycki1RM(safeLoad, safeReps);
    if (brzycki && brzycki > 0) {
      const mean = (epley + brzycki) / 2;
      const spread = Math.abs(epley - brzycki) / mean;
      return {
        estimated1RM: round(mean),
        formula: 'consensus',
        estimateSpread: Number(spread.toFixed(4)),
        repConfidence: safeReps <= 5 ? 'high' : 'medium',
        usableForStrength: true,
      };
    }
    return { estimated1RM: round(epley), formula: 'epley', repConfidence: 'medium', usableForStrength: true };
  }
  if (safeReps <= MAX_BENCHMARK_REPS) {
    return {
      estimated1RM: round(epley1RM(safeLoad, safeReps)),
      formula: 'epley_low_confidence',
      repConfidence: 'low',
      usableForStrength: true,
    };
  }
  // High-rep sets are endurance work: excluded from strength scoring, kept for volume.
  return { estimated1RM: 0, formula: 'none', repConfidence: 'excluded', usableForStrength: false };
}

// ---------------------------------------------------------------------------
// Plausibility screen (spec #12)
// ---------------------------------------------------------------------------

export interface PlausibilityVerdict {
  plausible: boolean;
  /** Implausible jump vs the lifter's own reliable history (kept, flagged). */
  suspectedOutlier: boolean;
  /** Fails absolute bounds — excluded from scoring entirely (log preserved). */
  excludeFromScoring: boolean;
  reason?: string;
}

/** Relative jump above the lifter's second-best reliable e1RM that gets flagged. */
const PERSONAL_JUMP_RATIO = 1.3;
/** Minimum absolute gap (kg) for a jump to be considered anomalous. */
const PERSONAL_JUMP_MIN_GAP_KG = 20;

/**
 * Screen a candidate e1RM against absolute bounds and the lifter's own history.
 * Absolute-implausible values are excluded from scoring (but the log entry is
 * retained); personal jumps are only flagged so review/confirmation is possible.
 */
export function checkPlausibility(
  definition: ExerciseDefinition | undefined,
  benchmarkLoad: number,
  estimated1RM: number,
  priorReliableBests: number[] = []
): PlausibilityVerdict {
  if (estimated1RM <= 0) {
    return { plausible: false, suspectedOutlier: false, excludeFromScoring: true, reason: 'non-positive estimated 1RM' };
  }
  if (estimated1RM > 5000) {
    return { plausible: false, suspectedOutlier: false, excludeFromScoring: true, reason: 'estimated 1RM exceeds supported range' };
  }
  const bound = definition?.maxPlausibleLoad;
  if (bound !== undefined && estimated1RM > bound) {
    return { plausible: false, suspectedOutlier: true, excludeFromScoring: true, reason: `estimated 1RM ${estimated1RM}kg exceeds absolute plausibility bound ${bound}kg` };
  }
  if (benchmarkLoad > 0 && priorReliableBests.length > 0) {
    const best = Math.max(...priorReliableBests);
    if (estimated1RM >= best + PERSONAL_JUMP_MIN_GAP_KG && estimated1RM > best * PERSONAL_JUMP_RATIO) {
      return { plausible: true, suspectedOutlier: true, excludeFromScoring: false, reason: `e1RM jumped ${Math.round((estimated1RM / best - 1) * 100)}% over prior reliable best ${best}kg` };
    }
  }
  return { plausible: true, suspectedOutlier: false, excludeFromScoring: false };
}

// ---------------------------------------------------------------------------
// Body context resolution (spec #31)
// ---------------------------------------------------------------------------

export type AssessmentMode = 'personalized' | 'partial' | 'generic';

export interface ResolvedBodyContext {
  ctx: StrengthBodyContext;
  /** personalized = sex+bw known; partial = one of them assumed; generic = both unknown. */
  assessmentMode: AssessmentMode;
  sexAssumed: boolean;
  bodyweightAssumed: boolean;
}

/**
 * Extract the body context used by strength benchmarks. Missing profile data is
 * NEVER silently treated as a precise personal assessment: the returned mode
 * tells the UI to disclose the generic reference standard.
 */
export function resolveBodyContext(profile?: {
  sex?: string | null;
  bodyweightKg?: number | null;
} | null): ResolvedBodyContext {
  const sex = profile?.sex === 'female' ? 'female' : profile?.sex === 'male' ? 'male' : null;
  const rawBw = typeof profile?.bodyweightKg === 'number' && profile.bodyweightKg > 0 ? profile.bodyweightKg : null;
  const sexAssumed = !sex;
  const bodyweightAssumed = !rawBw;
  const ctx: StrengthBodyContext = {
    sex: sex || 'male',
    bodyweightKg: rawBw ? Math.min(BW_CLAMP_MAX, Math.max(BW_CLAMP_MIN, rawBw)) : REF_BW,
  };
  const assessmentMode: AssessmentMode = !sexAssumed && !bodyweightAssumed
    ? 'personalized'
    : sexAssumed && bodyweightAssumed
      ? 'generic'
      : 'partial';
  return { ctx, assessmentMode, sexAssumed, bodyweightAssumed };
}

/** Backward-compatible shape: null only when the profile is entirely empty. */
export function bodyContextFromProfile(p?: {
  sex?: string | null;
  bodyweightKg?: number | null;
} | null): StrengthBodyContext | null {
  if (!p) return null;
  const hasSex = p.sex === 'female' || p.sex === 'male';
  const rawBw = typeof p.bodyweightKg === 'number' && p.bodyweightKg > 0;
  if (!hasSex && !rawBw) return null;
  return resolveBodyContext(p).ctx;
}

// ---------------------------------------------------------------------------
// Per-exercise strength assessment
// ---------------------------------------------------------------------------

export interface ExerciseStrengthAssessment {
  exerciseId: string;
  exerciseName: string;
  benchmark: StrengthBenchmark;
  provenance: BENCHMARK_PROVENANCE_SOURCE;
  /** Benchmark unit (kg / reps / sec). */
  unit: string;
  /** The performance value scored against the benchmark (e1RM / reps / seconds). */
  benchmarkValue: number;
  /** 0-100 relative strength index (percentile-anchored interpolation). */
  score: number;
  tier: StrengthLevelDefinition;
  scaledThresholds: [number, number, number, number, number];
  nextMilestone?: { targetValue: number; deltaValue: number; nextTier: StrengthLevelDefinition };
  /** confidenceScore 0-100 drives the label; score is NEVER adjusted by it. */
  confidenceScore: number;
  confidence: ConfidenceLabel;
  source: StrengthDataSource;
  repRange?: number;
  formula?: OneRepMaxEstimate['formula'];
  estimateSpread?: number;
  suspectedOutlier: boolean;
}

type BENCHMARK_PROVENANCE_SOURCE = typeof BENCHMARK_PROVENANCE;

const RELIABILITY_CONFIDENCE_FACTOR: Record<string, number> = { A: 1.0, B: 0.85, C: 0.6, D: 0.2 };
const REP_CONFIDENCE_BASE: Record<RepConfidence, number> = {
  actual_1rm: 95,
  high: 90,
  medium: 70,
  low: 45,
  excluded: 0,
};
/** Machine/cable stack labels cap absolute-strength confidence (device variance). */
const MACHINE_MODE_CONFIDENCE_CAP = 60;
/** Legacy profile PRs (no reps/timestamp) cap confidence lower than log data. */
const LEGACY_SOURCE_CONFIDENCE_CAP = 45;
/** Spread penalty when formulas disagree noticeably. */
const SPREAD_PENALTY_THRESHOLD = 0.06;

function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Assess one performance against its population benchmark.
 * `performance` is expressed in the benchmark's unit (kg / reps / sec).
 * Returns null when the exercise has no benchmark or the value is unusable.
 */
export function assessExerciseStrength(
  definition: ExerciseDefinition,
  performance: {
    benchmarkValue: number;
    repRange?: number;
    repConfidence?: RepConfidence;
    estimateSpread?: number;
    formula?: OneRepMaxEstimate['formula'];
    source: StrengthDataSource;
  },
  bodyContext: ResolvedBodyContext
): ExerciseStrengthAssessment | null {
  const benchmark = STRENGTH_BENCHMARKS[definition.id];
  if (!benchmark) return null;
  const value = Number(performance.benchmarkValue);
  if (!Number.isFinite(value) || value <= 0) return null;

  const scaled = scaleThresholds(benchmark, bodyContext.ctx);
  const score = Math.min(100, Math.round(scoreFromBenchmarkValue(value, scaled)));

  // Confidence: rep quality × benchmark reliability × body-context completeness
  // − formula spread penalty, then mode/source caps. Score stays untouched.
  const repConfidence = performance.repConfidence ?? (benchmark.unit === 'kg' ? 'medium' : 'high');
  let confidenceScore = REP_CONFIDENCE_BASE[repConfidence] * RELIABILITY_CONFIDENCE_FACTOR[definition.benchmarkReliability];
  if (performance.estimateSpread && performance.estimateSpread > SPREAD_PENALTY_THRESHOLD) {
    confidenceScore *= 0.8;
  }
  if (bodyContext.sexAssumed) confidenceScore *= 0.85;
  if (bodyContext.bodyweightAssumed) confidenceScore *= 0.85;
  if (benchmark.mode === 'machine_relative' && confidenceScore > MACHINE_MODE_CONFIDENCE_CAP) {
    confidenceScore = MACHINE_MODE_CONFIDENCE_CAP;
  }
  if (performance.source === 'legacy_profile_pr' && confidenceScore > LEGACY_SOURCE_CONFIDENCE_CAP) {
    confidenceScore = LEGACY_SOURCE_CONFIDENCE_CAP;
  }

  return {
    exerciseId: definition.id,
    exerciseName: definition.name,
    benchmark,
    provenance: BENCHMARK_PROVENANCE,
    unit: benchmark.unit,
    benchmarkValue: value,
    score,
    tier: getTierForBenchmarkValue(value, scaled),
    scaledThresholds: scaled,
    nextMilestone: getNextMilestoneForValue(value, scaled),
    confidenceScore: Math.round(clampPercent(confidenceScore)),
    confidence: confidenceLabel(clampPercent(confidenceScore)),
    source: performance.source,
    repRange: performance.repRange,
    formula: performance.formula,
    estimateSpread: performance.estimateSpread,
    suspectedOutlier: false,
  };
}
// ---------------------------------------------------------------------------
// Category aggregation (spec #6/#23/#24)
// ---------------------------------------------------------------------------

export interface StrengthEvidenceItem {
  exerciseId: string;
  exerciseName: string;
  assessment: ExerciseStrengthAssessment;
  /** Evidence weight from benchmark reliability (A=1 … C=0.4; D excluded). */
  evidenceWeight: number;
  isPrimary: boolean;
}

export interface CategoryStrengthAssessment {
  /** 0-100 weighted by evidence reliability — never by coverage penalty. */
  score: number;
  tier: StrengthLevelDefinition;
  confidence: ConfidenceLabel;
  confidenceScore: number;
  assessmentMode: AssessmentMode;
  /** Benchmark-grade movements backing this score (top reliability first). */
  primaryEvidence: StrengthEvidenceItem[];
  /** Supporting movements with lower statistical weight. */
  secondaryEvidence: StrengthEvidenceItem[];
  /** Fraction of evidence weight contributed by primary benchmarks. */
  coverage: number;
  /** True when only machine/cable evidence exists. */
  machineOnly: boolean;
}

const EVIDENCE_WEIGHT_BY_RELIABILITY: Record<string, number> = { A: 1.0, B: 0.7, C: 0.4, D: 0.15 };

/**
 * Aggregate per-exercise assessments into one category strength assessment.
 *
 * Design (replaces "top3 × coverage"):
 * - every benchmarked exercise contributes with a RELIABILITY weight
 *   (barbell big lifts outweigh machines/cables),
 * - the weighted mean is the score — adding a weaker movement can still shift
 *   the mean, but data scarcity lowers CONFIDENCE, never the score,
 * - compound cross-category credit is removed: a benchmark only counts toward
 *   its primary strength category (spec #24),
 * - D-reliability movements are excluded from population strength entirely.
 */
export function aggregateCategoryStrength(
  candidates: ExerciseStrengthAssessment[],
  bodyContext: ResolvedBodyContext
): CategoryStrengthAssessment | null {
  const weighted = candidates
    .map((c) => ({ c, weight: EVIDENCE_WEIGHT_BY_RELIABILITY[reliabilityOf(c.exerciseId)] }))
    .filter(({ weight }) => weight >= 0.4); // A/B/C only; D never reaches category scores
  if (weighted.length === 0) return null;

  const totalWeight = weighted.reduce((sum, { weight }) => sum + weight, 0);
  const score = Math.min(100, Math.round(
    weighted.reduce((sum, { c, weight }) => sum + c.score * weight, 0) / totalWeight
  ));

  const primaryWeight = weighted
    .filter(({ c }) => reliabilityOf(c.exerciseId) === 'A')
    .reduce((sum, { weight }) => sum + weight, 0);

  // Confidence: best candidate confidence + a bounded bonus for additional
  // independent A/B evidence. More (valid) data never lowers confidence.
  const sortedByConfidence = [...weighted].sort((a, b) => b.c.confidenceScore - a.c.confidenceScore);
  let confidenceScore = sortedByConfidence[0].c.confidenceScore;
  const extraAB = sortedByConfidence.slice(1).filter(({ c }) => ['A', 'B'].includes(reliabilityOf(c.exerciseId))).length;
  confidenceScore = Math.min(100, confidenceScore + Math.min(15, extraAB * 5));
  const machineOnly = weighted.every(({ c }) => STRENGTH_BENCHMARKS[c.exerciseId]?.mode === 'machine_relative');
  if (machineOnly && confidenceScore > MACHINE_MODE_CONFIDENCE_CAP) {
    confidenceScore = MACHINE_MODE_CONFIDENCE_CAP;
  }
  if (bodyContext.assessmentMode === 'generic') confidenceScore *= 0.72;
  else if (bodyContext.assessmentMode === 'partial') confidenceScore *= 0.85;

  const toEvidence = ({ c, weight }: { c: ExerciseStrengthAssessment; weight: number }): StrengthEvidenceItem => ({
    exerciseId: c.exerciseId,
    exerciseName: c.exerciseName,
    assessment: c,
    evidenceWeight: weight,
    isPrimary: reliabilityOf(c.exerciseId) === 'A',
  });

  return {
    score,
    tier: getStrengthTier(score),
    confidence: confidenceLabel(clampPercent(confidenceScore)),
    confidenceScore: Math.round(clampPercent(confidenceScore)),
    assessmentMode: bodyContext.assessmentMode,
    primaryEvidence: weighted.filter(({ c }) => reliabilityOf(c.exerciseId) === 'A').sort((a, b) => b.c.score - a.c.score).map(toEvidence),
    secondaryEvidence: weighted.filter(({ c }) => reliabilityOf(c.exerciseId) !== 'A').sort((a, b) => b.c.score - a.c.score).map(toEvidence),
    coverage: totalWeight > 0 ? Number((primaryWeight / totalWeight).toFixed(3)) : 0,
    machineOnly,
  };
}

function reliabilityOf(exerciseId: string): string {
  return EXERCISE_DEFINITIONS.find((d) => d.id === exerciseId)?.benchmarkReliability ?? 'C';
}

export { GENERIC_BODY_CONTEXT, REF_BW, normalizeExerciseName, resolveExerciseDefinition };
