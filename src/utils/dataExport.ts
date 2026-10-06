import { WorkoutCategory, WorkoutLog } from '../types';
import { resolveExerciseMuscles, findExerciseStandard, resolveEffectiveExerciseWeight, isPullUpExercise } from './workoutAnalytics';
import { parseCategories, estimateCardioCalories, CATEGORY_META, CARDIO_REFERENCE_BODYWEIGHT_KG } from '../constants/workoutPresets';
import { APP_NAME, APP_VERSION, EXPORT_SCHEMA_VERSION } from '../constants/appVersion';

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

export interface ExportMetadata {
  app: string;
  appVersion: string;
  exportSchemaVersion: number;
  exportedAt: string;
}

/** A single workout log preserved in the backup, with derived display helpers. */
export interface WorkoutLogExport {
  id: string;
  userId: string;
  userName: string;
  /** Original ISO timestamp (UTC), kept verbatim for loss-free backup. */
  timestamp: string;
  /** Local (device timezone) calendar day, e.g. 2026-08-28. */
  localDate: string;
  /** Local (device timezone) wall-clock time, e.g. 18:30. */
  localTime: string;
  category: string;
  /** All trained categories resolved from `categories` (preferred) or `category`. */
  categories: WorkoutCategory[];
  /** Raw exercises, kept verbatim so the backup can be restored. */
  exercises: WorkoutLog['exercises'];
  note: string;
  visibility: string;
  // Derived, human readable convenience values (not authoritative).
  totalVolumeKg: number;
  totalSets: number;
  exerciseSummaries: string[];
}

export interface ExportSummaries {
  dimensionSummaries: Record<WorkoutCategory, DimensionSummaryExport>;
  totals: {
    workoutLogs: number;
    totalVolumeKg: number;
    totalSets: number;
  };
}

export interface FitGroupExportData {
  metadata: ExportMetadata;
  profile: UserProfileExport;
  workoutLogs: WorkoutLogExport[];
  summaries: ExportSummaries;
}

export type ExportContentKind = 'json' | 'text';

function getBmiCategoryZh(bmi: number): string {
  if (bmi < 18.5) return '偏轻';
  if (bmi < 24.0) return '标准';
  if (bmi < 28.0) return '偏重';
  return '过重';
}

const VALID_CATEGORIES = Object.values(WorkoutCategory);

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

/**
 * Resolve every trained category for a log.
 *
 * Newer records store an explicit `categories` array (multi-category workouts
 * such as Chest + Shoulders). Older records only have the `category` string.
 * The explicit array always wins when it is valid and non-empty; otherwise we
 * fall back to parsing the legacy string.
 */
export function resolveLogCategories(
  log: Pick<WorkoutLog, 'category'> & { categories?: WorkoutCategory[] | null },
): WorkoutCategory[] {
  if (Array.isArray(log.categories)) {
    const valid = log.categories.filter((c): c is WorkoutCategory =>
      VALID_CATEGORIES.includes(c as WorkoutCategory),
    );
    if (valid.length > 0) {
      return Array.from(new Set(valid));
    }
  }

  return parseCategories(typeof log.category === 'string' ? log.category : '');
}

/** Format an ISO timestamp as a local calendar day. Invalid input degrades safely. */
export function formatLocalDate(timestamp: string | undefined | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format an ISO timestamp as a local wall-clock time (HH:mm). Returns '' on invalid input. */
export function formatLocalTime(timestamp: string | undefined | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatLocalDateTime(timestamp: string | undefined | null): string {
  const date = formatLocalDate(timestamp);
  const time = formatLocalTime(timestamp);
  if (!date && !time) return '时间未知';
  return `${date} ${time}`.trim();
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

  const safeLogs = Array.isArray(logs) ? logs : [];

  const profile: UserProfileExport = {
    displayName: user?.displayName || 'FitGroup User',
    email: user?.email || '',
    heightCm,
    bodyweightKg,
    sex,
    sexZh,
    bmi,
    bmiCategoryZh,
    totalWorkouts: typeof user?.totalWorkouts === 'number' ? user.totalWorkouts : safeLogs.length,
    streak: typeof user?.streak === 'number' ? user.streak : 0,
    exportDate: new Date().toISOString(),
  };

  const dimensionSummaries: Record<WorkoutCategory, DimensionSummaryExport> = {} as Record<
    WorkoutCategory,
    DimensionSummaryExport
  >;
  VALID_CATEGORIES.forEach((cat) => {
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

  // Merge pre-existing PRs from the user profile if available.
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

  // Sort logs in reverse chronological order (newest first), with a stable
  // secondary key so equal timestamps keep a deterministic order.
  const sortedLogs = [...safeLogs].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    const diff = (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    if (diff !== 0) return diff;
    return String(a.id).localeCompare(String(b.id));
  });

  const workoutLogs: WorkoutLogExport[] = [];

  sortedLogs.forEach((log) => {
    const logCategories = resolveLogCategories(log);
    const fallbackCategory = logCategories[0] || WorkoutCategory.Others;

    // Track distinct categories involved in this workout.
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
          estimateCardioCalories(cleanName, dur, bodyweightKg || CARDIO_REFERENCE_BODYWEIGHT_KG);

        dim.cardioMinutes = (dim.cardioMinutes || 0) + dur;
        dim.cardioDistanceKm = Number(((dim.cardioDistanceKm || 0) + dist).toFixed(1));
        dim.cardioCaloriesKcal = (dim.cardioCaloriesKcal || 0) + Math.round(cal);

        const distText = dist > 0 ? `, ${dist}km` : '';
        const calText = cal > 0 ? `, ~${Math.round(cal)}kcal` : '';
        exerciseSummaries.push(`${cleanName}: ${dur}分钟${distText}${calText}`);
      } else {
        const sets = Number(ex.sets) || 0;
        const reps = Number(ex.reps) || 0;
        const rawWeight = Number(ex.weight) || 0;
        const userBw = bodyweightKg || CARDIO_REFERENCE_BODYWEIGHT_KG;
        const effectiveWeight = resolveEffectiveExerciseWeight(cleanName, rawWeight, userBw);
        const vol = sets * reps * effectiveWeight;

        workoutVolume += vol;
        workoutSets += sets;
        dim.totalVolumeKg += vol;
        dim.totalSets += sets;

        // Record PR.
        if (effectiveWeight > 0) {
          if (!dim.prs[cleanName] || effectiveWeight > dim.prs[cleanName]) {
            dim.prs[cleanName] = effectiveWeight;
          }
          if (effectiveWeight > dim.maxWeightKg) {
            dim.maxWeightKg = effectiveWeight;
            dim.bestExerciseName = cleanName;
          }
        }

        const volText = vol > 0 ? ` (容量: ${vol}kg)` : '';
        const weightText = isPullUpExercise(cleanName) && rawWeight !== 0
          ? `${rawWeight > 0 ? `+${rawWeight}` : rawWeight}kg (总计${effectiveWeight}kg)`
          : `${effectiveWeight}kg`;
        exerciseSummaries.push(
          `${cleanName}: ${sets}组 × ${weightText} × ${reps}次${volText}`
        );
      }
    });

    touchedCategories.forEach((c) => {
      if (dimensionSummaries[c]) {
        dimensionSummaries[c].workoutCount += 1;
      }
    });

    workoutLogs.push({
      id: log.id,
      userId: log.userId || '',
      userName: log.userName || '',
      timestamp: log.timestamp || '',
      localDate: formatLocalDate(log.timestamp),
      localTime: formatLocalTime(log.timestamp),
      category: typeof log.category === 'string' ? log.category : '',
      categories: logCategories,
      exercises: Array.isArray(log.exercises) ? log.exercises : [],
      note: log.note || '',
      visibility: log.visibility || 'public',
      totalVolumeKg: workoutVolume,
      totalSets: workoutSets,
      exerciseSummaries,
    });
  });

  const totals = workoutLogs.reduce(
    (acc, log) => {
      acc.totalVolumeKg += log.totalVolumeKg;
      acc.totalSets += log.totalSets;
      return acc;
    },
    { workoutLogs: workoutLogs.length, totalVolumeKg: 0, totalSets: 0 },
  );

  return {
    metadata: {
      app: APP_NAME,
      appVersion: APP_VERSION,
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
    },
    profile,
    workoutLogs,
    summaries: {
      dimensionSummaries,
      totals,
    },
  };
}

export function formatExportAsJson(data: FitGroupExportData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Validate generated export content before it reaches the native layer.
 * Returns the UTF-8 byte length (always > 0) or throws a descriptive error.
 */
export function validateExportContent(content: unknown, kind: ExportContentKind): number {
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('导出内容为空，已取消保存');
  }

  const bytes = new TextEncoder().encode(content).byteLength;
  if (bytes === 0) {
    throw new Error('导出内容为空，已取消保存');
  }

  if (kind === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('导出的 JSON 内容无效');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('导出的 JSON 内容无效');
    }
  }

  return bytes;
}

function categoryNamesZh(categories: WorkoutCategory[]): string {
  if (!categories || categories.length === 0) return '综合';
  return categories.map((c) => CATEGORY_META[c]?.zh || c).join(' + ');
}

export function formatExportAsText(data: FitGroupExportData): string {
  const { metadata, profile, workoutLogs, summaries } = data;
  const dimensionSummaries = summaries.dimensionSummaries;
  const lines: string[] = [];

  lines.push('==================================================');
  lines.push('FITGROUP 健身数据导出报告');
  lines.push(`应用版本: ${metadata.appVersion} (schema v${metadata.exportSchemaVersion})`);
  lines.push(`导出时间: ${formatLocalDateTime(metadata.exportedAt)}`);
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
      const timeText = log.localDate || log.localTime ? `${log.localDate} ${log.localTime}`.trim() : '时间未知';
      lines.push(`\n[${idx + 1}] ${timeText} | 部位: ${categoryNamesZh(log.categories)}${volText}`);
      if (log.exerciseSummaries.length > 0) {
        log.exerciseSummaries.forEach((ex) => {
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
