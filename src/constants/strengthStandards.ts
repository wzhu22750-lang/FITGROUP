import { WorkoutCategory } from '../types';

export type StrengthTierKey = 'novice' | 'beginner' | 'intermediate' | 'proficient' | 'elite';

export interface StrengthTierMeta {
  key: StrengthTierKey;
  level: number; // 1 to 5
  score: number; // 20, 40, 60, 80, 100
  zh: string;
  en: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

export const STRENGTH_TIERS: Record<StrengthTierKey, StrengthTierMeta> = {
  novice: {
    key: 'novice',
    level: 1,
    score: 20,
    zh: '新手',
    en: 'Novice',
    badgeBg: 'bg-slate-200',
    badgeText: 'text-slate-800',
    description: '掌握动作规范，建立基础肌力',
  },
  beginner: {
    key: 'beginner',
    level: 2,
    score: 40,
    zh: '入门',
    en: 'Beginner',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    description: '规律训练，力量初见成效',
  },
  intermediate: {
    key: 'intermediate',
    level: 3,
    score: 60,
    zh: '进阶',
    en: 'Intermediate',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    description: '掌握大重量，超越大众平均水平',
  },
  proficient: {
    key: 'proficient',
    level: 4,
    score: 80,
    zh: '熟练',
    en: 'Proficient',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    description: '资深健身达人，力量与形体出众',
  },
  elite: {
    key: 'elite',
    level: 5,
    score: 100,
    zh: '精英',
    en: 'Elite',
    badgeBg: 'bg-amber-300',
    badgeText: 'text-amber-950',
    description: '竞技级高阶力量水准',
  },
};

export interface ExerciseStandard {
  name: string;
  aliases: string[];
  primaryCategory: WorkoutCategory;
  /**
   * Compound muscle contribution split (sums to 1.0)
   * Example: 传统硬拉 -> { [WorkoutCategory.Legs]: 0.55, [WorkoutCategory.Back]: 0.45 }
   */
  muscleWeights: Partial<Record<WorkoutCategory, number>>;
  unit: 'kg' | 'min' | 'km' | 'reps';
  /**
   * Standard threshold values for [Novice(20), Beginner(40), Intermediate(60), Proficient(80), Elite(100)]
   */
  thresholds: [number, number, number, number, number];
  isDumbbellSingle?: boolean; // Single dumbbell weight (e.g. 20kg dumbbell = 20kg per hand)
  type: 'strength' | 'cardio';
}

/**
 * Standard exercise benchmarks calibrated against international strength standards
 * (StrengthLevel / ExRx / NSCA standards for typical adult lifters)
 */
export const EXERCISE_STANDARDS: ExerciseStandard[] = [
  // ==================== 胸部 (CHEST) ====================
  {
    name: '杠铃平板卧推',
    aliases: ['卧推', '平板卧推', '杠铃卧推', 'bench press', 'flat bench'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 0.85, [WorkoutCategory.Others]: 0.15 },
    unit: 'kg',
    thresholds: [30, 50, 75, 100, 125],
    type: 'strength',
  },
  {
    name: '哑铃平板卧推',
    aliases: ['哑铃卧推', 'dumbbell bench press'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 0.85, [WorkoutCategory.Others]: 0.15 },
    unit: 'kg',
    thresholds: [10, 18, 28, 36, 44],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '哑铃上斜卧推',
    aliases: ['上斜哑铃卧推', '上斜卧推', 'incline dumbbell press'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 0.75, [WorkoutCategory.Shoulders]: 0.25 },
    unit: 'kg',
    thresholds: [10, 18, 26, 34, 42],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '史密斯上斜推胸',
    aliases: ['史密斯卧推', '史密斯推胸', 'smith bench press'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 0.75, [WorkoutCategory.Shoulders]: 0.25 },
    unit: 'kg',
    thresholds: [25, 45, 70, 90, 115],
    type: 'strength',
  },
  {
    name: '蝴蝶机夹胸',
    aliases: ['坐姿夹胸', '器械夹胸', 'pec deck', 'chest fly'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 1.0 },
    unit: 'kg',
    thresholds: [20, 35, 55, 75, 95],
    type: 'strength',
  },
  {
    name: '绳索夹胸',
    aliases: ['龙门架夹胸', 'cable fly', 'cable crossover'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 1.0 },
    unit: 'kg',
    thresholds: [10, 15, 25, 35, 45],
    type: 'strength',
  },
  {
    name: '双杠臂屈伸',
    aliases: ['双杠', '臂屈伸', 'dips'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 0.55, [WorkoutCategory.Others]: 0.35, [WorkoutCategory.Shoulders]: 0.1 },
    unit: 'kg',
    thresholds: [0, 5, 15, 30, 50],
    type: 'strength',
  },
  {
    name: '俯卧撑',
    aliases: ['标准俯卧撑', 'push up', 'pushups'],
    primaryCategory: WorkoutCategory.Chest,
    muscleWeights: { [WorkoutCategory.Chest]: 0.65, [WorkoutCategory.Others]: 0.25, [WorkoutCategory.Shoulders]: 0.1 },
    unit: 'reps',
    thresholds: [15, 25, 40, 60, 80],
    type: 'strength',
  },

  // ==================== 背部 (BACK) ====================
  {
    name: '高位下拉',
    aliases: ['下拉', '宽握下拉', 'lat pulldown'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Back]: 0.85, [WorkoutCategory.Others]: 0.15 },
    unit: 'kg',
    thresholds: [30, 45, 65, 85, 105],
    type: 'strength',
  },
  {
    name: '杠铃划船',
    aliases: ['俯身杠铃划船', '俯身划船', 'barbell row'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Back]: 0.8, [WorkoutCategory.Shoulders]: 0.1, [WorkoutCategory.Others]: 0.1 },
    unit: 'kg',
    thresholds: [30, 50, 70, 90, 115],
    type: 'strength',
  },
  {
    name: '坐姿绳索划船',
    aliases: ['坐姿划船', '绳索划船', 'seated cable row'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Back]: 0.85, [WorkoutCategory.Others]: 0.15 },
    unit: 'kg',
    thresholds: [25, 45, 65, 85, 105],
    type: 'strength',
  },
  {
    name: '哑铃单臂划船',
    aliases: ['单臂哑铃划船', '哑铃划船', 'dumbbell row'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Back]: 0.85, [WorkoutCategory.Others]: 0.15 },
    unit: 'kg',
    thresholds: [12, 20, 30, 40, 50],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '传统硬拉',
    aliases: ['硬拉', '标准硬拉', 'deadlift', 'barbell deadlift'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Legs]: 0.55, [WorkoutCategory.Back]: 0.45 },
    unit: 'kg',
    thresholds: [50, 80, 120, 160, 200],
    type: 'strength',
  },
  {
    name: '引体向上',
    aliases: ['正手引体向上', '反手引体向上', 'pull up', 'chin up'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Back]: 0.85, [WorkoutCategory.Others]: 0.15 },
    unit: 'reps',
    thresholds: [2, 6, 12, 20, 30],
    type: 'strength',
  },
  {
    name: '直臂下压',
    aliases: ['直臂下拉', '绳索直臂下压', 'straight arm pulldown'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Back]: 0.9, [WorkoutCategory.Others]: 0.1 },
    unit: 'kg',
    thresholds: [15, 25, 35, 45, 55],
    type: 'strength',
  },
  {
    name: '山羊挺身',
    aliases: ['罗马椅挺身', '下背挺身', 'hyperextension'],
    primaryCategory: WorkoutCategory.Back,
    muscleWeights: { [WorkoutCategory.Back]: 0.6, [WorkoutCategory.Legs]: 0.4 },
    unit: 'kg',
    thresholds: [0, 10, 20, 35, 50],
    type: 'strength',
  },

  // ==================== 腿部 (LEGS) ====================
  {
    name: '杠铃深蹲',
    aliases: ['深蹲', '后蹲', '自由深蹲', 'squat', 'barbell squat'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 0.9, [WorkoutCategory.Others]: 0.1 },
    unit: 'kg',
    thresholds: [40, 70, 100, 140, 180],
    type: 'strength',
  },
  {
    name: '倒蹬机腿举',
    aliases: ['倒蹬', '腿举', '器械腿举', 'leg press'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 1.0 },
    unit: 'kg',
    thresholds: [80, 140, 200, 280, 360],
    type: 'strength',
  },
  {
    name: '罗马尼亚硬拉',
    aliases: ['RDL', '直腿硬拉', 'romanian deadlift'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 0.75, [WorkoutCategory.Back]: 0.25 },
    unit: 'kg',
    thresholds: [40, 65, 95, 130, 165],
    type: 'strength',
  },
  {
    name: '坐姿腿屈伸',
    aliases: ['腿屈伸', '股四头肌屈伸', 'leg extension'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 1.0 },
    unit: 'kg',
    thresholds: [20, 35, 55, 75, 95],
    type: 'strength',
  },
  {
    name: '俯卧腿弯举',
    aliases: ['腿弯举', '腘绳肌弯举', 'leg curl', 'lying leg curl'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 1.0 },
    unit: 'kg',
    thresholds: [15, 30, 45, 60, 75],
    type: 'strength',
  },
  {
    name: '哑铃箭步蹲',
    aliases: ['箭步蹲', '弓步蹲', 'lunge', 'dumbbell lunges'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 1.0 },
    unit: 'kg',
    thresholds: [8, 15, 22, 30, 38],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '站姿提踵',
    aliases: ['提踵', '小腿提踵', 'calf raise'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 1.0 },
    unit: 'kg',
    thresholds: [30, 55, 85, 120, 160],
    type: 'strength',
  },
  {
    name: '杠铃臀推',
    aliases: ['臀推', 'hip thrust', 'barbell hip thrust'],
    primaryCategory: WorkoutCategory.Legs,
    muscleWeights: { [WorkoutCategory.Legs]: 1.0 },
    unit: 'kg',
    thresholds: [40, 70, 110, 150, 200],
    type: 'strength',
  },

  // ==================== 肩部 (SHOULDERS) ====================
  {
    name: '坐姿哑铃推举',
    aliases: ['哑铃推肩', '哑铃推举', '推肩', 'dumbbell shoulder press'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Shoulders]: 0.8, [WorkoutCategory.Others]: 0.15, [WorkoutCategory.Chest]: 0.05 },
    unit: 'kg',
    thresholds: [8, 16, 24, 32, 40],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '杠铃过顶推举',
    aliases: ['杠铃推肩', '军式推举', '过顶推举', 'overhead press', 'military press'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Shoulders]: 0.8, [WorkoutCategory.Others]: 0.15, [WorkoutCategory.Chest]: 0.05 },
    unit: 'kg',
    thresholds: [20, 35, 50, 65, 80],
    type: 'strength',
  },
  {
    name: '哑铃侧平举',
    aliases: ['侧平举', '哑铃飞鸟侧平举', 'lateral raise'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Shoulders]: 1.0 },
    unit: 'kg',
    thresholds: [4, 7.5, 12, 17.5, 22.5],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '绳索侧平举',
    aliases: ['绳索飞鸟', 'cable lateral raise'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Shoulders]: 1.0 },
    unit: 'kg',
    thresholds: [2.5, 5, 8, 12, 16],
    type: 'strength',
  },
  {
    name: '俯身哑铃飞鸟',
    aliases: ['俯身飞鸟', '后束飞鸟', 'rear delt fly'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Shoulders]: 0.7, [WorkoutCategory.Back]: 0.3 },
    unit: 'kg',
    thresholds: [4, 7.5, 12, 16, 20],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '绳索面拉',
    aliases: ['面拉', 'face pull'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Shoulders]: 0.6, [WorkoutCategory.Back]: 0.4 },
    unit: 'kg',
    thresholds: [15, 25, 35, 45, 55],
    type: 'strength',
  },
  {
    name: '哑铃前平举',
    aliases: ['前平举', 'front raise'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Shoulders]: 0.85, [WorkoutCategory.Chest]: 0.15 },
    unit: 'kg',
    thresholds: [4, 7.5, 12, 16, 20],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '杠铃耸肩',
    aliases: ['耸肩', '哑铃耸肩', 'shrug'],
    primaryCategory: WorkoutCategory.Shoulders,
    muscleWeights: { [WorkoutCategory.Back]: 0.6, [WorkoutCategory.Shoulders]: 0.4 },
    unit: 'kg',
    thresholds: [40, 65, 95, 130, 170],
    type: 'strength',
  },

  // ==================== 其它/手臂/核心 (OTHERS / ARMS & CORE) ====================
  {
    name: '杠铃弯举 (二头)',
    aliases: ['杠铃弯举', '二头弯举', 'barbell curl'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'kg',
    thresholds: [15, 25, 35, 45, 55],
    type: 'strength',
  },
  {
    name: '哑铃交替弯举 (二头)',
    aliases: ['哑铃弯举', '交替弯举', 'dumbbell curl'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'kg',
    thresholds: [7.5, 12.5, 17.5, 22.5, 27.5],
    isDumbbellSingle: true,
    type: 'strength',
  },
  {
    name: '绳索下压 (三头)',
    aliases: ['三头下压', '绳索下压', 'triceps pushdown'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'kg',
    thresholds: [15, 25, 40, 55, 70],
    type: 'strength',
  },
  {
    name: '仰卧臂屈伸 (三头)',
    aliases: ['法国推举', 'skull crusher', 'lying triceps extension'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'kg',
    thresholds: [12, 20, 30, 42, 55],
    type: 'strength',
  },
  {
    name: '卷腹 (腹肌)',
    aliases: ['卷腹', '仰卧起坐', 'crunches'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'reps',
    thresholds: [20, 40, 60, 80, 100],
    type: 'strength',
  },
  {
    name: '平板支撑',
    aliases: ['plank'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'reps', // represents duration in seconds
    thresholds: [60, 90, 120, 180, 240],
    type: 'strength',
  },
  {
    name: '健腹轮',
    aliases: ['腹肌轮', 'ab roller'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'reps',
    thresholds: [10, 20, 30, 40, 50],
    type: 'strength',
  },
  {
    name: '悬垂举腿',
    aliases: ['举腿', 'hanging leg raise'],
    primaryCategory: WorkoutCategory.Others,
    muscleWeights: { [WorkoutCategory.Others]: 1.0 },
    unit: 'reps',
    thresholds: [10, 15, 20, 25, 30],
    type: 'strength',
  },

  // ==================== 有氧 (CARDIO) ====================
  {
    name: '跑步机跑步',
    aliases: ['跑步', '户外跑步', '慢跑', 'running', 'treadmill'],
    primaryCategory: WorkoutCategory.Cardio,
    muscleWeights: { [WorkoutCategory.Cardio]: 1.0 },
    unit: 'min',
    thresholds: [15, 30, 45, 60, 90],
    type: 'cardio',
  },
  {
    name: '动感单车',
    aliases: ['单车', '骑行', 'cycling', 'spin bike'],
    primaryCategory: WorkoutCategory.Cardio,
    muscleWeights: { [WorkoutCategory.Cardio]: 1.0 },
    unit: 'min',
    thresholds: [20, 35, 50, 65, 90],
    type: 'cardio',
  },
  {
    name: '划船机',
    aliases: ['rower', 'rowing machine'],
    primaryCategory: WorkoutCategory.Cardio,
    muscleWeights: { [WorkoutCategory.Cardio]: 0.8, [WorkoutCategory.Back]: 0.2 },
    unit: 'min',
    thresholds: [10, 20, 30, 45, 60],
    type: 'cardio',
  },
  {
    name: '跳绳',
    aliases: ['jump rope', 'skipping'],
    primaryCategory: WorkoutCategory.Cardio,
    muscleWeights: { [WorkoutCategory.Cardio]: 1.0 },
    unit: 'min',
    thresholds: [10, 15, 25, 35, 50],
    type: 'cardio',
  },
  {
    name: '爬楼机',
    aliases: ['stairmaster', 'stair climber'],
    primaryCategory: WorkoutCategory.Cardio,
    muscleWeights: { [WorkoutCategory.Cardio]: 0.85, [WorkoutCategory.Legs]: 0.15 },
    unit: 'min',
    thresholds: [10, 15, 25, 35, 50],
    type: 'cardio',
  },
  {
    name: 'HIIT间歇训练',
    aliases: ['hiit', '间歇训练'],
    primaryCategory: WorkoutCategory.Cardio,
    muscleWeights: { [WorkoutCategory.Cardio]: 1.0 },
    unit: 'min',
    thresholds: [10, 15, 25, 35, 45],
    type: 'cardio',
  },
];
