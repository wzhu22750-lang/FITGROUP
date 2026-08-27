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
}

export const CATEGORY_META: Record<WorkoutCategory, { en: string; zh: string; iconLabel: string; color: string; hex: string }> = {
  [WorkoutCategory.Chest]: { en: 'Chest', zh: '胸部', iconLabel: '胸', color: 'bg-red-500', hex: '#ef4444' },
  [WorkoutCategory.Back]: { en: 'Back', zh: '背部', iconLabel: '背', color: 'bg-blue-500', hex: '#3b82f6' },
  [WorkoutCategory.Legs]: { en: 'Legs', zh: '腿部', iconLabel: '腿', color: 'bg-emerald-500', hex: '#10b981' },
  [WorkoutCategory.Shoulders]: { en: 'Shoulders', zh: '肩部', iconLabel: '肩', color: 'bg-purple-500', hex: '#a855f7' },
  [WorkoutCategory.Cardio]: { en: 'Cardio', zh: '有氧', iconLabel: '氧', color: 'bg-orange-500', hex: '#f97316' },
  [WorkoutCategory.Others]: { en: 'Others', zh: '其它/手臂', iconLabel: '它', color: 'bg-slate-700', hex: '#334155' },
};

export const PRESET_EXERCISES_BY_CATEGORY: Record<WorkoutCategory, PresetExercise[]> = {
  [WorkoutCategory.Chest]: [
    { name: '杠铃平板卧推', type: 'strength', defaultWeight: 60, defaultSets: 4, defaultReps: 10 },
    { name: '哑铃上斜卧推', type: 'strength', defaultWeight: 20, defaultSets: 4, defaultReps: 10 },
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
    { name: '绳索面拉', type: 'strength', defaultWeight: 20, defaultSets: 4, defaultReps: 15 },
    { name: '绳索侧平举', type: 'strength', defaultWeight: 5, defaultSets: 4, defaultReps: 15 },
    { name: '哑铃前平举', type: 'strength', defaultWeight: 8, defaultSets: 4, defaultReps: 12 },
    { name: '杠铃耸肩', type: 'strength', defaultWeight: 60, defaultSets: 4, defaultReps: 12 },
  ],
  [WorkoutCategory.Cardio]: [
    { name: '跑步机跑步', type: 'cardio', defaultDuration: 30, defaultDistance: 4, defaultCalories: 250 },
    { name: '户外跑步', type: 'cardio', defaultDuration: 30, defaultDistance: 5, defaultCalories: 300 },
    { name: '动感单车', type: 'cardio', defaultDuration: 40, defaultDistance: 12, defaultCalories: 350 },
    { name: '椭圆机', type: 'cardio', defaultDuration: 30, defaultDistance: 3, defaultCalories: 200 },
    { name: '划船机', type: 'cardio', defaultDuration: 20, defaultDistance: 3, defaultCalories: 180 },
    { name: '跳绳', type: 'cardio', defaultDuration: 20, defaultDistance: 0, defaultCalories: 200 },
    { name: '爬楼机', type: 'cardio', defaultDuration: 20, defaultDistance: 0, defaultCalories: 220 },
    { name: 'HIIT间歇训练', type: 'cardio', defaultDuration: 20, defaultDistance: 0, defaultCalories: 200 },
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
