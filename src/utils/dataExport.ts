import { WorkoutCategory, WorkoutLog } from '../types';
import { resolveExerciseMuscles, findExerciseStandard } from './workoutAnalytics';
import { parseCategories, estimateCardioCalories, CATEGORY_META } from '../constants/workoutPresets';

export interface UserProfileExport {
  displayName: string;
  email: string;
  heightCm: number | null;
  bodyweightKg: number | null;
  sex: 'male' | 'female' | null;
  sexZh: string;
  bmi: number | null;
  bmiCategoryZh: string;
  totalWorkouts: number;
  streak: number;
  exportDate: string;
}

export interface DimensionSummaryExport {
  category: WorkoutCategory;
  nameZh: string;
  nameEn: string;
  maxWeightKg: number;
  bestExerciseName: string;
  prs: Record<string, number>;
  totalVolumeKg: number;
  totalSets: number;
  workoutCount: number;
  // Cardio specific
  cardioCaloriesKcal?: number;
  cardioMinutes?: number;
  cardioDistanceKm?: number;
}

export interface WorkoutLogBriefExport {
  id: string;
  date: string;
  time: string;
  categories: string;
  totalVolumeKg: number;
  totalSets: number;
  exercises: string[];
  note: string;
  visibility: string;
}

export interface FitGroupExportData {
  app: string;
  version: string;
  exportedAt: string;
  profile: UserProfileExport;
  dimensionSummaries: Record<WorkoutCategory, DimensionSummaryExport>;
  workoutLogs: WorkoutLogBriefExport[];
}

function getBmiCategoryZh(bmi: number): string {
  if (bmi < 18.5) return '偏轻';
  if (bmi < 24.0) return '标准';
  if (bmi < 28.0) return '偏重';
  return '过重';
}

export function resolveExercisePrimaryCategory(
  exerciseName: string,
  isCardio: boolean,
  fallbackCategory: WorkoutCategory = WorkoutCategory.Others
): WorkoutCategory {
  if (isCardio) return WorkoutCategory.Cardio;

  const std = findExerciseStandard(exerciseName);
  if (std?.primaryCategory) return std.primaryCategory;

  const muscles = resolveExerciseMuscles(exerciseName);
  const entries = Object.entries(muscles) as [WorkoutCategory, number][];
  if (entries.length > 0) {
    entries.sort((a, b) => b[1] - a[1]);
    if (entries[0][1] > 0) return entries[0][0];
  }

  return fallbackCategory;
}

export function generateExportData(user: any, logs: WorkoutLog[]): FitGroupExportData {
  const heightCm = typeof user?.heightCm === 'number' && !isNaN(user.heightCm) ? user.heightCm : null;
  const bodyweightKg = typeof user?.bodyweightKg === 'number' && !isNaN(user.bodyweightKg) ? user.bodyweightKg : null;
  const sex = user?.sex === 'male' || user?.sex === 'female' ? user.sex : null;
  const sexZh = sex === 'male' ? '男 (Male)' : sex === 'female' ? '女 (Female)' : '未设置';

  let bmi: number | null = null;
  let bmiCategoryZh = '未设置';
  if (heightCm && bodyweightKg && heightCm > 0) {
    bmi = Number((bodyweightKg / Math.pow(heightCm / 100, 2)).toFixed(1));
    bmiCategoryZh = getBmiCategoryZh(bmi);
  }

  const profile: UserProfileExport = {
    displayName: user?.displayName || 'FitGroup User',
    email: user?.email || '',
    heightCm,
    bodyweightKg,
    sex,
    sexZh,
    bmi,
    bmiCategoryZh,
    totalWorkouts: typeof user?.totalWorkouts === 'number' ? user.totalWorkouts : logs.length,
    streak: typeof user?.streak === 'number' ? user.streak : 0,
    exportDate: new Date().toISOString(),
  };

  const categories = [
    WorkoutCategory.Chest,
    WorkoutCategory.Back,
    WorkoutCategory.Legs,
    WorkoutCategory.Shoulders,
    WorkoutCategory.Others,
    WorkoutCategory.Cardio,
  ];

  const dimensionSummaries: Record<WorkoutCategory, DimensionSummaryExport> = {} as any;
  categories.forEach((cat) => {
    const meta = CATEGORY_META[cat] || { zh: cat, en: cat };
    dimensionSummaries[cat] = {
      category: cat,
      nameZh: meta.zh,
      nameEn: meta.en,
      maxWeightKg: 0,
      bestExerciseName: '',
      prs: {},
      totalVolumeKg: 0,
      totalSets: 0,
      workoutCount: 0,
      ...(cat === WorkoutCategory.Cardio
        ? { cardioCaloriesKcal: 0, cardioMinutes: 0, cardioDistanceKm: 0 }
        : {}),
    };
  });

  // Merge pre-existing PRs from user profile if available
  if (user?.prs && typeof user.prs === 'object') {
    Object.entries(user.prs).forEach(([name, rawWeight]) => {
      const weight = Number(rawWeight);
      if (isNaN(weight) || weight <= 0) return;
      const cat = resolveExercisePrimaryCategory(name, false);
      const dim = dimensionSummaries[cat] || dimensionSummaries[WorkoutCategory.Others];
      dim.prs[name] = weight;
      if (weight > dim.maxWeightKg) {
        dim.maxWeightKg = weight;
        dim.bestExerciseName = name;
      }
    });
  }

  // Sort logs in reverse chronological order (newest first)
  const sortedLogs = [...logs].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  const workoutLogsBrief: WorkoutLogBriefExport[] = [];

  sortedLogs.forEach((log) => {
    const logCategories = parseCategories(typeof log.category === 'string' ? log.category : '');
    const fallbackCategory = logCategories[0] || WorkoutCategory.Others;

    // Track distinct categories involved in this workout
    const touchedCategories = new Set<WorkoutCategory>();
    logCategories.forEach((c) => touchedCategories.add(c));

    let workoutVolume = 0;
    let workoutSets = 0;
    const exerciseSummaries: string[] = [];

    (log.exercises || []).forEach((ex) => {
      const cleanName = (ex.name || '').trim();
      if (!cleanName) return;

      const isCardio = ex.type === 'cardio';
      const cat = resolveExercisePrimaryCategory(cleanName, isCardio, fallbackCategory);
      touchedCategories.add(cat);
      const dim = dimensionSummaries[cat] || dimensionSummaries[WorkoutCategory.Others];

      if (isCardio) {
        const dur = Number(ex.duration) || 0;
        const dist = Number(ex.distance) || 0;
        const cal =
          Number(ex.calories) ||
          estimateCardioCalories(cleanName, dur, bodyweightKg || 70);

        dim.cardioMinutes = (dim.cardioMinutes || 0) + dur;
        dim.cardioDistanceKm = Number(((dim.cardioDistanceKm || 0) + dist).toFixed(1));
        dim.cardioCaloriesKcal = (dim.cardioCaloriesKcal || 0) + Math.round(cal);

        const distText = dist > 0 ? `, ${dist}km` : '';
        const calText = cal > 0 ? `, ~${Math.round(cal)}kcal` : '';
        exerciseSummaries.push(`${cleanName}: ${dur}分钟${distText}${calText}`);
      } else {
        const sets = Number(ex.sets) || 0;
        const reps = Number(ex.reps) || 0;
        const weight = Number(ex.weight) || 0;
        const vol = sets * reps * Math.max(0, weight);

        workoutVolume += vol;
        workoutSets += sets;
        dim.totalVolumeKg += vol;
        dim.totalSets += sets;

        // Record PR
        if (weight > 0) {
          if (!dim.prs[cleanName] || weight > dim.prs[cleanName]) {
            dim.prs[cleanName] = weight;
          }
          if (weight > dim.maxWeightKg) {
            dim.maxWeightKg = weight;
            dim.bestExerciseName = cleanName;
          }
        }

        const volText = vol > 0 ? ` (容量: ${vol}kg)` : '';
        exerciseSummaries.push(
          `${cleanName}: ${sets}组 × ${weight}kg × ${reps}次${volText}`
        );
      }
    });

    touchedCategories.forEach((c) => {
      if (dimensionSummaries[c]) {
        dimensionSummaries[c].workoutCount += 1;
      }
    });

    const ts = log.timestamp || '';
    const date = ts.split('T')[0] || '';
    const time = ts.includes('T') ? ts.split('T')[1].slice(0, 5) : '';

    const categoriesText = logCategories.map((c) => CATEGORY_META[c]?.zh || c).join(', ') || '综合';

    workoutLogsBrief.push({
      id: log.id,
      date,
      time,
      categories: categoriesText,
      totalVolumeKg: workoutVolume,
      totalSets: workoutSets,
      exercises: exerciseSummaries,
      note: log.note || '',
      visibility: log.visibility || 'public',
    });
  });

  return {
    app: 'FitGroup',
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    profile,
    dimensionSummaries,
    workoutLogs: workoutLogsBrief,
  };
}

export function formatExportAsJson(data: FitGroupExportData): string {
  return JSON.stringify(data, null, 2);
}

export function formatExportAsText(data: FitGroupExportData): string {
  const { profile, dimensionSummaries, workoutLogs } = data;
  const lines: string[] = [];

  lines.push('==================================================');
  lines.push('FITGROUP 健身数据导出报告');
  lines.push(`导出时间: ${new Date(data.exportedAt).toLocaleString()}`);
  lines.push(`用户: ${profile.displayName} ${profile.email ? `(${profile.email})` : ''}`);
  lines.push('==================================================\n');

  lines.push('【一、个人身体与档案】');
  lines.push(`• 生理性别: ${profile.sexZh}`);
  lines.push(`• 身高: ${profile.heightCm ? `${profile.heightCm} cm` : '未设置'}`);
  lines.push(`• 体重: ${profile.bodyweightKg ? `${profile.bodyweightKg} kg` : '未设置'}`);
  if (profile.bmi !== null) {
    lines.push(`• 身体质量指数 (BMI): ${profile.bmi} (${profile.bmiCategoryZh})`);
  }
  lines.push(`• 累计打卡: ${profile.totalWorkouts} 次`);
  lines.push(`• 连续打卡: ${profile.streak} 天\n`);

  lines.push('【二、各维度最大重量与容量统计】');
  Object.values(dimensionSummaries).forEach((dim, idx) => {
    lines.push(`\n${idx + 1}. ${dim.nameZh} (${dim.nameEn}):`);
    if (dim.category === WorkoutCategory.Cardio) {
      lines.push(`   - 累计打卡次数: ${dim.workoutCount} 次`);
      lines.push(`   - 累计有氧时长: ${dim.cardioMinutes || 0} 分钟`);
      lines.push(`   - 累计消耗能量: ~${(dim.cardioCaloriesKcal || 0).toLocaleString()} kcal`);
      if ((dim.cardioDistanceKm || 0) > 0) {
        lines.push(`   - 累计运动距离: ${dim.cardioDistanceKm} km`);
      }
    } else {
      lines.push(`   - 最大单项重量: ${dim.maxWeightKg > 0 ? `${dim.maxWeightKg} kg (${dim.bestExerciseName})` : '暂无数据'}`);
      lines.push(`   - 历史累计容量: ${dim.totalVolumeKg.toLocaleString()} kg`);
      lines.push(`   - 历史累计组数: ${dim.totalSets} 组`);
      lines.push(`   - 训练打卡次数: ${dim.workoutCount} 次`);

      const prEntries = Object.entries(dim.prs);
      if (prEntries.length > 0) {
        lines.push('   - 各动作最好成绩 (PR):');
        prEntries.sort((a, b) => b[1] - a[1]).forEach(([name, w]) => {
          lines.push(`     • ${name}: ${w} kg`);
        });
      }
    }
  });

  lines.push('\n\n【三、历史训练打卡记录明细】');
  lines.push(`总计记录: ${workoutLogs.length} 次`);
  lines.push('--------------------------------------------------');

  if (workoutLogs.length === 0) {
    lines.push('暂无训练打卡记录');
  } else {
    workoutLogs.forEach((log, idx) => {
      const volText = log.totalVolumeKg > 0 ? ` | 总容量: ${log.totalVolumeKg.toLocaleString()} kg (${log.totalSets}组)` : '';
      lines.push(`\n[${idx + 1}] ${log.date} ${log.time} | 部位: ${log.categories}${volText}`);
      if (log.exercises.length > 0) {
        log.exercises.forEach((ex) => {
          lines.push(`    • ${ex}`);
        });
      }
      if (log.note) {
        lines.push(`    💬 备注: ${log.note}`);
      }
    });
  }

  lines.push('\n==================================================');
  lines.push('报告生成自 FitGroup Neo-Brutalism Workout Tracker');
  lines.push('==================================================');

  return lines.join('\n');
}
