import { WorkoutCategory, WorkoutLog, StrengthBodyContext } from '../types';
import {
  CategoryScoreDetail,
  WorkoutInsights,
  resolveTrainingVolume,
  resolveExerciseMuscles,
  calculateCardioExerciseMetrics,
} from './workoutAnalytics';
import {
  EXERCISE_DEFINITIONS,
} from '../constants/exerciseDefinitions';
import {
  resolveLoggedStrengthPerformance,
  resolveBodyContext,
} from './strengthAssessment';
import { CATEGORY_META, isCardioExercise, parseCategories } from '../constants/workoutPresets';
import { localWorkoutDateKey } from './workoutTime';
import { STRENGTH_BENCHMARKS } from '../constants/strengthStandards';

export interface WeeklyTrendBucket {
  weekKey: string;
  weekIndex: number;
  label: string;
  startDate: string;
  endDate: string;
  workoutCount: number;
  activeDays: number;
  totalSets: number;
  effectiveSets: number;
  tonnageKg: number;
  cardioMinutes: number;
  topCategory?: WorkoutCategory;
  categorySets: Record<WorkoutCategory, number>;
}

export interface WeeklyTrendsSummary {
  buckets: WeeklyTrendBucket[];
  weeksCount: 4 | 8 | 12;
  hasEnoughData: boolean;
  totalWorkouts: number;
  totalSets: number;
  avgWorkoutsPerWeek: number;
  avgActiveDaysPerWeek: number;
  avgSetsPerWeek: number;
  avgTonnagePerWeek: number;
  trendDirection: 'increasing' | 'stable' | 'decreasing';
  percentageChange: number;
  summaryText: string;
}

export interface ExerciseProgressComparison {
  canonicalId: string;
  exerciseName: string;
  category: WorkoutCategory;
  unit?: 'kg' | 'reps' | 'sec';
  currentBest?: {
    weight: number;
    reps: number;
    estimated1RM: number;
    date: string;
    logId?: string;
  };
  baselineBest?: {
    weight: number;
    reps: number;
    estimated1RM: number;
    date: string;
    logId?: string;
  };
  allTimeBest?: {
    weight: number;
    reps: number;
    estimated1RM: number;
    date: string;
    logId?: string;
  };
  verdict?: 'clear_progress' | 'possible_progress' | 'stable' | 'regressed' | 'insufficient_evidence';
  currentSampleDays?: number;
  baselineSampleDays?: number;
  sourceLogIds?: string[];
  status: 'progressed' | 'maintained' | 'regressed' | 'new_exercise' | 'untrained_recently';
  changePercentage?: number;
  evidence: string;
}

export interface DeterministicInsight {
  type: 'strength' | 'volume' | 'balance' | 'habit' | 'cardio';
  level: 'highlight' | 'neutral' | 'suggestion';
  observation: string;
  evidence: string;
  interpretation: string;
  action: string;
}

function emptyCategorySets(): Record<WorkoutCategory, number> {
  return {
    [WorkoutCategory.Chest]: 0,
    [WorkoutCategory.Back]: 0,
    [WorkoutCategory.Legs]: 0,
    [WorkoutCategory.Shoulders]: 0,
    [WorkoutCategory.Others]: 0,
    [WorkoutCategory.Cardio]: 0,
  };
}

/**
 * Align local calendar date to Monday 00:00:00
 */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Sunday is 0, Monday is 1, ... Saturday is 6
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format Date as MM/DD
 */
function formatShortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Compute weekly training trends over 4, 8, or 12 calendar weeks.
 */
export function computeWeeklyTrainingTrends(
  logs: WorkoutLog[],
  weeksCount: 4 | 8 | 12 = 4,
  referenceDate = new Date(),
  ctx?: StrengthBodyContext | null
): WeeklyTrendsSummary {
  const bodyweightKg = resolveBodyContext(ctx).ctx.bodyweightKg;
  const currentWeekStart = getStartOfWeek(referenceDate);
  const buckets: WeeklyTrendBucket[] = [];

  // Generate buckets from oldest week (weeksCount - 1) to current week (0)
  for (let i = weeksCount - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - i * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const label = `${formatShortDate(weekStart)}-${formatShortDate(weekEnd)}`;
    const weekKey = localWorkoutDateKey(weekStart);

    buckets.push({
      weekKey,
      weekIndex: weeksCount - 1 - i,
      label,
      startDate: weekStart.toISOString(),
      endDate: weekEnd.toISOString(),
      workoutCount: 0,
      activeDays: 0,
      totalSets: 0,
      effectiveSets: 0,
      tonnageKg: 0,
      cardioMinutes: 0,
      categorySets: emptyCategorySets(),
    });
  }

  // Populate buckets with log data
  const dateKeysPerBucket = buckets.map(() => new Set<string>());
  const bucketByWeek = new Map(buckets.map((bucket, index) => [bucket.weekKey, index]));

  logs.forEach((log) => {
    const logTime = new Date(log.timestamp).getTime();
    if (isNaN(logTime) || logTime > referenceDate.getTime()) return;

    const bIndex = bucketByWeek.get(localWorkoutDateKey(getStartOfWeek(new Date(logTime))));
    if (bIndex === undefined) return;
    const bucket = buckets[bIndex];
    bucket.workoutCount += 1;
    const dateKey = localWorkoutDateKey(log.timestamp);
    if (dateKey) dateKeysPerBucket[bIndex].add(dateKey);

    const exercises = Array.isArray(log.exercises) ? log.exercises : [];
    exercises.forEach((ex) => {
      if (ex.type === 'cardio' || isCardioExercise(ex.name)) {
        const metrics = calculateCardioExerciseMetrics(ex, bodyweightKg);
        bucket.cardioMinutes += metrics.effectiveMinutes;
        if (metrics.validForScoring) bucket.categorySets[WorkoutCategory.Cardio] += 1;
        return;
      }

      const volume = resolveTrainingVolume(ex, bodyweightKg);
      if (!volume) return;
      const { sets, tonnage, definition } = volume;
      bucket.totalSets += sets;
      bucket.effectiveSets += sets;
      bucket.tonnageKg += tonnage;

      const shares = definition ? undefined : resolveExerciseMuscles(ex.name, parseCategories(log.category));
      const primaryCat = definition?.primaryCategory
        ?? (Object.entries(shares ?? {}) as Array<[WorkoutCategory, number]>).sort((a, b) => b[1] - a[1])[0]?.[0]
        ?? WorkoutCategory.Others;
      bucket.categorySets[primaryCat] = (bucket.categorySets[primaryCat] || 0) + sets;
    });
  });

  // Calculate active days & top category for each bucket
  buckets.forEach((bucket, idx) => {
    bucket.activeDays = dateKeysPerBucket[idx].size;
    bucket.tonnageKg = Math.round(bucket.tonnageKg);
    bucket.cardioMinutes = Number(bucket.cardioMinutes.toFixed(2));
    let topCat: WorkoutCategory | undefined;
    let maxSets = 0;
    (Object.entries(bucket.categorySets) as Array<[WorkoutCategory, number]>).forEach(([cat, sets]) => {
      if (sets > maxSets) {
        maxSets = sets;
        topCat = cat;
      }
    });
    bucket.topCategory = topCat;
  });

  const totalWorkouts = buckets.reduce((sum, b) => sum + b.workoutCount, 0);
  const totalSets = buckets.reduce((sum, b) => sum + b.totalSets, 0);
  const totalActiveDays = buckets.reduce((sum, b) => sum + b.activeDays, 0);
  const totalTonnage = buckets.reduce((sum, b) => sum + b.tonnageKg, 0);

  const activeWeeksCount = buckets.filter((b) => b.workoutCount > 0).length;
  const hasEnoughData = activeWeeksCount >= Math.min(2, Math.ceil(weeksCount / 2));

  const avgWorkoutsPerWeek = Number((totalWorkouts / weeksCount).toFixed(1));
  const avgActiveDaysPerWeek = Number((totalActiveDays / weeksCount).toFixed(1));
  const avgSetsPerWeek = Number((totalSets / weeksCount).toFixed(1));
  const avgTonnagePerWeek = Math.round(totalTonnage / weeksCount);

  // Compare equally sized completed periods. The unfinished current week is
  // still visible, but cannot manufacture a Monday-morning decline.
  const half = Math.floor((weeksCount - 1) / 2);
  const completed = buckets.slice(0, -1).slice(-half * 2);
  const firstHalfSets = completed.slice(0, half).reduce((sum, b) => sum + b.totalSets, 0);
  const secondHalfSets = completed.slice(half).reduce((sum, b) => sum + b.totalSets, 0);

  let trendDirection: 'increasing' | 'stable' | 'decreasing' = 'stable';
  let percentageChange = 0;
  if (firstHalfSets > 0) {
    percentageChange = Math.round(((secondHalfSets - firstHalfSets) / firstHalfSets) * 100);
    if (percentageChange >= 20) trendDirection = 'increasing';
    else if (percentageChange <= -20) trendDirection = 'decreasing';
  } else if (secondHalfSets > 0) {
    trendDirection = 'increasing';
    percentageChange = 100;
  }

  let summaryText = '';
  if (!hasEnoughData) {
    summaryText = `近 ${weeksCount} 周数据积累中，持续训练将展示周期波动趋势`;
  } else if (trendDirection === 'increasing') {
    summaryText = `近 ${weeksCount} 周训练量呈上升趋势（+${percentageChange}%），周均动起来 ${avgActiveDaysPerWeek} 天`;
  } else if (trendDirection === 'decreasing') {
    summaryText = `近 ${weeksCount} 周训练量较前期有所回落，周均动起来 ${avgActiveDaysPerWeek} 天`;
  } else {
    summaryText = `近 ${weeksCount} 周训练节奏保持平稳，周均训练 ${avgWorkoutsPerWeek} 次、${avgSetsPerWeek} 组`;
  }

  return {
    buckets,
    weeksCount,
    hasEnoughData,
    totalWorkouts,
    totalSets,
    avgWorkoutsPerWeek,
    avgActiveDaysPerWeek,
    avgSetsPerWeek,
    avgTonnagePerWeek,
    trendDirection,
    percentageChange,
    summaryText,
  };
}

/**
 * Compare major exercise performances between current period (last 28d)
 * and baseline period (prior 28d) to answer "Did I genuinely improve?".
 */
export function computeExerciseProgression(
  logs: WorkoutLog[],
  scoringPeriodDays = 28,
  referenceDate = new Date(),
  ctx?: StrengthBodyContext | null
): ExerciseProgressComparison[] {
  const body = resolveBodyContext(ctx);
  const bodyweightKg = body.ctx.bodyweightKg;
  const refMs = referenceDate.getTime();
  const periodMs = Math.max(1, Number.isFinite(scoringPeriodDays) ? scoringPeriodDays : 28) * 24 * 60 * 60 * 1000;
  const currentCutoff = refMs - periodMs;
  const baselineCutoff = currentCutoff - periodMs;

  interface PerformanceCandidate {
    weight: number;
    reps: number;
    estimated1RM: number;
    date: string;
    logId: string;
  }

  const currentSamples = new Map<string, Map<string, { value: number; reliable: boolean; logId: string }>>();
  const baselineSamples = new Map<string, Map<string, { value: number; reliable: boolean; logId: string }>>();
  const currentPerformances = new Map<string, PerformanceCandidate>();
  const baselinePerformances = new Map<string, PerformanceCandidate>();
  const allTimePerformances = new Map<string, PerformanceCandidate>();

  logs.forEach((log) => {
    const t = new Date(log.timestamp).getTime();
    if (isNaN(t) || t > refMs) return;

    (log.exercises || []).forEach((ex) => {
      const performance = resolveLoggedStrengthPerformance(ex, bodyweightKg);
      if (!performance || performance.plausibility.excludeFromScoring) return;
      const { definition, canonicalId, estimate, benchmarkLoad, reps } = performance;
      if (!definition?.hasStrengthBenchmark) return;
      const candidate: PerformanceCandidate = {
        weight: benchmarkLoad,
        reps,
        estimated1RM: estimate.estimated1RM,
        date: localWorkoutDateKey(log.timestamp),
        logId: log.id,
      };

      const samples = t >= currentCutoff ? currentSamples : t >= baselineCutoff ? baselineSamples : null;
      if (samples) {
        const days = samples.get(canonicalId) ?? new Map();
        const reliable = ['actual_1rm', 'high', 'medium'].includes(estimate.repConfidence)
          && (estimate.estimateSpread ?? 0) <= 0.06 && definition.benchmarkReliability !== 'D';
        const previous = days.get(candidate.date);
        if (!previous || candidate.estimated1RM > previous.value) days.set(candidate.date, { value: candidate.estimated1RM, reliable, logId: log.id });
        samples.set(canonicalId, days);
      }

      // Check all-time
      const existingAllTime = allTimePerformances.get(canonicalId);
      if (!existingAllTime || candidate.estimated1RM > existingAllTime.estimated1RM) {
        allTimePerformances.set(canonicalId, candidate);
      }

      // Check current window
      if (t >= currentCutoff && t <= refMs) {
        const existingCur = currentPerformances.get(canonicalId);
        if (!existingCur || candidate.estimated1RM > existingCur.estimated1RM) {
          currentPerformances.set(canonicalId, candidate);
        }
      }

      // Check baseline window
      if (t >= baselineCutoff && t < currentCutoff) {
        const existingBase = baselinePerformances.get(canonicalId);
        if (!existingBase || candidate.estimated1RM > existingBase.estimated1RM) {
          baselinePerformances.set(canonicalId, candidate);
        }
      }
    });
  });

  const results: ExerciseProgressComparison[] = [];

  // Focus on canonical exercises with at least one record
  const allKeys = new Set([
    ...currentPerformances.keys(),
    ...baselinePerformances.keys(),
    ...allTimePerformances.keys(),
  ]);

  allKeys.forEach((canonicalId) => {
    const definition = EXERCISE_DEFINITIONS.find((d) => d.id === canonicalId);
    if (!definition) return;

    const cur = currentPerformances.get(canonicalId);
    const base = baselinePerformances.get(canonicalId);
    const all = allTimePerformances.get(canonicalId);

    let status: ExerciseProgressComparison['status'] = 'untrained_recently';
    let changePercentage: number | undefined;
    let evidence = '';
    const unit = STRENGTH_BENCHMARKS[canonicalId]?.unit ?? 'kg';
    const formatPerformance = (p: PerformanceCandidate) => unit === 'kg'
      ? `${p.date} · ${p.weight}kg×${p.reps} (e1RM≈${p.estimated1RM}kg)`
      : `${p.date} · ${p.estimated1RM}${unit === 'sec' ? '秒' : '次'}`;

    if (cur && base) {
      const delta = cur.estimated1RM - base.estimated1RM;
      const pct = Math.round((delta / base.estimated1RM) * 1000) / 10;
      changePercentage = pct;

      if (pct >= 2.0) {
        status = 'progressed';
        evidence = `${definition.name}：本期最佳 ${formatPerformance(cur)}，较上期最佳 ${formatPerformance(base)} 提升 +${pct}%。`;
      } else if (pct <= -3.0) {
        status = 'regressed';
        evidence = `${definition.name}：本期最佳 ${formatPerformance(cur)}，较上期 ${formatPerformance(base)} 回落 ${pct}%。`;
      } else {
        status = 'maintained';
        evidence = `${definition.name}：本期表现 (${formatPerformance(cur)}) 与上期持平，力量输出稳定。`;
      }
    } else if (cur && !base) {
      status = 'new_exercise';
      evidence = `${definition.name}：本期最佳完成 ${formatPerformance(cur)}，上期未记录该动作。`;
    } else if (!cur && base) {
      status = 'untrained_recently';
      evidence = `${definition.name}：近 ${scoringPeriodDays} 天未记录该动作，上期最佳为 ${formatPerformance(base)}。`;
    } else if (all) {
      status = 'untrained_recently';
      evidence = `${definition.name}：历史最佳 ${formatPerformance(all)}，近期暂无训练记录。`;
    }

    const currentDays = [...(currentSamples.get(canonicalId)?.values() ?? [])];
    const baselineDays = [...(baselineSamples.get(canonicalId)?.values() ?? [])];
    const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
    const enough = currentDays.filter(d => d.reliable).length >= 2 && baselineDays.filter(d => d.reliable).length >= 2;
    const typicalChange = enough ? (median(currentDays.filter(d => d.reliable).map(d => d.value)) / median(baselineDays.filter(d => d.reliable).map(d => d.value)) - 1) * 100 : 0;
    // Logs do not record historical bodyweight. A present-day profile cannot
    // establish identical bodyweight across the two periods.
    const personalized = definition.loadMode !== 'bodyweight_plus_external';
    const reliableBenchmark = definition.benchmarkReliability === 'A' || definition.benchmarkReliability === 'B';
    let verdict: ExerciseProgressComparison['verdict'] = 'insufficient_evidence';
    if (cur && base) {
      if ((changePercentage ?? 0) >= 2) verdict = enough && typicalChange >= 2 && personalized && reliableBenchmark ? 'clear_progress' : 'possible_progress';
      else if (enough && personalized && reliableBenchmark && (changePercentage ?? 0) <= -3 && typicalChange <= -3) verdict = 'regressed';
      else if (enough && personalized && reliableBenchmark && Math.abs(typicalChange) < 3 && Math.abs(changePercentage ?? 0) < 3) verdict = 'stable';
    }
    evidence += ` 本期 ${currentDays.length} 个训练日，上期 ${baselineDays.length} 个训练日；${enough ? '已对照多日典型表现' : '样本不足以确认持续变化'}。`;
    if (definition.loadMode === 'bodyweight_plus_external') evidence += '自重负荷按当前参考体重折算，历史体重未记录。';
    if (verdict === 'possible_progress') evidence += '最佳表现提高，但持续进步仍需后续同条件记录验证。';

    results.push({
      canonicalId,
      exerciseName: definition.name,
      category: definition.primaryCategory,
      unit,
      currentBest: cur,
      baselineBest: base,
      allTimeBest: all,
      status,
      verdict,
      currentSampleDays: currentDays.length,
      baselineSampleDays: baselineDays.length,
      sourceLogIds: [...new Set([...currentDays, ...baselineDays].map(d => d.logId).concat(all?.logId ?? []))],
      changePercentage,
      evidence,
    });
  });

  // Sort: progressed first, then maintained, then new_exercise, then untrained
  const evidenceRank = { clear_progress: 0, possible_progress: 1, stable: 2, regressed: 3, insufficient_evidence: 4 };
  return results.sort((a, b) => (evidenceRank[a.verdict ?? 'insufficient_evidence'] - evidenceRank[b.verdict ?? 'insufficient_evidence']) || (b.changePercentage ?? 0) - (a.changePercentage ?? 0) || a.canonicalId.localeCompare(b.canonicalId));
}

/**
 * Generate explainable, deterministic training feedback.
 * Pattern: Observation (观察) → Evidence (证据) → Interpretation (解释) → Action (可选行动)
 */
export function generateDeterministicTrainingInsights(
  analytics: {
    categoryDetails: Record<WorkoutCategory, CategoryScoreDetail>;
    insights: WorkoutInsights;
    recentWorkoutsCount: number;
    recentSetsCount: number;
  },
  progression: ExerciseProgressComparison[],
  trends: WeeklyTrendsSummary
): DeterministicInsight[] {
  const insights: DeterministicInsight[] = [];
  const { categoryDetails, insights: balanceInfo, recentWorkoutsCount } = analytics;

  // 1. Progress highlights (actions with progressive overload)
  const progressed = progression.filter((p) => p.verdict === 'clear_progress');
  if (progressed.length > 0) {
    const top = progressed[0];
    insights.push({
      type: 'strength',
      level: 'highlight',
      observation: `${top.exerciseName} 多次记录显示表现提高`,
      evidence: top.evidence,
      interpretation: '多个训练日的表现共同提高；训练记录无法直接确认肌肥大或其他生理变化。',
      action: '下次在相同动作条件下记录表现，确认能稳定完成当前组次数后再考虑调整负荷。',
    });
  }

  // 2. Muscle balance & coverage insights
  if (balanceInfo.coverageCount <= 2 && recentWorkoutsCount >= 3) {
    const trained = (Object.values(WorkoutCategory) as WorkoutCategory[])
      .filter((c) => c !== WorkoutCategory.Cardio && categoryDetails[c].recentSets > 0)
      .map((c) => categoryDetails[c].zh)
      .join('、');
    insights.push({
      type: 'balance',
      level: 'suggestion',
      observation: '主要肌群训练覆盖不均衡',
      evidence: `近 28 天仅训练了 ${balanceInfo.coverageCount} 个部位（${trained || '局部'}），其他主要大肌群覆盖不足。`,
      interpretation: '记录中的部位覆盖较少；这描述记录分布，不能用于诊断身体失衡或伤病风险。',
      action: '建议检查分化计划，安排全身或上下肢分化（如增加推、拉、腿分化），逐步补齐未覆盖部位。',
    });
  } else if (balanceInfo.balanceLevel === '极度均衡' || balanceInfo.balanceLevel === '均衡良好') {
    insights.push({
      type: 'balance',
      level: 'highlight',
      observation: '肌群训练分布整体均衡',
      evidence: `5 大抗阻部位覆盖率达 ${Math.round(balanceInfo.coverageRatio * 100)}%，各部位训练量差异较小（均衡分 ${balanceInfo.balanceScore}）。`,
      interpretation: '胸、背、腿、肩等各部位投入比例合理，记录显示多个部位都有投入。',
      action: '继续保持当前的平衡分化，针对个人体态特点做局部微调即可。',
    });
  }

  // 3. Consistency and habit insights
  if (trends.hasEnoughData) {
    if (trends.avgActiveDaysPerWeek >= 3) {
      insights.push({
        type: 'habit',
        level: 'highlight',
        observation: '近期每周平均活跃天数较多',
        evidence: `近 ${trends.weeksCount} 周平均每周活跃 ${trends.avgActiveDaysPerWeek} 天，累计完成 ${trends.totalWorkouts} 次打卡。`,
        interpretation: '这是周期内的平均出勤；还需结合各周分布判断是否稳定。',
        action: '在保证睡眠和营养恢复的前提下维持当前频次，警惕过度疲劳信号。',
      });
    } else if (trends.avgActiveDaysPerWeek <= 1 && recentWorkoutsCount > 0) {
      insights.push({
        type: 'habit',
        level: 'suggestion',
        observation: '训练频率偏低，刺激间隔较长',
        evidence: `近 ${trends.weeksCount} 周平均每周训练 ${trends.avgActiveDaysPerWeek} 天。`,
        interpretation: '当前记录之间的间隔较长；未记录的训练和个人安排也可能影响这个判断。',
        action: '建议先确立“每周至少动 2-3 天”的底线目标，哪怕每次仅做 20-30 分钟。',
      });
    }
  }

  // Cardio conclusions use valid duration, never calorie goal completion as capability.
  const cardio = categoryDetails[WorkoutCategory.Cardio]?.cardioMetrics;
  if (cardio && cardio.validSessions > 0) insights.push({
    type: 'cardio', level: 'neutral', observation: '近期有氧训练已有记录',
    evidence: `近 28 天记录 ${cardio.activeDays} 个有效有氧训练日，累计 ${cardio.effectiveMinutes} 分钟。`,
    interpretation: '这里展示有氧投入，不代表测得的心肺能力。',
    action: '下次继续记录实际时长与活动类型，便于比较周期内的投入。',
  });

  // Fallback if no specific insights matched
  if (insights.length === 0) {
    if (recentWorkoutsCount === 0) {
      insights.push({
        type: 'habit',
        level: 'neutral',
        observation: '待开启周期训练记录',
        evidence: '近 28 天暂无打卡数据。',
        interpretation: '身体状态与运动表现需要持续记录才能提供可靠分析。',
        action: '今天就可以开启你的第一练，迈出第一步！',
      });
    } else {
      insights.push({
        type: 'volume',
        level: 'neutral',
        observation: '已有训练记录，变化仍待验证',
        evidence: `近 28 天累计完成 ${recentWorkoutsCount} 次打卡，总组数 ${analytics.recentSetsCount} 组。`,
        interpretation: '仅凭当前打卡数量无法判断力量是否稳定或提高。',
        action: '优先在相同动作条件下持续记录，再比较多个训练日的表现。',
      });
    }
  }

  return insights;
}
