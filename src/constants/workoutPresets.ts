import { WorkoutCategory } from '../types';

export interface PresetExercise {
  name: string;
  type: 'strength' | 'cardio';
  defaultWeight?: number;
  defaultSets?: number;
  defaultReps?: number;
  defaultDuration?: number;
  defaultDistance?: number;
  defaultCalories?: number;
  met?: number;
  hasDistance?: boolean;
}

export interface CardioActivityMeta {
  name: string;
  aliases: string[];
  met: number;
  hasDistance: boolean;
  defaultDuration: number;
  defaultDistance?: number;
}

/**
 * Common cardio activities and sports calibrated with Compendium of Physical Activities MET values.
 * Standard formula: Calories (kcal) = MET × Weight (kg) × (Duration (min) / 60)
 */
export const CARDIO_MET_TABLE: CardioActivityMeta[] = [
  { name: '羽毛球', aliases: ['打羽毛球', 'badminton'], met: 6.5, hasDistance: false, defaultDuration: 45, defaultDistance: 0 },
  { name: '篮球', aliases: ['打篮球', '投篮', 'basketball'], met: 7.0, hasDistance: false, defaultDuration: 45, defaultDistance: 0 },
  { name: '足球', aliases: ['踢足球', 'soccer', 'football'], met: 7.5, hasDistance: false, defaultDuration: 60, defaultDistance: 0 },
  { name: '游泳', aliases: ['自由泳', '蛙泳', 'swimming', 'swim'], met: 7.0, hasDistance: false, defaultDuration: 40, defaultDistance: 0 },
  { name: '网球', aliases: ['打网球', 'tennis'], met: 7.0, hasDistance: false, defaultDuration: 60, defaultDistance: 0 },
  { name: '乒乓球', aliases: ['打乒乓球', '桌球', 'table tennis', 'ping pong'], met: 4.0, hasDistance: false, defaultDuration: 45, defaultDistance: 0 },
  { name: '跑步机跑步', aliases: ['跑步机', 'treadmill'], met: 8.5, hasDistance: true, defaultDuration: 30, defaultDistance: 4 },
  { name: '户外跑步', aliases: ['跑步', '路跑', '晨跑', '夜跑', 'running', 'jogging'], met: 9.0, hasDistance: true, defaultDuration: 30, defaultDistance: 5 },
  { name: '动感单车', aliases: ['室内单车', 'spin bike', 'spinning'], met: 7.5, hasDistance: true, defaultDuration: 40, defaultDistance: 12 },
  { name: '户外骑行', aliases: ['骑行', '骑车', '自行车', '公路车', 'cycling', 'biking'], met: 6.8, hasDistance: true, defaultDuration: 45, defaultDistance: 12 },
  { name: '跳绳', aliases: ['摇绳', 'jump rope', 'skipping'], met: 9.0, hasDistance: false, defaultDuration: 20, defaultDistance: 0 },
  { name: 'HIIT间歇训练', aliases: ['hiit', '高强度间歇', 'tabata'], met: 8.5, hasDistance: false, defaultDuration: 20, defaultDistance: 0 },
  { name: '爬楼机', aliases: ['楼梯机', '爬楼', 'stair climber', 'stairmaster'], met: 8.0, hasDistance: false, defaultDuration: 20, defaultDistance: 0 },
  { name: '拳击 / 搏击操', aliases: ['拳击', '搏击', '散打', '泰拳', 'boxing', 'kickboxing'], met: 7.5, hasDistance: false, defaultDuration: 40, defaultDistance: 0 },
  { name: '椭圆机', aliases: ['太空漫步机', 'elliptical'], met: 5.5, hasDistance: true, defaultDuration: 30, defaultDistance: 3 },
  { name: '划船机', aliases: ['划船', 'rower', 'rowing'], met: 7.0, hasDistance: true, defaultDuration: 20, defaultDistance: 3 },
  { name: '健走 / 散步', aliases: ['快走', '健走', '散步', 'walking', 'brisk walk'], met: 3.8, hasDistance: true, defaultDuration: 40, defaultDistance: 3 },
  { name: '有氧舞蹈 / 尊巴', aliases: ['尊巴', '健美操', 'zumba', 'aerobics', 'dance'], met: 6.0, hasDistance: false, defaultDuration: 45, defaultDistance: 0 },
  { name: '瑜伽 / 普拉提', aliases: ['瑜伽', '普拉提', 'yoga', 'pilates'], met: 3.2, hasDistance: false, defaultDuration: 45, defaultDistance: 0 },
];

/**
 * Find the MET value for any given cardio / exercise name
 */
export function getCardioMET(name: string): number {
  if (!name) return 6.0;
  const clean = name.toLowerCase().replace(/[\s\-_（）()【】\[\]+、,/|]/g, '').trim();
  for (const item of CARDIO_MET_TABLE) {
    const itemClean = item.name.toLowerCase().replace(/[\s\-_（）()【】\[\]+、,/|]/g, '').trim();
    if (clean === itemClean || itemClean.includes(clean) || clean.includes(itemClean)) {
      return item.met;
    }
    if (item.aliases.some((a) => clean.includes(a.toLowerCase().replace(/[\s\-_（）()【】\[\]+、,/|]/g, '')))) {
      return item.met;
    }
  }

  // Keyword-based general fallback
  if (clean.includes('跑') || clean.includes('run')) return 8.5;
  if (clean.includes('骑') || clean.includes('bike') || clean.includes('cycl')) return 7.0;
  if (clean.includes('羽毛') || clean.includes('badminton')) return 6.5;
  if (clean.includes('篮球') || clean.includes('basket')) return 7.0;
  if (clean.includes('足球') || clean.includes('soccer')) return 7.5;
  if (clean.includes('网球') || clean.includes('tennis')) return 7.0;
  if (clean.includes('乒乓') || clean.includes('ping')) return 4.0;
  if (clean.includes('泳') || clean.includes('swim')) return 7.0;
  if (clean.includes('跳绳') || clean.includes('rope')) return 9.0;
  if (clean.includes('hiit') || clean.includes('间歇') || clean.includes('tabata')) return 8.5;
  if (clean.includes('拳') || clean.includes('搏击') || clean.includes('box')) return 7.5;
  if (clean.includes('走') || clean.includes('walk')) return 3.8;
  if (clean.includes('瑜伽') || clean.includes('yoga') || clean.includes('普拉提')) return 3.2;
  if (clean.includes('爬楼') || clean.includes('stair')) return 8.0;

  return 6.0;
}

/**
 * Estimate calories burned given exercise name, duration in minutes, and user bodyweight in kg.
 * Defaults to 65kg reference bodyweight.
 */
export function estimateCardioCalories(
  exerciseName: string,
  durationMinutes: number,
  bodyweightKg = 65
): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  const met = getCardioMET(exerciseName);
  const bw = bodyweightKg > 0 ? bodyweightKg : 65;
  const calories = Math.round(met * bw * (durationMinutes / 60));
  return Math.max(1, calories);
}

/**
 * Check whether distance is optional/irrelevant for a cardio activity (e.g. badminton, basketball, jump rope)
 */
export function isCardioDistanceOptional(exerciseName: string): boolean {
  if (!exerciseName) return true;
  const clean = exerciseName.toLowerCase().replace(/[\s\-_（）()【】\[\]+、,/|]/g, '').trim();
  for (const item of CARDIO_MET_TABLE) {
    const itemClean = item.name.toLowerCase().replace(/[\s\-_（）()【】\[\]+、,/|]/g, '').trim();
    if (clean === itemClean || itemClean.includes(clean) || clean.includes(itemClean)) {
      return !item.hasDistance;
    }
  }
  if (
    clean.includes('羽毛球') ||
    clean.includes('篮球') ||
    clean.includes('足球') ||
    clean.includes('乒乓') ||
    clean.includes('网球') ||
    clean.includes('跳绳') ||
    clean.includes('拳击') ||
    clean.includes('搏击') ||
    clean.includes('hiit') ||
    clean.includes('爬楼') ||
    clean.includes('瑜伽') ||
    clean.includes('操') ||
    clean.includes('普拉提')
  ) {
    return true;
  }
  return false;
}

export const CATEGORY_META: Record<WorkoutCategory, { en: string; zh: string; iconLabel: string; color: string; hex: string }> = {
  [WorkoutCategory.Chest]: { en: 'Chest', zh: '胸部', iconLabel: '胸', color: 'bg-red-500', hex: '#ef4444' },
  [WorkoutCategory.Back]: { en: 'Back', zh: '背部', iconLabel: '背', color: 'bg-blue-500', hex: '#3b82f6' },
  [WorkoutCategory.Legs]: { en: 'Legs', zh: '腿部', iconLabel: '腿', color: 'bg-emerald-500', hex: '#10b981' },
  [WorkoutCategory.Shoulders]: { en: 'Shoulders', zh: '肩部', iconLabel: '肩', color: 'bg-purple-500', hex: '#a855f7' },
  [WorkoutCategory.Cardio]: { en: 'Cardio', zh: '有氧/球类', iconLabel: '氧', color: 'bg-orange-500', hex: '#f97316' },
  [WorkoutCategory.Others]: { en: 'Others', zh: '其它/手臂', iconLabel: '它', color: 'bg-slate-700', hex: '#334155' },
};

export const PRESET_EXERCISES_BY_CATEGORY: Record<WorkoutCategory, PresetExercise[]> = {
  [WorkoutCategory.Chest]: [
    { name: '杠铃平板卧推', type: 'strength', defaultWeight: 60, defaultSets: 4, defaultReps: 10 },
    { name: '哑铃上斜卧推', type: 'strength', defaultWeight: 20, defaultSets: 4, defaultReps: 10 },
    { name: '杠铃上斜卧推', type: 'strength', defaultWeight: 50, defaultSets: 4, defaultReps: 10 },
    { name: '哑铃平板卧推', type: 'strength', defaultWeight: 22, defaultSets: 4, defaultReps: 10 },
    { name: '蝴蝶机夹胸', type: 'strength', defaultWeight: 45, defaultSets: 4, defaultReps: 12 },
    { name: '绳索夹胸', type: 'strength', defaultWeight: 15, defaultSets: 4, defaultReps: 12 },
    { name: '双杠臂屈伸', type: 'strength', defaultWeight: 0, defaultSets: 4, defaultReps: 10 },
    { name: '俯卧撑', type: 'strength', defaultWeight: 0, defaultSets: 4, defaultReps: 15 },
    { name: '史密斯上斜推胸', type: 'strength', defaultWeight: 50, defaultSets: 4, defaultReps: 10 },
  ],
  [WorkoutCategory.Back]: [
    { name: '高位下拉', type: 'strength', defaultWeight: 50, defaultSets: 4, defaultReps: 10 },
    { name: '杠铃划船', type: 'strength', defaultWeight: 50, defaultSets: 4, defaultReps: 10 },
    { name: '坐姿绳索划船', type: 'strength', defaultWeight: 45, defaultSets: 4, defaultReps: 12 },
    { name: '哑铃单臂划船', type: 'strength', defaultWeight: 20, defaultSets: 4, defaultReps: 10 },
    { name: '传统硬拉', type: 'strength', defaultWeight: 80, defaultSets: 4, defaultReps: 6 },
    { name: '引体向上', type: 'strength', defaultWeight: 0, defaultSets: 4, defaultReps: 8 },
    { name: '直臂下压', type: 'strength', defaultWeight: 25, defaultSets: 4, defaultReps: 12 },
    { name: '山羊挺身', type: 'strength', defaultWeight: 0, defaultSets: 3, defaultReps: 15 },
  ],
  [WorkoutCategory.Legs]: [
    { name: '杠铃深蹲', type: 'strength', defaultWeight: 70, defaultSets: 4, defaultReps: 8 },
    { name: '倒蹬机腿举', type: 'strength', defaultWeight: 120, defaultSets: 4, defaultReps: 10 },
    { name: '罗马尼亚硬拉', type: 'strength', defaultWeight: 60, defaultSets: 4, defaultReps: 10 },
    { name: '坐姿腿屈伸', type: 'strength', defaultWeight: 40, defaultSets: 4, defaultReps: 12 },
    { name: '俯卧腿弯举', type: 'strength', defaultWeight: 35, defaultSets: 4, defaultReps: 12 },
    { name: '哑铃箭步蹲', type: 'strength', defaultWeight: 15, defaultSets: 4, defaultReps: 10 },
    { name: '站姿提踵', type: 'strength', defaultWeight: 50, defaultSets: 4, defaultReps: 15 },
    { name: '杠铃臀推', type: 'strength', defaultWeight: 60, defaultSets: 4, defaultReps: 10 },
  ],
  [WorkoutCategory.Shoulders]: [
    { name: '坐姿哑铃推举', type: 'strength', defaultWeight: 18, defaultSets: 4, defaultReps: 10 },
    { name: '杠铃过顶推举', type: 'strength', defaultWeight: 40, defaultSets: 4, defaultReps: 8 },
    { name: '哑铃侧平举', type: 'strength', defaultWeight: 8, defaultSets: 4, defaultReps: 15 },
    { name: '俯身哑铃飞鸟', type: 'strength', defaultWeight: 8, defaultSets: 4, defaultReps: 12 },
    { name: '蝴蝶机反向飞鸟', type: 'strength', defaultWeight: 10, defaultSets: 4, defaultReps: 12 },
    { name: '绳索面拉', type: 'strength', defaultWeight: 20, defaultSets: 4, defaultReps: 15 },
    { name: '绳索侧平举', type: 'strength', defaultWeight: 5, defaultSets: 4, defaultReps: 15 },
    { name: '哑铃前平举', type: 'strength', defaultWeight: 8, defaultSets: 4, defaultReps: 12 },
    { name: '杠铃耸肩', type: 'strength', defaultWeight: 60, defaultSets: 4, defaultReps: 12 },
  ],
  [WorkoutCategory.Cardio]: [
    { name: '羽毛球', type: 'cardio', defaultDuration: 45, defaultDistance: 0, defaultCalories: 317, met: 6.5, hasDistance: false },
    { name: '跑步机跑步', type: 'cardio', defaultDuration: 30, defaultDistance: 4, defaultCalories: 276, met: 8.5, hasDistance: true },
    { name: '户外跑步', type: 'cardio', defaultDuration: 30, defaultDistance: 5, defaultCalories: 293, met: 9.0, hasDistance: true },
    { name: '动感单车', type: 'cardio', defaultDuration: 40, defaultDistance: 12, defaultCalories: 325, met: 7.5, hasDistance: true },
    { name: '户外骑行', type: 'cardio', defaultDuration: 45, defaultDistance: 12, defaultCalories: 332, met: 6.8, hasDistance: true },
    { name: '游泳', type: 'cardio', defaultDuration: 40, defaultDistance: 0, defaultCalories: 303, met: 7.0, hasDistance: false },
    { name: '篮球', type: 'cardio', defaultDuration: 45, defaultDistance: 0, defaultCalories: 341, met: 7.0, hasDistance: false },
    { name: '跳绳', type: 'cardio', defaultDuration: 20, defaultDistance: 0, defaultCalories: 195, met: 9.0, hasDistance: false },
    { name: 'HIIT间歇训练', type: 'cardio', defaultDuration: 20, defaultDistance: 0, defaultCalories: 184, met: 8.5, hasDistance: false },
    { name: '足球', type: 'cardio', defaultDuration: 60, defaultDistance: 0, defaultCalories: 488, met: 7.5, hasDistance: false },
    { name: '网球', type: 'cardio', defaultDuration: 60, defaultDistance: 0, defaultCalories: 455, met: 7.0, hasDistance: false },
    { name: '乒乓球', type: 'cardio', defaultDuration: 45, defaultDistance: 0, defaultCalories: 195, met: 4.0, hasDistance: false },
    { name: '爬楼机', type: 'cardio', defaultDuration: 20, defaultDistance: 0, defaultCalories: 173, met: 8.0, hasDistance: false },
    { name: '拳击 / 搏击操', type: 'cardio', defaultDuration: 40, defaultDistance: 0, defaultCalories: 325, met: 7.5, hasDistance: false },
    { name: '椭圆机', type: 'cardio', defaultDuration: 30, defaultDistance: 3, defaultCalories: 179, met: 5.5, hasDistance: true },
    { name: '划船机', type: 'cardio', defaultDuration: 20, defaultDistance: 3, defaultCalories: 152, met: 7.0, hasDistance: true },
    { name: '健走 / 散步', type: 'cardio', defaultDuration: 40, defaultDistance: 3, defaultCalories: 165, met: 3.8, hasDistance: true },
    { name: '瑜伽 / 普拉提', type: 'cardio', defaultDuration: 45, defaultDistance: 0, defaultCalories: 156, met: 3.2, hasDistance: false },
  ],
  [WorkoutCategory.Others]: [
    { name: '杠铃弯举 (二头)', type: 'strength', defaultWeight: 25, defaultSets: 4, defaultReps: 10 },
    { name: '哑铃交替弯举 (二头)', type: 'strength', defaultWeight: 12, defaultSets: 4, defaultReps: 12 },
    { name: '绳索下压 (三头)', type: 'strength', defaultWeight: 25, defaultSets: 4, defaultReps: 12 },
    { name: '仰卧臂屈伸 (三头)', type: 'strength', defaultWeight: 20, defaultSets: 4, defaultReps: 10 },
    { name: '卷腹 (腹肌)', type: 'strength', defaultWeight: 0, defaultSets: 4, defaultReps: 20 },
    { name: '平板支撑', type: 'strength', defaultWeight: 0, defaultSets: 3, defaultReps: 60 },
    { name: '健腹轮', type: 'strength', defaultWeight: 0, defaultSets: 4, defaultReps: 12 },
    { name: '悬垂举腿', type: 'strength', defaultWeight: 0, defaultSets: 4, defaultReps: 12 },
  ],
};

export function parseCategories(categoryStr?: string): WorkoutCategory[] {
  if (!categoryStr) return [WorkoutCategory.Others];
  const validCategories = Object.values(WorkoutCategory);

  const parts = categoryStr
    .split(/[,，+、/| ]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const matched = parts.filter((p) =>
    validCategories.includes(p as WorkoutCategory)
  ) as WorkoutCategory[];
  if (matched.length > 0) return matched;

  const substringMatches = validCategories.filter((cat) => categoryStr.includes(cat));
  return substringMatches.length > 0 ? substringMatches : [WorkoutCategory.Others];
}

export function formatCategoriesZh(categories: WorkoutCategory[]): string {
  if (!categories || categories.length === 0) return '其它';
  return categories.map((c) => CATEGORY_META[c]?.zh || c).join(' + ');
}

export function formatCategoriesEn(categories: WorkoutCategory[]): string {
  if (!categories || categories.length === 0) return 'Others';
  return categories.map((c) => CATEGORY_META[c]?.en || c).join(', ');
}

export function getCategoryBadgeColor(cat: WorkoutCategory | string): string {
  switch (cat) {
    case WorkoutCategory.Chest:
      return 'bg-red-500 text-white';
    case WorkoutCategory.Back:
      return 'bg-blue-500 text-white';
    case WorkoutCategory.Legs:
      return 'bg-emerald-500 text-white';
    case WorkoutCategory.Shoulders:
      return 'bg-purple-500 text-white';
    case WorkoutCategory.Cardio:
      return 'bg-orange-500 text-white';
    default:
      return 'bg-slate-700 text-white';
  }
}

/**
 * Infer all trained muscle groups/categories from explicitly saved categories
 * combined with the specific exercises (including compound movements like Deadlift hitting Back + Legs).
 */
export function inferLogCategories(
  categoryStr?: string,
  categoriesArray?: WorkoutCategory[],
  exercises?: Array<{ name: string; type?: string }>
): WorkoutCategory[] {
  const result = new Set<WorkoutCategory>();

  // 1. Add explicitly passed categories
  if (Array.isArray(categoriesArray) && categoriesArray.length > 0) {
    categoriesArray.forEach((c) => {
      if (Object.values(WorkoutCategory).includes(c)) result.add(c);
    });
  } else if (categoryStr) {
    parseCategories(categoryStr).forEach((c) => result.add(c));
  }

  // 2. Scan exercises to detect all stimulated categories & compound stimulation
  if (Array.isArray(exercises) && exercises.length > 0) {
    exercises.forEach((ex) => {
      if (!ex || !ex.name) return;
      const clean = ex.name.toLowerCase().replace(/[\s\-_（）()【】\[\]+、,/|]/g, '').trim();
      if (!clean) return;

      // Compound movements
      if (clean.includes('硬拉') || clean.includes('deadlift')) {
        result.add(WorkoutCategory.Back);
        result.add(WorkoutCategory.Legs);
      }
      if (clean.includes('双杠') || clean.includes('dips')) {
        result.add(WorkoutCategory.Chest);
        result.add(WorkoutCategory.Others);
      }
      if (clean.includes('上斜') || clean.includes('incline')) {
        result.add(WorkoutCategory.Chest);
        result.add(WorkoutCategory.Shoulders);
      }

      // Single/primary groups
      if (
        clean.includes('蹲') ||
        clean.includes('腿') ||
        clean.includes('臀') ||
        clean.includes('提踵') ||
        clean.includes('倒蹬') ||
        clean.includes('箭步') ||
        clean.includes('squat') ||
        clean.includes('lunge') ||
        clean.includes('leg')
      ) {
        result.add(WorkoutCategory.Legs);
      }

      if (
        clean.includes('胸') ||
        clean.includes('卧推') ||
        clean.includes('夹胸') ||
        clean.includes('pushup') ||
        clean.includes('bench') ||
        clean.includes('chest')
      ) {
        result.add(WorkoutCategory.Chest);
      }

      if (
        clean.includes('背') ||
        clean.includes('划船') ||
        clean.includes('下拉') ||
        clean.includes('引体') ||
        clean.includes('挺身') ||
        clean.includes('pull') ||
        clean.includes('row') ||
        clean.includes('lat')
      ) {
        result.add(WorkoutCategory.Back);
      }

      if (
        clean.includes('肩') ||
        clean.includes('推举') ||
        clean.includes('侧平举') ||
        clean.includes('前平举') ||
        clean.includes('面拉') ||
        clean.includes('飞鸟') ||
        clean.includes('耸肩') ||
        clean.includes('shoulder') ||
        clean.includes('press') ||
        clean.includes('delt')
      ) {
        result.add(WorkoutCategory.Shoulders);
      }

      if (
        clean.includes('弯举') ||
        clean.includes('臂屈伸') ||
        clean.includes('二头') ||
        clean.includes('三头') ||
        clean.includes('手臂') ||
        clean.includes('腹') ||
        clean.includes('核心') ||
        clean.includes('支撑') ||
        clean.includes('arm') ||
        clean.includes('abs') ||
        clean.includes('curl')
      ) {
        result.add(WorkoutCategory.Others);
      }

      if (
        ex.type === 'cardio' ||
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
        result.add(WorkoutCategory.Cardio);
      }
    });
  }

  const list = Array.from(result);
  return list.length > 0 ? list : [WorkoutCategory.Others];
}
