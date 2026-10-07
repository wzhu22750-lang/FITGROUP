/**
 * Muscle taxonomy leaf module — sub-muscle enum, category grouping, per-muscle
 * targets, and the training-capacity scoring curves.
 *
 * This file intentionally has NO imports from other app modules: it sits below
 * exerciseDefinitions.ts (which needs the enum) and muscleCoefficients.ts
 * (which re-exports it) to keep the dependency graph acyclic.
 */
import { WorkoutCategory } from '../types';

export enum SubMuscleGroup {
  // 肩部
  FrontDelt = 'FrontDelt',       // 前束
  MiddleDelt = 'MiddleDelt',     // 中束
  RearDelt = 'RearDelt',         // 后束
  // 胸部
  UpperChest = 'UpperChest',     // 上胸
  MiddleChest = 'MiddleChest',   // 中胸
  LowerChest = 'LowerChest',     // 下胸
  // 背部
  Lats = 'Lats',                 // 背阔肌
  UpperBack = 'UpperBack',       // 上背部(菱形肌/中下斜方肌)
  UpperTraps = 'UpperTraps',     // 上斜方肌
  ErectorSpinae = 'ErectorSpinae', // 竖脊肌/下背
  // 腿部
  Quads = 'Quads',               // 股四头
  Hamstrings = 'Hamstrings',     // 腘绳肌
  Glutes = 'Glutes',             // 臀部
  Calves = 'Calves',             // 小腿
  // 其他
  Biceps = 'Biceps',             // 二头
  Triceps = 'Triceps',           // 三头
  Abs = 'Abs',                   // 腹部
  Forearms = 'Forearms',         // 前臂
}

export const CATEGORY_SUB_MUSCLES: Record<WorkoutCategory, SubMuscleGroup[]> = {
  [WorkoutCategory.Shoulders]: [SubMuscleGroup.FrontDelt, SubMuscleGroup.MiddleDelt, SubMuscleGroup.RearDelt],
  [WorkoutCategory.Chest]: [SubMuscleGroup.UpperChest, SubMuscleGroup.MiddleChest, SubMuscleGroup.LowerChest],
  [WorkoutCategory.Back]: [SubMuscleGroup.Lats, SubMuscleGroup.UpperBack, SubMuscleGroup.UpperTraps, SubMuscleGroup.ErectorSpinae],
  [WorkoutCategory.Legs]: [SubMuscleGroup.Quads, SubMuscleGroup.Hamstrings, SubMuscleGroup.Glutes, SubMuscleGroup.Calves],
  [WorkoutCategory.Others]: [SubMuscleGroup.Biceps, SubMuscleGroup.Triceps, SubMuscleGroup.Abs, SubMuscleGroup.Forearms],
  [WorkoutCategory.Cardio]: [], // Cardio has no sub-muscle groups
};

const SUB_MUSCLE_TO_CATEGORY = new Map<SubMuscleGroup, WorkoutCategory>();
(Object.entries(CATEGORY_SUB_MUSCLES) as Array<[WorkoutCategory, SubMuscleGroup[]]>).forEach(([cat, list]) => {
  list.forEach((sm) => SUB_MUSCLE_TO_CATEGORY.set(sm, cat));
});

export function categoryOfSubMuscle(sm: SubMuscleGroup): WorkoutCategory | undefined {
  return SUB_MUSCLE_TO_CATEGORY.get(sm);
}

/** Relative weight of each sub-muscle inside its parent category composite. */
export const SUB_MUSCLE_WEIGHTS: Record<WorkoutCategory, Record<string, number>> = {
  [WorkoutCategory.Shoulders]: { [SubMuscleGroup.FrontDelt]: 0.30, [SubMuscleGroup.MiddleDelt]: 0.40, [SubMuscleGroup.RearDelt]: 0.30 },
  [WorkoutCategory.Chest]: { [SubMuscleGroup.UpperChest]: 0.30, [SubMuscleGroup.MiddleChest]: 0.40, [SubMuscleGroup.LowerChest]: 0.30 },
  [WorkoutCategory.Back]: { [SubMuscleGroup.Lats]: 0.35, [SubMuscleGroup.UpperBack]: 0.35, [SubMuscleGroup.UpperTraps]: 0.10, [SubMuscleGroup.ErectorSpinae]: 0.20 },
  [WorkoutCategory.Legs]: { [SubMuscleGroup.Quads]: 0.35, [SubMuscleGroup.Hamstrings]: 0.25, [SubMuscleGroup.Glutes]: 0.25, [SubMuscleGroup.Calves]: 0.15 },
  [WorkoutCategory.Others]: { [SubMuscleGroup.Biceps]: 0.30, [SubMuscleGroup.Triceps]: 0.30, [SubMuscleGroup.Abs]: 0.30, [SubMuscleGroup.Forearms]: 0.10 },
  [WorkoutCategory.Cardio]: {},
};

// ---------------------------------------------------------------------------
// Per-muscle weekly effective-set targets (spec #18)
// ---------------------------------------------------------------------------

export interface SubMuscleTrainingTarget {
  /** Weekly effective sets where the piecewise volume score reaches 50. */
  minEffectiveSets: number;
  /** Weekly effective sets considered a solid target (score 85). */
  targetEffectiveSets: number;
  /** Weekly effective sets beyond which extra volume stops adding score. */
  upperUsefulSets: number;
}

/**
 * Evidence-informed weekly set targets per sub-muscle. No muscle uses a single
 * universal "12 sets" target anymore.
 */
export const SUB_MUSCLE_TRAINING_TARGETS: Record<SubMuscleGroup, SubMuscleTrainingTarget> = {
  [SubMuscleGroup.FrontDelt]: { minEffectiveSets: 3, targetEffectiveSets: 8, upperUsefulSets: 14 },
  [SubMuscleGroup.MiddleDelt]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 18 },
  [SubMuscleGroup.RearDelt]: { minEffectiveSets: 3, targetEffectiveSets: 8, upperUsefulSets: 14 },
  [SubMuscleGroup.UpperChest]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 16 },
  [SubMuscleGroup.MiddleChest]: { minEffectiveSets: 6, targetEffectiveSets: 12, upperUsefulSets: 20 },
  [SubMuscleGroup.LowerChest]: { minEffectiveSets: 3, targetEffectiveSets: 8, upperUsefulSets: 12 },
  [SubMuscleGroup.Lats]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 18 },
  [SubMuscleGroup.UpperBack]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 18 },
  [SubMuscleGroup.UpperTraps]: { minEffectiveSets: 4, targetEffectiveSets: 8, upperUsefulSets: 14 },
  [SubMuscleGroup.ErectorSpinae]: { minEffectiveSets: 3, targetEffectiveSets: 8, upperUsefulSets: 14 },
  [SubMuscleGroup.Quads]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 18 },
  [SubMuscleGroup.Hamstrings]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 16 },
  [SubMuscleGroup.Glutes]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 16 },
  [SubMuscleGroup.Calves]: { minEffectiveSets: 6, targetEffectiveSets: 12, upperUsefulSets: 20 },
  [SubMuscleGroup.Biceps]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 18 },
  [SubMuscleGroup.Triceps]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 18 },
  [SubMuscleGroup.Abs]: { minEffectiveSets: 4, targetEffectiveSets: 10, upperUsefulSets: 18 },
  [SubMuscleGroup.Forearms]: { minEffectiveSets: 3, targetEffectiveSets: 8, upperUsefulSets: 14 },
};

// ---------------------------------------------------------------------------
// Training Capacity V3 dimension weights & curves (spec #16-#20)
// ---------------------------------------------------------------------------

/**
 * Weights for the four training-state dimensions. Deliberately balanced so no
 * single dimension can drag the composite above 30 points by itself.
 */
export const TRAINING_SCORE_WEIGHTS = {
  frequency: 0.25,    // 频率分
  volume: 0.30,       // 有效容量分
  progression: 0.25,  // 进步分（e1RM 对比上一周期）
  consistency: 0.20,  // 稳定性（周间分布）
} as const;

/** Frequency curve: weekly trained-days → score. Continuous, no 0→25 jump. */
export const FREQUENCY_BREAKPOINTS: Array<[number, number]> = [
  [0, 0], [0.5, 20], [1, 45], [1.5, 65], [2, 80], [3, 100],
];

/** Progression curve: e1RM ratio (current period / baseline period) → score. */
export const PROGRESSION_BREAKPOINTS: Array<[number, number]> = [
  [0, 0], [0.8, 10], [0.9, 30], [1.0, 55], [1.05, 80], [1.1, 92], [1.2, 100],
];

/** Neutral progression when no baseline exists — NOT "excellent". */
export const PROGRESSION_NEUTRAL_SCORE = 50;

/** Sub-muscle composite weights are inherited from TRAINING_SCORE_WEIGHTS. */
export const SCORE_WEIGHTS = TRAINING_SCORE_WEIGHTS;

/** Generic piecewise interpolation used by all scoring curves. */
export function interpolateScore(value: number, breakpoints: Array<[number, number]>): number {
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

/** Piecewise volume scoring against per-muscle targets. */
export function volumeScoreForSets(
  weeklyEffectiveSets: number,
  target: SubMuscleTrainingTarget
): number {
  const sets = Math.max(0, Number.isFinite(weeklyEffectiveSets) ? weeklyEffectiveSets : 0);
  if (sets <= 0) return 0;
  if (sets >= target.upperUsefulSets) return 100;
  if (sets >= target.targetEffectiveSets) {
    return 85 + ((sets - target.targetEffectiveSets) / (target.upperUsefulSets - target.targetEffectiveSets)) * 15;
  }
  if (sets >= target.minEffectiveSets) {
    return 50 + ((sets - target.minEffectiveSets) / (target.targetEffectiveSets - target.minEffectiveSets)) * 35;
  }
  // 0 → min: linear ramp up to 50, no jump at any point.
  return (sets / target.minEffectiveSets) * 50;
}

// ---------------------------------------------------------------------------
// Scoring period & cardio constants
// ---------------------------------------------------------------------------

/** 统计周期天数 */
export const SCORING_PERIOD_DAYS = 28;

export const CARDIO_CALORIE_TARGETS = {
  low: 1000,
  normal: 2000,
  high: 3000,
} as const;

/** 默认有氧卡路里目标（28天） */
export const DEFAULT_CARDIO_CALORIE_TARGET = CARDIO_CALORIE_TARGETS.normal;

export const SUB_MUSCLE_META: Record<SubMuscleGroup, { zh: string; en: string }> = {
  [SubMuscleGroup.FrontDelt]: { zh: '前束', en: 'Front Delt' },
  [SubMuscleGroup.MiddleDelt]: { zh: '中束', en: 'Middle Delt' },
  [SubMuscleGroup.RearDelt]: { zh: '后束', en: 'Rear Delt' },
  [SubMuscleGroup.UpperChest]: { zh: '上胸', en: 'Upper Chest' },
  [SubMuscleGroup.MiddleChest]: { zh: '中胸', en: 'Middle Chest' },
  [SubMuscleGroup.LowerChest]: { zh: '下胸', en: 'Lower Chest' },
  [SubMuscleGroup.Lats]: { zh: '背阔肌', en: 'Lats' },
  [SubMuscleGroup.UpperBack]: { zh: '上背', en: 'Upper Back' },
  [SubMuscleGroup.UpperTraps]: { zh: '上斜方肌', en: 'Upper Traps' },
  [SubMuscleGroup.ErectorSpinae]: { zh: '竖脊肌', en: 'Erector Spinae' },
  [SubMuscleGroup.Quads]: { zh: '股四头', en: 'Quads' },
  [SubMuscleGroup.Hamstrings]: { zh: '腘绳肌', en: 'Hamstrings' },
  [SubMuscleGroup.Glutes]: { zh: '臀部', en: 'Glutes' },
  [SubMuscleGroup.Calves]: { zh: '小腿', en: 'Calves' },
  [SubMuscleGroup.Biceps]: { zh: '二头', en: 'Biceps' },
  [SubMuscleGroup.Triceps]: { zh: '三头', en: 'Triceps' },
  [SubMuscleGroup.Abs]: { zh: '腹部', en: 'Abs' },
  [SubMuscleGroup.Forearms]: { zh: '前臂', en: 'Forearms' },
};
