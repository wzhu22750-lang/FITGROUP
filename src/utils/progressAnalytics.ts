import { WorkoutCategory, WorkoutLog } from '../types';
import {
  CategoryScoreDetail,
  WorkoutInsights,
} from './workoutAnalytics';
import {
  EXERCISE_DEFINITIONS,
  resolveExerciseDefinition,
} from '../constants/exerciseDefinitions';
import {
  estimateOneRepMaxDetailed,
  resolvePerformanceLoad,
} from './strengthAssessment';
import { CATEGORY_META } from '../constants/workoutPresets';

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
  referenceDate = new Date()
): WeeklyTrendsSummary {
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
    const weekKey = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 6) / 7)).padStart(2, '0')}`;

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

  logs.forEach((log) => {
    const logTime = new Date(log.timestamp).getTime();
    if (isNaN(logTime) || logTime > referenceDate.getTime()) return;

    // Find corresponding bucket
    for (let bIndex = 0; bIndex < buckets.length; bIndex++) {
      const bucket = buckets[bIndex];
      const startMs = new Date(bucket.startDate).getTime();
      const endMs = new Date(bucket.endDate).getTime();

      if (logTime >= startMs && logTime <= endMs) {
        bucket.workoutCount += 1;
        const dateKey = log.timestamp.split('T')[0] || '';
        if (dateKey) dateKeysPerBucket[bIndex].add(dateKey);

        const exercises = Array.isArray(log.exercises) ? log.exercises : [];
        exercises.forEach((ex) => {
          if (ex.type === 'cardio') {
            bucket.cardioMinutes += Number(ex.duration || 0);
            bucket.categorySets[WorkoutCategory.Cardio] += 1;
            return;
          }

          const sets = Math.max(0, ex.sets || 0);
          const reps = Math.max(0, ex.reps || 0);
          const weight = Math.max(0, ex.weight || 0);
          bucket.totalSets += sets;
          bucket.effectiveSets += sets;
          bucket.tonnageKg += Math.round(weight * sets * reps);

          const { definition } = resolveExerciseDefinition(ex.name);
          const primaryCat = definition?.primaryCategory || WorkoutCategory.Others;
          bucket.categorySets[primaryCat] = (bucket.categorySets[primaryCat] || 0) + sets;
        });
        break;
      }
    }
  });

  // Calculate active days & top category for each bucket
  buckets.forEach((bucket, idx) => {
    bucket.activeDays = dateKeysPerBucket[idx].size;
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

  // Direction: compare second half of weeks vs first half
  const half = Math.floor(weeksCount / 2);
  const firstHalfSets = buckets.slice(0, half).reduce((sum, b) => sum + b.totalSets, 0);
  const secondHalfSets = buckets.slice(half).reduce((sum, b) => sum + b.totalSets, 0);

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
  referenceDate = new Date()
): ExerciseProgressComparison[] {
  const refMs = referenceDate.getTime();
  const periodMs = scoringPeriodDays * 24 * 60 * 60 * 1000;
  const currentCutoff = refMs - periodMs;
  const baselineCutoff = currentCutoff - periodMs;

  interface PerformanceCandidate {
    weight: number;
    reps: number;
    estimated1RM: number;
    date: string;
    logId: string;
  }

  const currentPerformances = new Map<string, PerformanceCandidate>();
  const baselinePerformances = new Map<string, PerformanceCandidate>();
  const allTimePerformances = new Map<string, PerformanceCandidate>();

  logs.forEach((log) => {
    const t = new Date(log.timestamp).getTime();
    if (isNaN(t) || t > refMs) return;

    (log.exercises || []).forEach((ex) => {
      if (ex.type !== 'strength' || typeof ex.weight !== 'number') return;
      const reps = Math.max(1, ex.reps || 1);
      const weight = Math.max(0, ex.weight || 0);
      if (weight <= 0) return;

      const { definition, canonicalId } = resolveExerciseDefinition(ex.name);
      if (!definition || !definition.hasStrengthBenchmark) return;

      const load = resolvePerformanceLoad(definition, ex.name, weight);
      const estimate = estimateOneRepMaxDetailed(load.benchmarkLoad, reps);
      const e1rm = estimate.usableForStrength ? estimate.estimated1RM : load.benchmarkLoad;

      const candidate: PerformanceCandidate = {
        weight: load.benchmarkLoad,
        reps,
        estimated1RM: e1rm,
        date: log.timestamp.split('T')[0] || '',
        logId: log.id,
      };

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

    if (cur && base) {
      const delta = cur.estimated1RM - base.estimated1RM;
      const pct = Math.round((delta / base.estimated1RM) * 1000) / 10;
      changePercentage = pct;

      if (pct >= 2.0) {
        status = 'progressed';
        evidence = `${definition.name}：本期最佳 ${cur.weight}kg×${cur.reps} (e1RM≈${cur.estimated1RM}kg)，较上期最佳 ${base.weight}kg×${base.reps} (e1RM≈${base.estimated1RM}kg) 提升 +${pct}%。`;
      } else if (pct <= -3.0) {
        status = 'regressed';
        evidence = `${definition.name}：本期最佳 ${cur.weight}kg×${cur.reps} (e1RM≈${cur.estimated1RM}kg)，较上期 ${base.weight}kg×${base.reps} 回落 ${pct}%。`;
      } else {
        status = 'maintained';
        evidence = `${definition.name}：本期表现 (${cur.weight}kg×${cur.reps}) 与上期持平，力量输出稳定。`;
      }
    } else if (cur && !base) {
      status = 'new_exercise';
      evidence = `${definition.name}：本期最佳完成 ${cur.weight}kg×${cur.reps} (e1RM≈${cur.estimated1RM}kg)，上期未记录该动作。`;
    } else if (!cur && base) {
      status = 'untrained_recently';
      evidence = `${definition.name}：近 ${scoringPeriodDays} 天未记录该动作，上期最佳为 ${base.weight}kg×${base.reps}。`;
    } else if (all) {
      status = 'untrained_recently';
      evidence = `${definition.name}：历史最佳 ${all.weight}kg×${all.reps}，近期暂无训练记录。`;
    }

    results.push({
      canonicalId,
      exerciseName: definition.name,
      category: definition.primaryCategory,
      currentBest: cur,
      baselineBest: base,
      allTimeBest: all,
      status,
      changePercentage,
      evidence,
    });
  });

  // Sort: progressed first, then maintained, then new_exercise, then untrained
  const orderRank: Record<string, number> = {
    progressed: 1,
    maintained: 2,
    new_exercise: 3,
    regressed: 4,
    untrained_recently: 5,
  };

  return results.sort((a, b) => (orderRank[a.status] || 99) - (orderRank[b.status] || 99));
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
  const progressed = progression.filter((p) => p.status === 'progressed');
  if (progressed.length > 0) {
    const top = progressed[0];
    insights.push({
      type: 'strength',
      level: 'highlight',
      observation: `${top.exerciseName} 取得实质性超负荷进步`,
      evidence: top.evidence,
      interpretation: '力量指标呈现明确的渐进超负荷趋势，神经适应或肌肥大成效显著。',
      action: '保持当前组次数递增节奏，在能高质量完成目标次数时，下次可尝试微增 1.25~2.5kg 负重。',
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
      interpretation: '全身力量发展不均可能增加关节负担或限制复合动作上限，不利于长期运动健康。',
      action: '建议检查分化计划，安排全身或上下肢分化（如增加推、拉、腿分化），逐步补齐未覆盖部位。',
    });
  } else if (balanceInfo.balanceLevel === '极度均衡' || balanceInfo.balanceLevel === '均衡良好') {
    insights.push({
      type: 'balance',
      level: 'highlight',
      observation: '肌群训练分布整体均衡',
      evidence: `5 大抗阻部位覆盖率达 ${Math.round(balanceInfo.coverageRatio * 100)}%，各部位训练量差异较小（均衡分 ${balanceInfo.balanceScore}）。`,
      interpretation: '胸、背、腿、肩等各部位投入比例合理，体现了系统性的训练编排。',
      action: '继续保持当前的平衡分化，针对个人体态特点做局部微调即可。',
    });
  }

  // 3. Consistency and habit insights
  if (trends.hasEnoughData) {
    if (trends.avgActiveDaysPerWeek >= 3) {
      insights.push({
        type: 'habit',
        level: 'highlight',
        observation: '高频稳定的训练习惯已稳固建立',
        evidence: `近 ${trends.weeksCount} 周平均每周活跃 ${trends.avgActiveDaysPerWeek} 天，累计完成 ${trends.totalWorkouts} 次打卡。`,
        interpretation: '规律的每周刺激提供了持续的生理适应信号，比突击式高容量更利于长期进步。',
        action: '在保证睡眠和营养恢复的前提下维持当前频次，警惕过度疲劳信号。',
      });
    } else if (trends.avgActiveDaysPerWeek <= 1 && recentWorkoutsCount > 0) {
      insights.push({
        type: 'habit',
        level: 'suggestion',
        observation: '训练频率偏低，刺激间隔较长',
        evidence: `近 ${trends.weeksCount} 周平均每周训练 ${trends.avgActiveDaysPerWeek} 天。`,
        interpretation: '肌肉合成信号在单次训练后通常维持 24-48 小时，过长的间隔可能导致部分适应效果回落。',
        action: '建议先确立“每周至少动 2-3 天”的底线目标，哪怕每次仅做 20-30 分钟。',
      });
    }
  }

  // 4. Cardio & heart health insights
  const cardioDetail = categoryDetails[WorkoutCategory.Cardio];
  if (cardioDetail && cardioDetail.cardioCalories && cardioDetail.cardioCalories.actual > 0) {
    const cal = cardioDetail.cardioCalories.actual;
    const completion = cardioDetail.cardioCalories.completionRate;
    if (completion >= 80) {
      insights.push({
        type: 'cardio',
        level: 'highlight',
        observation: '有氧心肺投入表现优秀',
        evidence: `近 28 天累计消耗约 ${cal} kcal，达到月度目标 (${completion}%)。`,
        interpretation: '规律的心肺耐力训练有助于增强毛细血管密度，加速力量训练间歇期间的乳酸清除。',
        action: '保持当前的低/中强度心肺搭配，为力量训练提供充沛的体能底盘。',
      });
    }
  } else if (recentWorkoutsCount >= 4 && (!cardioDetail || cardioDetail.recentSets === 0)) {
    insights.push({
      type: 'cardio',
      level: 'neutral',
      observation: '近期心肺训练投入较少',
      evidence: '近 28 天暂无有氧打卡记录，训练以纯抗阻为主。',
      interpretation: '适度有氧有助于改善线粒体功能并促进恢复，纯无氧训练者每周穿插适量有氧有益心血管。',
      action: '建议每周安排 1 次 20-30 分钟轻松有氧（快走、骑行、羽毛球），控制心率在轻松说话区间。',
    });
  }

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
        observation: '训练节奏平稳保持',
        evidence: `近 28 天累计完成 ${recentWorkoutsCount} 次打卡，总组数 ${analytics.recentSetsCount} 组。`,
        interpretation: '当前训练处于稳态维持期，动作表现与容量波动较小。',
        action: '可评估是否尝试在下一个中周期引入新的渐进超负荷变量。',
      });
    }
  }

  return insights;
}
