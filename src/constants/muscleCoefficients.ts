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

export const SUB_MUSCLE_WEIGHTS: Record<WorkoutCategory, Record<string, number>> = {
  [WorkoutCategory.Shoulders]: { [SubMuscleGroup.FrontDelt]: 0.30, [SubMuscleGroup.MiddleDelt]: 0.40, [SubMuscleGroup.RearDelt]: 0.30 },
  [WorkoutCategory.Chest]: { [SubMuscleGroup.UpperChest]: 0.30, [SubMuscleGroup.MiddleChest]: 0.40, [SubMuscleGroup.LowerChest]: 0.30 },
  [WorkoutCategory.Back]: { [SubMuscleGroup.Lats]: 0.35, [SubMuscleGroup.UpperBack]: 0.35, [SubMuscleGroup.UpperTraps]: 0.10, [SubMuscleGroup.ErectorSpinae]: 0.20 },
  [WorkoutCategory.Legs]: { [SubMuscleGroup.Quads]: 0.35, [SubMuscleGroup.Hamstrings]: 0.25, [SubMuscleGroup.Glutes]: 0.25, [SubMuscleGroup.Calves]: 0.15 },
  [WorkoutCategory.Others]: { [SubMuscleGroup.Biceps]: 0.30, [SubMuscleGroup.Triceps]: 0.30, [SubMuscleGroup.Abs]: 0.30, [SubMuscleGroup.Forearms]: 0.10 },
  [WorkoutCategory.Cardio]: {},
};

export interface ExerciseMuscleCoefficient {
  /** Primary display name */
  name: string;
  /** Alternative names for fuzzy matching */
  aliases: string[];
  /** Which main category this exercise belongs to */
  primaryCategory: WorkoutCategory;
  /** Sub-muscle group distribution (values should sum to ~1.0) */
  subMuscles: Partial<Record<SubMuscleGroup, number>>;
}

export const EXERCISE_MUSCLE_COEFFICIENTS: ExerciseMuscleCoefficient[] = [
  // ================= 肩部 Shoulders =================
  {
    name: '杠铃肩推',
    aliases: ['杠铃过顶推举', '坐姿哑铃推举'],
    primaryCategory: WorkoutCategory.Shoulders,
    subMuscles: { [SubMuscleGroup.FrontDelt]: 0.7, [SubMuscleGroup.MiddleDelt]: 0.3 },
  },
  {
    name: '前平举',
    aliases: ['哑铃前平举'],
    primaryCategory: WorkoutCategory.Shoulders,
    subMuscles: { [SubMuscleGroup.FrontDelt]: 1.0 },
  },
  {
    name: '哑铃侧平举',
    aliases: ['绳索侧平举', '器械侧平举'],
    primaryCategory: WorkoutCategory.Shoulders,
    subMuscles: { [SubMuscleGroup.MiddleDelt]: 1.0 },
  },
  {
    name: '俯身飞鸟',
    aliases: ['俯身哑铃飞鸟'],
    primaryCategory: WorkoutCategory.Shoulders,
    subMuscles: { [SubMuscleGroup.MiddleDelt]: 0.2, [SubMuscleGroup.RearDelt]: 0.8 },
  },
  {
    name: '面拉',
    aliases: ['绳索面拉'],
    primaryCategory: WorkoutCategory.Shoulders,
    subMuscles: { [SubMuscleGroup.MiddleDelt]: 0.3, [SubMuscleGroup.RearDelt]: 0.7 },
  },
  {
    name: '蝴蝶机反向飞鸟',
    aliases: [],
    primaryCategory: WorkoutCategory.Shoulders,
    subMuscles: { [SubMuscleGroup.MiddleDelt]: 0.2, [SubMuscleGroup.RearDelt]: 0.8 },
  },

  // ================= 胸部 Chest =================
  {
    name: '上斜杠铃卧推',
    aliases: ['上斜哑铃卧推', '史密斯上斜推胸', '杠铃上斜卧推', '哑铃上斜卧推', '上斜哑铃推胸', '哑铃上斜推胸', '上斜推胸', '上斜卧推'],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.UpperChest]: 0.8, [SubMuscleGroup.MiddleChest]: 0.2 },
  },
  {
    name: '平板杠铃卧推',
    aliases: ['平板哑铃卧推', '杠铃平板卧推', '哑铃平板卧推', '哑铃推胸', '哑铃卧推', '平板推胸', '推胸', '杠铃推胸', '平板哑铃推胸', '卧推'],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.UpperChest]: 0.2, [SubMuscleGroup.MiddleChest]: 0.8 },
  },
  {
    name: '器械推胸',
    aliases: ['坐姿推胸', '坐姿器械推胸', '推胸机', '器械卧推', '坐姿推胸机'],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.UpperChest]: 0.2, [SubMuscleGroup.MiddleChest]: 0.8 },
  },

  {
    name: '蝴蝶机夹胸',
    aliases: [],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.UpperChest]: 0.3, [SubMuscleGroup.MiddleChest]: 0.7 },
  },
  {
    name: '绳索夹胸',
    aliases: [],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.UpperChest]: 0.3, [SubMuscleGroup.MiddleChest]: 0.7 },
  },
  {
    name: '上斜飞鸟',
    aliases: [],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.UpperChest]: 0.8, [SubMuscleGroup.MiddleChest]: 0.2 },
  },
  {
    name: '双杠臂屈伸',
    aliases: [],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.MiddleChest]: 0.3, [SubMuscleGroup.LowerChest]: 0.7 },
  },
  {
    name: '下斜卧推',
    aliases: [],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.MiddleChest]: 0.3, [SubMuscleGroup.LowerChest]: 0.7 },
  },
  {
    name: '绳索下压夹胸',
    aliases: [],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.MiddleChest]: 0.3, [SubMuscleGroup.LowerChest]: 0.7 },
  },
  {
    name: '俯卧撑',
    aliases: [],
    primaryCategory: WorkoutCategory.Chest,
    subMuscles: { [SubMuscleGroup.UpperChest]: 0.2, [SubMuscleGroup.MiddleChest]: 0.7, [SubMuscleGroup.LowerChest]: 0.1 },
  },

  // ================= 背部 Back =================
  {
    name: '高位下拉',
    aliases: [],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.80, [SubMuscleGroup.UpperBack]: 0.20 },
  },
  {
    name: '引体向上',
    aliases: ['正手引体向上', '反手引体向上', '辅助引体向上', '负重引体向上', '宽距引体向上', '窄距引体向上', 'pull up', 'chin up', 'pullup', 'chinup'],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.75, [SubMuscleGroup.UpperBack]: 0.25 },
  },
  {
    name: '直臂下压',
    aliases: [],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 1.00 },
  },
  {
    name: '单臂哑铃划船',
    aliases: ['哑铃单臂划船'],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.60, [SubMuscleGroup.UpperBack]: 0.40 },
  },
  {
    name: '坐姿划船',
    aliases: ['坐姿绳索划船'],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.45, [SubMuscleGroup.UpperBack]: 0.55 },
  },
  {
    name: '杠铃划船',
    aliases: [],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.40, [SubMuscleGroup.UpperBack]: 0.45, [SubMuscleGroup.ErectorSpinae]: 0.15 },
  },
  {
    name: 'T杠划船',
    aliases: [],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.40, [SubMuscleGroup.UpperBack]: 0.50, [SubMuscleGroup.ErectorSpinae]: 0.10 },
  },
  {
    name: '胸托划船',
    aliases: [],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.35, [SubMuscleGroup.UpperBack]: 0.65 },
  },
  {
    name: '耸肩',
    aliases: ['杠铃耸肩'],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.UpperTraps]: 1.00 },
  },
  {
    name: '硬拉',
    aliases: ['传统硬拉'],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.Lats]: 0.15, [SubMuscleGroup.UpperBack]: 0.15, [SubMuscleGroup.UpperTraps]: 0.15, [SubMuscleGroup.ErectorSpinae]: 0.55 },
  },
  {
    name: '罗马椅挺身',
    aliases: ['山羊挺身'],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.UpperBack]: 0.10, [SubMuscleGroup.ErectorSpinae]: 0.90 },
  },
  {
    name: '俯卧挺身',
    aliases: [],
    primaryCategory: WorkoutCategory.Back,
    subMuscles: { [SubMuscleGroup.ErectorSpinae]: 1.00 },
  },

  // ================= 腿部 Legs =================
  {
    name: '深蹲',
    aliases: ['杠铃深蹲'],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Quads]: 0.5, [SubMuscleGroup.Hamstrings]: 0.1, [SubMuscleGroup.Glutes]: 0.4 },
  },
  {
    name: '前蹲',
    aliases: [],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Quads]: 0.7, [SubMuscleGroup.Hamstrings]: 0.1, [SubMuscleGroup.Glutes]: 0.2 },
  },
  {
    name: '腿举',
    aliases: ['倒蹬机腿举'],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Quads]: 0.6, [SubMuscleGroup.Hamstrings]: 0.1, [SubMuscleGroup.Glutes]: 0.3 },
  },
  {
    name: '哈克深蹲',
    aliases: [],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Quads]: 0.7, [SubMuscleGroup.Hamstrings]: 0.1, [SubMuscleGroup.Glutes]: 0.2 },
  },
  {
    name: '腿屈伸',
    aliases: ['坐姿腿屈伸'],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Quads]: 1.0 },
  },
  {
    name: '罗马尼亚硬拉',
    aliases: [],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Hamstrings]: 0.5, [SubMuscleGroup.Glutes]: 0.5 },
  },
  {
    name: '腿弯举',
    aliases: ['俯卧腿弯举'],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Hamstrings]: 1.0 },
  },
  {
    name: '臀推',
    aliases: ['杠铃臀推'],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Hamstrings]: 0.1, [SubMuscleGroup.Glutes]: 0.9 },
  },
  {
    name: '保加利亚分腿蹲',
    aliases: ['哑铃箭步蹲', '箭步蹲'],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Quads]: 0.5, [SubMuscleGroup.Hamstrings]: 0.1, [SubMuscleGroup.Glutes]: 0.4 },
  },
  {
    name: '提踵',
    aliases: ['站姿提踵'],
    primaryCategory: WorkoutCategory.Legs,
    subMuscles: { [SubMuscleGroup.Calves]: 1.0 },
  },

  // ================= 其他 Others =================
  {
    name: '杠铃弯举',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Biceps]: 1.0 },
  },
  {
    name: '哑铃弯举',
    aliases: ['哑铃交替弯举'],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Biceps]: 1.0 },
  },
  {
    name: '锤式弯举',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Biceps]: 0.7, [SubMuscleGroup.Forearms]: 0.3 },
  },
  {
    name: '绳索下压',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Triceps]: 1.0 },
  },
  {
    name: '仰卧臂屈伸',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Triceps]: 1.0 },
  },
  {
    name: '窄握卧推',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Biceps]: 0.1, [SubMuscleGroup.Triceps]: 0.8, [SubMuscleGroup.Forearms]: 0.1 },
  },
  {
    name: '卷腹',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Abs]: 1.0 },
  },
  {
    name: '悬垂举腿',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Abs]: 1.0 },
  },
  {
    name: '平板支撑',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Abs]: 0.8, [SubMuscleGroup.Forearms]: 0.2 },
  },
  {
    name: '腹轮',
    aliases: ['健腹轮'],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Abs]: 0.8, [SubMuscleGroup.Forearms]: 0.2 },
  },
  {
    name: '负重侧屈',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Abs]: 0.8, [SubMuscleGroup.Forearms]: 0.2 },
  },
  {
    name: '前臂弯举',
    aliases: [],
    primaryCategory: WorkoutCategory.Others,
    subMuscles: { [SubMuscleGroup.Forearms]: 1.0 },
  },
];

/**
 * Normalize exercise name for fuzzy matching (same logic as existing normalizeName)
 */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_（）()【】\[\]+、,/|]/g, '').trim();
}

/**
 * Find the muscle coefficient entry for an exercise by name or alias
 */
export function findMuscleCoefficient(exerciseName: string): ExerciseMuscleCoefficient | undefined {
  if (!exerciseName) return undefined;
  const clean = normalizeName(exerciseName);
  
  // Exact or alias match
  for (const entry of EXERCISE_MUSCLE_COEFFICIENTS) {
    if (normalizeName(entry.name) === clean) return entry;
    if (entry.aliases.some(a => normalizeName(a) === clean)) return entry;
  }
  
  // Substring match
  for (const entry of EXERCISE_MUSCLE_COEFFICIENTS) {
    if (clean.includes(normalizeName(entry.name))) return entry;
    if (entry.aliases.some(a => clean.includes(normalizeName(a)))) return entry;
  }
  
  return undefined;
}

/** 细分部位评分权重 */
export const SCORE_WEIGHTS = {
  frequency: 0.20,  // 频率分
  volume: 0.50,     // 容量分  
  weight: 0.30,     // 重量分
} as const;

/** 频率满分标准：每周3次 */
export const FREQUENCY_FULL_SCORE_PER_WEEK = 3;

/** 容量目标：每周12个加权组 */
export const VOLUME_TARGET_PER_WEEK = 12;

/** 统计周期天数 */
export const SCORING_PERIOD_DAYS = 28;

/** 有氧卡路里目标（28天） */
export const CARDIO_CALORIE_TARGETS = {
  low: 1000,
  normal: 2000,
  high: 3000,
} as const;

/** 默认有氧卡路里目标 */
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
