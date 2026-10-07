/**
 * Unified Exercise Definition Registry (V3)
 *
 * Single source of truth for exercise identity, load semantics, muscle stimulus,
 * and benchmark linkage. Every strength-capable exercise is declared exactly once
 * and referenced by canonical `id` everywhere (PR aggregation, progression,
 * category strength, standards display).
 *
 * Design constraints (see docs/algorithm-audit):
 * - identity / movement / load / benchmark are separated but linked by `id`
 * - `stimulusCoefficients` are EFFECTIVE-SET equivalents, NOT a normalized cake:
 *   a compound lift can stimulate several muscles simultaneously (sum > 1)
 * - machine/cable benchmarks use `machine_relative` mode and lower reliability,
 *   because stack labels are not comparable across gyms
 */
import { WorkoutCategory } from '../types';
// Import from the leaf taxonomy module (NOT muscleCoefficients) to keep the
// dependency graph acyclic: muscleCoefficients re-exports the taxonomy and
// itself depends on this file's definitions.
import { SubMuscleGroup } from './muscleTaxonomy';

/** Canonical movement families used for benchmark scaling and display grouping. */
export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'carry'
  | 'isolation'
  | 'core'
  | 'locomotion';

/**
 * Declares what a recorded `Exercise.weight` number MEANS for this movement.
 * Volume (tonnage) and benchmark resolution both derive from this — never guess
 * from the exercise name at call sites.
 */
export type LoadMode =
  | 'barbell_total'           // logged weight = total external load on the bar
  | 'dumbbell_per_hand'       // logged weight = one dumbbell; bilateral lifts move 2x
  | 'unilateral'              // logged weight = one side; recorded sets are per-side work
  | 'bodyweight'              // no external load; performance is reps/seconds against bodyweight
  | 'bodyweight_plus_external' // logged weight = added (+) or assisted (-) load on top of bodyweight
  | 'machine_stack'           // logged weight = machine stack label (device dependent)
  | 'cable_stack';            // logged weight = cable stack label (pulley ratio dependent)

/**
 * How the population benchmark for this exercise is expressed.
 * - population_1rm: kg 1RM anchors from community percentile data
 * - bodyweight_reps: repetition/time anchors, bodyweight-relative
 * - machine_relative: stack-label anchors, only comparable to the same anchors
 *   (device variance), used mainly for personal progression
 * - personal_progress: no population meaning; individual trend only
 */
export type BenchmarkMode =
  | 'population_1rm'
  | 'bodyweight_reps'
  | 'machine_relative'
  | 'personal_progress';

/**
 * Statistical reliability of the benchmark for judging absolute strength.
 * A: highly standardized barbell lifts (bench/squat/deadlift/OHP/pull-up)
 * B: reliable free-weight support lifts
 * C: machine/cable dependent (stack variance) — population meaning is weak
 * D: device-dependent to the point of being personal-progress only
 */
export type BenchmarkReliability = 'A' | 'B' | 'C' | 'D';

export interface ExerciseDefinition {
  /** Canonical slug, e.g. 'barbell_bench_press'. All analytics key on this. */
  id: string;
  /** Primary display name (Chinese). */
  name: string;
  /** Exact-match alternative names (normalized before comparison). */
  aliases: string[];
  /**
   * Alias fragments eligible for controlled substring matching. Only fragments
   * long enough to be unambiguous may be listed here (zh >= 2 chars, latin >= 4).
   */
  fuzzyAliases?: string[];
  movementPattern: MovementPattern;
  /** Strength category that OWNS this exercise's benchmark (benchmark credit). */
  primaryCategory: WorkoutCategory;
  loadMode: LoadMode;
  benchmarkReliability: BenchmarkReliability;
  /** Effective-set stimulus per muscle; may sum to > 1 for compounds. */
  stimulusCoefficients: Partial<Record<SubMuscleGroup, number>>;
  /** Whether a population strength benchmark exists for this exercise. */
  hasStrengthBenchmark: boolean;
  /** Absolute implausible-load guard for mis-typed entries (kg, benchmark unit). */
  maxPlausibleLoad?: number;
}

const def = (d: ExerciseDefinition): ExerciseDefinition => d;

export const EXERCISE_DEFINITIONS: ExerciseDefinition[] = [
  // ==================== 胸部 Chest ====================
  def({
    id: 'barbell_bench_press',
    name: '杠铃平板卧推',
    aliases: ['卧推', '平板卧推', '杠铃卧推', '平板杠铃卧推', '杠铃推胸', '杠铃卧推', 'bench press', 'flat bench', 'barbell bench press'],
    fuzzyAliases: ['卧推'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleChest]: 1.0,
      [SubMuscleGroup.UpperChest]: 0.4,
      [SubMuscleGroup.LowerChest]: 0.2,
      [SubMuscleGroup.Triceps]: 0.4,
      [SubMuscleGroup.FrontDelt]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 400,
  }),
  def({
    id: 'dumbbell_bench_press',
    name: '哑铃平板卧推',
    aliases: ['哑铃卧推', '哑铃推胸', '平板哑铃推胸', '哑铃平推', 'dumbbell bench press', 'dumbbell press', 'db bench'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleChest]: 1.0,
      [SubMuscleGroup.UpperChest]: 0.4,
      [SubMuscleGroup.Triceps]: 0.4,
      [SubMuscleGroup.FrontDelt]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 175,
  }),
  def({
    id: 'dumbbell_incline_bench_press',
    name: '哑铃上斜卧推',
    aliases: ['上斜哑铃卧推', '上斜卧推', '上斜哑铃推胸', '哑铃上斜推胸', '上斜推胸', 'incline dumbbell press', 'incline db bench'],
    fuzzyAliases: ['上斜推胸'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperChest]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.4,
      [SubMuscleGroup.FrontDelt]: 0.4,
      [SubMuscleGroup.Triceps]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'barbell_incline_bench_press',
    name: '杠铃上斜卧推',
    aliases: ['上斜杠铃卧推', '杠铃上斜推', 'incline bench', 'incline bench press', 'barbell incline press'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperChest]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.4,
      [SubMuscleGroup.FrontDelt]: 0.4,
      [SubMuscleGroup.Triceps]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 320,
  }),
  def({
    id: 'smith_incline_bench_press',
    name: '史密斯上斜推胸',
    aliases: ['史密斯卧推', '史密斯推胸', 'smith bench press', 'smith machine bench'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperChest]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.3,
      [SubMuscleGroup.FrontDelt]: 0.3,
      [SubMuscleGroup.Triceps]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 320,
  }),
  def({
    id: 'machine_chest_press',
    name: '器械推胸',
    aliases: ['坐姿推胸', '坐姿器械推胸', '推胸机', '器械卧推', '坐姿推胸机', 'machine chest press'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleChest]: 1.0,
      [SubMuscleGroup.UpperChest]: 0.3,
      [SubMuscleGroup.Triceps]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 320,
  }),
  def({
    id: 'pec_deck',
    name: '蝴蝶机夹胸',
    aliases: ['坐姿夹胸', '器械夹胸', 'pec deck', 'chest fly', '夹胸'],
    fuzzyAliases: ['夹胸'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleChest]: 1.0,
      [SubMuscleGroup.UpperChest]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 200,
  }),
  def({
    id: 'cable_fly',
    name: '绳索夹胸',
    aliases: ['龙门架夹胸', 'cable fly', 'cable crossover'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'cable_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleChest]: 1.0,
      [SubMuscleGroup.UpperChest]: 0.3,
      [SubMuscleGroup.LowerChest]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'incline_dumbbell_fly',
    name: '上斜飞鸟',
    aliases: ['上斜哑铃飞鸟', 'incline fly'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperChest]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 120,
  }),
  def({
    id: 'decline_bench_press',
    name: '下斜卧推',
    aliases: ['下斜杠铃卧推', 'decline bench press'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'barbell_total',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.LowerChest]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.4,
      [SubMuscleGroup.Triceps]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 360,
  }),
  def({
    id: 'cable_lower_fly',
    name: '绳索下压夹胸',
    aliases: ['低位绳索夹胸', 'cable lower fly'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'cable_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.LowerChest]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'dips',
    name: '双杠臂屈伸',
    aliases: ['双杠', '臂屈伸', 'dips', 'parallel bar dips'],
    fuzzyAliases: ['双杠'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'bodyweight_plus_external',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.LowerChest]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.5,
      [SubMuscleGroup.Triceps]: 0.6,
      [SubMuscleGroup.FrontDelt]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 350,
  }),
  def({
    id: 'push_up',
    name: '俯卧撑',
    aliases: ['标准俯卧撑', '俯卧撑', 'push up', 'pushup', 'pushups'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Chest,
    loadMode: 'bodyweight',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleChest]: 1.0,
      [SubMuscleGroup.UpperChest]: 0.3,
      [SubMuscleGroup.Triceps]: 0.4,
      [SubMuscleGroup.FrontDelt]: 0.3,
      [SubMuscleGroup.Abs]: 0.2,
    },
    hasStrengthBenchmark: true,
  }),

  // ==================== 背部 Back ====================
  def({
    id: 'lat_pulldown',
    name: '高位下拉',
    aliases: ['下拉', '宽握下拉', '高位下拉', 'lat pulldown'],
    fuzzyAliases: ['下拉'],
    movementPattern: 'vertical_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'cable_stack',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.Lats]: 1.0,
      [SubMuscleGroup.UpperBack]: 0.4,
      [SubMuscleGroup.Biceps]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 300,
  }),
  def({
    id: 'barbell_row',
    name: '杠铃划船',
    aliases: ['俯身杠铃划船', '俯身划船', '杠铃划船', 'barbell row', 'bent over row'],
    fuzzyAliases: ['划船'],
    movementPattern: 'horizontal_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperBack]: 1.0,
      [SubMuscleGroup.Lats]: 0.6,
      [SubMuscleGroup.ErectorSpinae]: 0.4,
      [SubMuscleGroup.Biceps]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 320,
  }),
  def({
    id: 'seated_cable_row',
    name: '坐姿绳索划船',
    aliases: ['坐姿划船', '绳索划船', 'seated cable row', 'seated row'],
    movementPattern: 'horizontal_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'cable_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperBack]: 1.0,
      [SubMuscleGroup.Lats]: 0.7,
      [SubMuscleGroup.Biceps]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 320,
  }),
  def({
    id: 'one_arm_dumbbell_row',
    name: '哑铃单臂划船',
    aliases: ['单臂哑铃划船', '哑铃划船', 'dumbbell row', 'one arm dumbbell row'],
    movementPattern: 'horizontal_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'unilateral',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.Lats]: 1.0,
      [SubMuscleGroup.UpperBack]: 0.5,
      [SubMuscleGroup.Biceps]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 175,
  }),
  def({
    id: 't_bar_row',
    name: 'T杠划船',
    aliases: ['t杠划船', 't-bar row', 'landmine row'],
    movementPattern: 'horizontal_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'barbell_total',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperBack]: 1.0,
      [SubMuscleGroup.Lats]: 0.6,
      [SubMuscleGroup.ErectorSpinae]: 0.3,
      [SubMuscleGroup.Biceps]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 250,
  }),
  def({
    id: 'chest_supported_row',
    name: '胸托划船',
    aliases: ['俯身器械划船', 'chest supported row', 'seal row'],
    movementPattern: 'horizontal_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperBack]: 1.0,
      [SubMuscleGroup.Lats]: 0.5,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 250,
  }),
  def({
    id: 'conventional_deadlift',
    name: '传统硬拉',
    aliases: ['硬拉', '标准硬拉', '传统硬拉', 'deadlift', 'barbell deadlift'],
    fuzzyAliases: ['硬拉'],
    movementPattern: 'hinge',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.ErectorSpinae]: 1.0,
      [SubMuscleGroup.UpperBack]: 0.6,
      [SubMuscleGroup.Hamstrings]: 0.6,
      [SubMuscleGroup.Glutes]: 0.5,
      [SubMuscleGroup.UpperTraps]: 0.4,
      [SubMuscleGroup.Lats]: 0.3,
      [SubMuscleGroup.Quads]: 0.2,
      [SubMuscleGroup.Forearms]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 550,
  }),
  def({
    id: 'pull_up',
    name: '引体向上',
    aliases: [
      '引体', '引体向上', '正手引体向上', '反手引体向上', '辅助引体向上', '负重引体向上',
      '宽距引体向上', '窄距引体向上', 'pull up', 'pullup', 'chin up', 'chinup',
      'assisted pull up', 'weighted pull up',
    ],
    fuzzyAliases: ['引体'],
    movementPattern: 'vertical_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'bodyweight_plus_external',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.Lats]: 1.0,
      [SubMuscleGroup.UpperBack]: 0.5,
      [SubMuscleGroup.Biceps]: 0.5,
      [SubMuscleGroup.Forearms]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 350,
  }),
  def({
    id: 'straight_arm_pulldown',
    name: '直臂下压',
    aliases: ['直臂下拉', '绳索直臂下压', 'straight arm pulldown', 'straight arm lat pulldown'],
    movementPattern: 'vertical_pull',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'cable_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Lats]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'hyperextension',
    name: '山羊挺身',
    aliases: ['罗马椅挺身', '下背挺身', '山羊挺身', 'hyperextension', 'back extension'],
    movementPattern: 'hinge',
    primaryCategory: WorkoutCategory.Back,
    loadMode: 'bodyweight',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.ErectorSpinae]: 1.0,
      [SubMuscleGroup.Glutes]: 0.4,
      [SubMuscleGroup.Hamstrings]: 0.3,
    },
    hasStrengthBenchmark: true,
  }),

  // ==================== 腿部 Legs ====================
  def({
    id: 'barbell_back_squat',
    name: '杠铃深蹲',
    aliases: ['深蹲', '后蹲', '自由深蹲', '杠铃深蹲', 'squat', 'barbell squat', 'back squat'],
    fuzzyAliases: ['深蹲', '蹲'],
    movementPattern: 'squat',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.Quads]: 1.0,
      [SubMuscleGroup.Glutes]: 0.6,
      [SubMuscleGroup.Hamstrings]: 0.3,
      [SubMuscleGroup.ErectorSpinae]: 0.3,
      [SubMuscleGroup.Abs]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 500,
  }),
  def({
    id: 'front_squat',
    name: '颈前深蹲',
    aliases: ['前蹲', 'front squat'],
    movementPattern: 'squat',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.Quads]: 1.0,
      [SubMuscleGroup.Glutes]: 0.3,
      [SubMuscleGroup.UpperBack]: 0.2,
      [SubMuscleGroup.Abs]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 400,
  }),
  def({
    id: 'leg_press',
    name: '倒蹬机腿举',
    aliases: ['倒蹬', '腿举', '器械腿举', 'leg press'],
    fuzzyAliases: ['腿举'],
    movementPattern: 'squat',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Quads]: 1.0,
      [SubMuscleGroup.Glutes]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 800,
  }),
  def({
    id: 'hack_squat',
    name: '哈克深蹲',
    aliases: ['哈克', 'hack squat'],
    movementPattern: 'squat',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Quads]: 1.0,
      [SubMuscleGroup.Glutes]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 450,
  }),
  def({
    id: 'leg_extension',
    name: '坐姿腿屈伸',
    aliases: ['腿屈伸', '股四头肌屈伸', 'leg extension'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Quads]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 300,
  }),
  def({
    id: 'romanian_deadlift',
    name: '罗马尼亚硬拉',
    aliases: ['RDL', '直腿硬拉', '罗马尼亚硬拉', 'romanian deadlift'],
    movementPattern: 'hinge',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.Hamstrings]: 1.0,
      [SubMuscleGroup.Glutes]: 0.8,
      [SubMuscleGroup.ErectorSpinae]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 450,
  }),
  def({
    id: 'leg_curl',
    name: '俯卧腿弯举',
    aliases: ['腿弯举', '腘绳肌弯举', 'leg curl', 'lying leg curl'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Hamstrings]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 250,
  }),
  def({
    id: 'hip_thrust',
    name: '杠铃臀推',
    aliases: ['臀推', 'hip thrust', 'barbell hip thrust'],
    movementPattern: 'hinge',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'barbell_total',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.Glutes]: 1.0,
      [SubMuscleGroup.Hamstrings]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 600,
  }),
  def({
    id: 'dumbbell_lunge',
    name: '哑铃箭步蹲',
    aliases: ['箭步蹲', '弓步蹲', 'lunge', 'dumbbell lunges'],
    fuzzyAliases: ['箭步蹲'],
    movementPattern: 'squat',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.Quads]: 1.0,
      [SubMuscleGroup.Glutes]: 0.6,
      [SubMuscleGroup.Hamstrings]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'calf_raise',
    name: '站姿提踵',
    aliases: ['提踵', '小腿提踵', 'calf raise', 'standing calf raise'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Legs,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Calves]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 500,
  }),

  // ==================== 肩部 Shoulders ====================
  def({
    id: 'overhead_press',
    name: '杠铃过顶推举',
    aliases: ['杠铃推肩', '军式推举', '过顶推举', 'overhead press', 'military press'],
    movementPattern: 'vertical_push',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'barbell_total',
    benchmarkReliability: 'A',
    stimulusCoefficients: {
      [SubMuscleGroup.FrontDelt]: 1.0,
      [SubMuscleGroup.MiddleDelt]: 0.5,
      [SubMuscleGroup.Triceps]: 0.5,
      [SubMuscleGroup.UpperChest]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 250,
  }),
  def({
    id: 'seated_dumbbell_shoulder_press',
    name: '坐姿哑铃推举',
    aliases: ['哑铃推肩', '哑铃推举', '推肩', 'dumbbell shoulder press', 'seated dumbbell press'],
    movementPattern: 'vertical_push',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.FrontDelt]: 1.0,
      [SubMuscleGroup.MiddleDelt]: 0.5,
      [SubMuscleGroup.Triceps]: 0.4,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 120,
  }),
  def({
    id: 'dumbbell_lateral_raise',
    name: '哑铃侧平举',
    aliases: ['侧平举', '哑铃飞鸟侧平举', 'lateral raise', 'dumbbell lateral raise'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleDelt]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 90,
  }),
  def({
    id: 'cable_lateral_raise',
    name: '绳索侧平举',
    aliases: ['绳索飞鸟', 'cable lateral raise'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'cable_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.MiddleDelt]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 90,
  }),
  def({
    id: 'rear_delt_fly',
    name: '俯身哑铃飞鸟',
    aliases: ['俯身飞鸟', '后束飞鸟', 'rear delt fly', 'bent over rear delt raise'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.RearDelt]: 1.0,
      [SubMuscleGroup.MiddleDelt]: 0.3,
      [SubMuscleGroup.UpperBack]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 90,
  }),
  def({
    id: 'reverse_pec_deck',
    name: '蝴蝶机反向飞鸟',
    aliases: ['反向飞鸟', '蝴蝶机反飞鸟', 'reverse pec deck', 'reverse fly', 'pec deck reverse fly', 'rear delt machine fly'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'machine_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.RearDelt]: 1.0,
      [SubMuscleGroup.MiddleDelt]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 120,
  }),
  def({
    id: 'face_pull',
    name: '绳索面拉',
    aliases: ['面拉', 'face pull'],
    movementPattern: 'horizontal_pull',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'cable_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.RearDelt]: 1.0,
      [SubMuscleGroup.MiddleDelt]: 0.4,
      [SubMuscleGroup.UpperBack]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'front_raise',
    name: '哑铃前平举',
    aliases: ['前平举', 'front raise', 'dumbbell front raise'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.FrontDelt]: 1.0,
      [SubMuscleGroup.UpperChest]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 90,
  }),
  def({
    id: 'shrug',
    name: '杠铃耸肩',
    aliases: ['耸肩', '哑铃耸肩', 'shrug', 'barbell shrug'],
    movementPattern: 'carry',
    primaryCategory: WorkoutCategory.Shoulders,
    loadMode: 'barbell_total',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.UpperTraps]: 1.0,
      [SubMuscleGroup.Forearms]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 450,
  }),

  // ==================== 其它/手臂/核心 Others ====================
  def({
    id: 'barbell_curl',
    name: '杠铃弯举 (二头)',
    aliases: ['杠铃弯举', '二头弯举', 'barbell curl'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'barbell_total',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.Biceps]: 1.0,
      [SubMuscleGroup.Forearms]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 200,
  }),
  def({
    id: 'dumbbell_curl',
    name: '哑铃交替弯举 (二头)',
    aliases: ['哑铃弯举', '交替弯举', 'dumbbell curl'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Biceps]: 1.0,
      [SubMuscleGroup.Forearms]: 0.3,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 100,
  }),
  def({
    id: 'hammer_curl',
    name: '锤式弯举',
    aliases: ['锤式弯举', 'hammer curl'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'dumbbell_per_hand',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Biceps]: 1.0,
      [SubMuscleGroup.Forearms]: 0.5,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 100,
  }),
  def({
    id: 'triceps_pushdown',
    name: '绳索下压 (三头)',
    aliases: ['三头下压', '绳索下压', 'triceps pushdown', 'cable pushdown'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'cable_stack',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Triceps]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'skull_crusher',
    name: '仰卧臂屈伸 (三头)',
    aliases: ['法国推举', 'skull crusher', 'lying triceps extension'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'barbell_total',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Triceps]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'close_grip_bench_press',
    name: '窄握卧推',
    aliases: ['窄距卧推', '窄握卧推', 'close grip bench press'],
    movementPattern: 'horizontal_push',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'barbell_total',
    benchmarkReliability: 'B',
    stimulusCoefficients: {
      [SubMuscleGroup.Triceps]: 1.0,
      [SubMuscleGroup.MiddleChest]: 0.5,
      [SubMuscleGroup.FrontDelt]: 0.2,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 320,
  }),
  def({
    id: 'crunch',
    name: '卷腹 (腹肌)',
    aliases: ['卷腹', '仰卧起坐', 'crunches', 'sit up'],
    movementPattern: 'core',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'bodyweight',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Abs]: 1.0,
    },
    hasStrengthBenchmark: true,
  }),
  def({
    id: 'plank',
    name: '平板支撑',
    aliases: ['plank', '平板支撑'],
    movementPattern: 'core',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'bodyweight',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Abs]: 1.0,
    },
    hasStrengthBenchmark: true,
  }),
  def({
    id: 'ab_wheel',
    name: '健腹轮',
    aliases: ['腹肌轮', '健腹轮', 'ab roller', 'ab wheel'],
    movementPattern: 'core',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'bodyweight',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Abs]: 1.0,
    },
    hasStrengthBenchmark: true,
  }),
  def({
    id: 'hanging_leg_raise',
    name: '悬垂举腿',
    aliases: ['举腿', '悬垂举腿', 'hanging leg raise'],
    movementPattern: 'core',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'bodyweight',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Abs]: 1.0,
    },
    hasStrengthBenchmark: true,
  }),
  def({
    id: 'side_bend',
    name: '负重侧屈',
    aliases: ['负重侧屈', 'side bend', 'dumbbell side bend'],
    movementPattern: 'core',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'unilateral',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Abs]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
  def({
    id: 'wrist_curl',
    name: '前臂弯举',
    aliases: ['腕弯举', '前臂弯举', 'wrist curl'],
    movementPattern: 'isolation',
    primaryCategory: WorkoutCategory.Others,
    loadMode: 'barbell_total',
    benchmarkReliability: 'C',
    stimulusCoefficients: {
      [SubMuscleGroup.Forearms]: 1.0,
    },
    hasStrengthBenchmark: true,
    maxPlausibleLoad: 150,
  }),
];

const DEFINITION_BY_ID = new Map(EXERCISE_DEFINITIONS.map((d) => [d.id, d]));

/** Normalize for matching: lowercase, strip spaces/separators/full-width brackets. */
export function normalizeExerciseName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[\s\-_（）()【】\[\]+、,/|·]/g, '')
    .trim();
}

export interface ExerciseResolution {
  definition?: ExerciseDefinition;
  /** How the name was matched; 'none' means no canonical definition. */
  matchedBy: 'canonical_id' | 'exact_name' | 'exact_alias' | 'substring' | 'none';
  /** Canonical id when matched, otherwise the normalized raw name. */
  canonicalId: string;
}

const FUZZY_MIN_ZH = 2;
const FUZZY_MIN_LATIN = 4;
const isLatin = (s: string) => /^[a-z0-9]+$/.test(s);
const fuzzyOk = (fragment: string) =>
  isLatin(fragment) ? fragment.length >= FUZZY_MIN_LATIN : fragment.length >= FUZZY_MIN_ZH;

/**
 * Resolve an arbitrary logged exercise name to its canonical definition.
 * Match priority (spec #36): exact canonical name > exact alias >
 * controlled substring (fuzzyAliases only, minimum length guarded,
 * longest fragment first). Unrestricted short-alias substring matching is
 * forbidden to prevent e.g. '卧推' hijacking '哑铃卧推' (exact aliases are
 * always resolved first, so this only affects truly novel names).
 */
export function resolveExerciseDefinition(name: string): ExerciseResolution {
  const clean = normalizeExerciseName(name);
  if (!clean) return { matchedBy: 'none', canonicalId: '' };

  for (const d of EXERCISE_DEFINITIONS) {
    if (normalizeExerciseName(d.name) === clean) {
      return { definition: d, matchedBy: 'exact_name', canonicalId: d.id };
    }
  }
  for (const d of EXERCISE_DEFINITIONS) {
    if (d.aliases.some((alias) => normalizeExerciseName(alias) === clean)) {
      return { definition: d, matchedBy: 'exact_alias', canonicalId: d.id };
    }
  }
  // Controlled substring: collect (fragment, definition) pairs, longest first,
  // so '上斜推胸' wins over '推胸' style prefixes when both would match.
  const fragments: Array<{ fragment: string; d: ExerciseDefinition }> = [];
  for (const d of EXERCISE_DEFINITIONS) {
    const nameFragment = normalizeExerciseName(d.name);
    if (fuzzyOk(nameFragment) && clean.includes(nameFragment)) {
      fragments.push({ fragment: nameFragment, d });
    }
    for (const alias of d.fuzzyAliases || []) {
      const f = normalizeExerciseName(alias);
      if (fuzzyOk(f) && clean.includes(f)) fragments.push({ fragment: f, d });
    }
  }
  if (fragments.length > 0) {
    fragments.sort((a, b) => b.fragment.length - a.fragment.length);
    const best = fragments[0];
    return { definition: best.d, matchedBy: 'substring', canonicalId: best.d.id };
  }
  return { matchedBy: 'none', canonicalId: clean };
}

export function getExerciseDefinition(id: string): ExerciseDefinition | undefined {
  return DEFINITION_BY_ID.get(id);
}

/**
 * Stable deduplication key for analytics aggregation: canonical id when known,
 * otherwise the normalized raw name (unknown custom exercises stay distinct).
 */
export function canonicalExerciseKey(name: string): string {
  return resolveExerciseDefinition(name).canonicalId || normalizeExerciseName(name);
}
