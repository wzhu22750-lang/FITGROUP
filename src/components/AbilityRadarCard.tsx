import React, { useMemo } from 'react';
import { Target, HelpCircle, ChevronRight } from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { WorkoutCategory } from '../types';
import {
  getStrengthTier,
  getCardioTier,
  getTrainingStateTier,
  CategoryScoreDetail,
  categoryMetricState,
} from '../utils/workoutAnalytics';
import { CATEGORY_META } from '../constants/workoutPresets';

interface AbilityRadarCardProps {
  radarMode: 'composite' | 'strength';
  setRadarMode: (mode: 'composite' | 'strength') => void;
  chartView: 'radar' | 'bars';
  setChartView: (view: 'radar' | 'bars') => void;
  categoryDetails: Record<WorkoutCategory, CategoryScoreDetail>;
  hasAnyData: boolean;
  onSelectCategory: (cat: WorkoutCategory) => void;
  onOpenStandards: () => void;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '高置信度',
  medium: '中置信度',
  low: '低置信度',
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-blue-100 text-blue-800',
  low: 'bg-amber-100 text-amber-900',
};

// Fixed canonical order to maintain an invariant mental spatial map
const FIXED_RADAR_ORDER: WorkoutCategory[] = [
  WorkoutCategory.Chest,
  WorkoutCategory.Back,
  WorkoutCategory.Shoulders,
  WorkoutCategory.Legs,
  WorkoutCategory.Others,
  WorkoutCategory.Cardio,
];

export default function AbilityRadarCard({
  radarMode,
  setRadarMode,
  chartView,
  setChartView,
  categoryDetails,
  hasAnyData,
  onSelectCategory,
  onOpenStandards,
}: AbilityRadarCardProps) {
  // Chart data in fixed canonical order without dynamic axis rearrangement
  const radarChartData = useMemo(() => {
    return FIXED_RADAR_ORDER.map((cat) => {
      const detail = categoryDetails[cat];
      const meta = CATEGORY_META[cat];
      const rawScore = radarMode === 'composite'
        ? (cat === WorkoutCategory.Cardio ? (detail.cardioScore ?? detail.compositeScore) : detail.compositeScore)
        : (cat === WorkoutCategory.Cardio ? 0 : detail.strengthScore);

      // Real 0-values without arbitrary +6 visual distortion
      return {
        subject: meta.zh,
        metricState: categoryMetricState(detail, radarMode),
        score: rawScore,
        rawScore,
        composite: detail.compositeScore,
        strength: detail.strengthScore,
        activity: detail.activityScore,
        // Contextual 50-point reference line:
        // In capacity mode: 50 is steady habit; in strength mode: 50 is intermediate population median
        benchmark: 50,
        fullMark: 100,
        category: cat,
      };
    });
  }, [categoryDetails, radarMode]);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="font-bold text-ink flex items-center gap-1 sm:gap-1.5 italic text-xs sm:text-base min-w-0">
          <Target size={16} className="text-ink shrink-0 sm:w-[18px] sm:h-[18px]" />
          <span className="truncate">能力图谱</span>
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View Switcher: Radar vs Bars */}
          <div className="flex bg-paper p-0.5 border border-ink/20">
            <button
              type="button"
              onClick={() => setChartView('radar')}
              className="stats-control"
              aria-pressed={chartView === 'radar'}
              title="六维雷达图"
            >
              雷达
            </button>
            <button
              type="button"
              onClick={() => setChartView('bars')}
              className="stats-control"
              aria-pressed={chartView === 'bars'}
              title="条形明细图"
            >
              条形
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenStandards}
            className="stats-control flex items-center gap-1 shrink-0"
          >
            <HelpCircle size={12} className="shrink-0" />
            <span>标准</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex bg-paper p-1 mb-4 gap-1 border border-ink/20">
        <button
          type="button"
          onClick={() => setRadarMode('composite')}
          className="stats-control flex-1 text-center"
          aria-pressed={radarMode === 'composite'}
        >
          训练能力指数 (近28天)
        </button>
        <button
          type="button"
          onClick={() => setRadarMode('strength')}
          className="stats-control flex-1 text-center"
          aria-pressed={radarMode === 'strength'}
        >
          极限力量水平 (基准PR)
        </button>
      </div>

      {hasAnyData ? (
        <div>
          {chartView === 'radar' ? (
            /* Responsive Radar chart */
            <div className="h-[250px] sm:h-[270px] w-full relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={230} initialDimension={{ width: 280, height: 250 }}>
                <RadarChart cx="50%" cy="50%" outerRadius="66%" data={radarChartData}>
                  <PolarGrid stroke="#e4e5df" strokeWidth={1} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: '#45483f', fontSize: 12, fontWeight: '700' }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tickCount={6}
                    stroke="#94a3b8"
                    tick={{ fontSize: 8, fill: '#64748b' }}
                  />
                  {/* Mode-aligned 50-point Reference Line */}
                  <Radar
                    name={radarMode === 'composite' ? '稳定训练参考 (50分)' : '进阶人群基准 (50分)'}
                    dataKey="benchmark"
                    stroke="#cbd5e1"
                    strokeDasharray="3 3"
                    fill="#f8fafc"
                    fillOpacity={0.3}
                    strokeWidth={1.5}
                  />
                  {/* User Ability Polygon */}
                  <Radar
                    name="能力评分"
                    dataKey="score"
                    stroke="#000"
                    fill="#DFFF00"
                    fillOpacity={0.35}
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#000' }}
                    activeDot={{ r: 5, fill: '#DFFF00', stroke: '#000', strokeWidth: 2 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const point = payload[0]?.payload as { subject?: string; rawScore?: number; metricState?: string };
                      return (
                        <div className="bg-white border-2 border-ink px-2.5 py-1 text-xs font-black text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          {point?.subject}: {point?.metricState === 'not_applicable' ? '不适用' : point?.metricState === 'no_data' ? '无数据' : `${point?.rawScore ?? 0} 分`}
                        </div>
                      );
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div className="text-[10px] text-ink/40 text-center font-bold">
                虚线框：{radarMode === 'composite' ? '稳态训练参考线 (50分)' : '进阶人群基准线 (50分)'}
              </div>
            </div>
          ) : (
            /* 6-Dimension Progress Bars View (Linear & responsive for mobile) */
            <div className="py-2 space-y-2 mb-2">
              {FIXED_RADAR_ORDER.map((cat) => {
                const detail = categoryDetails[cat];
                const meta = CATEGORY_META[cat];
                const isStrengthMode = radarMode === 'strength';
                const score = cat === WorkoutCategory.Cardio
                  ? (isStrengthMode ? 0 : (detail.cardioScore ?? detail.compositeScore))
                  : (isStrengthMode ? detail.strengthScore : detail.compositeScore);

                const tier = cat === WorkoutCategory.Cardio
                  ? getCardioTier(score)
                  : isStrengthMode
                    ? (detail.strengthAssessment?.tier ?? getStrengthTier(score))
                    : getTrainingStateTier(score);
                const metricState = categoryMetricState(detail, radarMode);
                const label = metricState === 'not_applicable' ? '不适用' : metricState === 'no_data' ? '无数据' : tier.zh;
                const isZero = score === 0;

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onSelectCategory(cat)}
                    className="w-full bg-paper hover:bg-white border-2 border-ink p-2 sm:p-2.5 flex flex-col gap-1.5 transition-colors text-left cursor-pointer group active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-xs text-ink flex items-center gap-1.5 truncate">
                        <span className={`w-2.5 h-2.5 border border-ink ${meta.color}`} />
                        <span>{meta.zh}</span>
                        <span className="text-[10px] text-ink/40 font-normal">({meta.en})</span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.2 border border-ink whitespace-nowrap ${
                            isZero ? 'bg-ink/10 text-ink/50' : `${tier.badgeBg} ${tier.badgeText}`
                          }`}
                        >
                          {label}
                        </span>
                        <span className="text-xs font-black italic">
                          {metricState === 'measured' ? score : '—'} <span className="text-[9px] text-ink/50 not-italic">分</span>
                        </span>
                        <ChevronRight size={12} className="text-ink/40 group-hover:text-ink transition-colors" />
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-ink/10 border border-ink h-2.5 overflow-hidden p-0.5 relative">
                      <div
                        className={`h-full transition-colors duration-500 ${
                          isZero ? 'bg-transparent' : 'bg-neon border-r border-ink'
                        }`}
                        style={{ width: `${Math.min(score, 100)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 6 Category Breakdown Grid */}
          <div className={`${chartView === 'bars' ? 'hidden sm:grid grid-cols-3' : 'grid grid-cols-2 sm:grid-cols-3'} gap-2 mt-3 pt-3 border-t-2 border-paper`}>
            {FIXED_RADAR_ORDER.map((cat) => {
              const detail = categoryDetails[cat];
              const meta = CATEGORY_META[cat];
              const isStrengthMode = radarMode === 'strength';
              const score = cat === WorkoutCategory.Cardio
                ? (isStrengthMode ? 0 : (detail.cardioScore ?? detail.compositeScore))
                : (isStrengthMode ? detail.strengthScore : detail.compositeScore);
              const tier = cat === WorkoutCategory.Cardio
                ? getCardioTier(score)
                : isStrengthMode
                  ? (detail.strengthAssessment?.tier ?? getStrengthTier(score))
                  : getTrainingStateTier(score);

              const metricState = categoryMetricState(detail, radarMode);
              const label = metricState === 'not_applicable' ? '不适用' : metricState === 'no_data' ? '无数据' : tier.zh;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onSelectCategory(cat)}
                  className="stats-category group cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="font-black text-xs text-ink flex items-center gap-0.5 truncate">
                      {meta.zh}
                      <ChevronRight size={11} className="text-ink/40 group-hover:text-ink transition-colors shrink-0" />
                    </span>
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.2 border border-ink shrink-0 whitespace-nowrap ${tier.badgeBg} ${tier.badgeText}`}
                    >
                      {label}
                    </span>
                  </div>

                  <div className="text-lg font-black italic leading-none my-1">
                    {metricState === 'measured' ? score : '—'} <span className="text-[10px] text-ink/60 not-italic">分</span>
                  </div>

                  {/* Breakdown indicators */}
                  {cat === WorkoutCategory.Cardio ? (
                    <div className="text-[10px] font-bold text-ink/70 truncate">
                      {detail.cardioCalories?.actual ? `${detail.cardioCalories.actual} kcal` : '0 kcal'}
                    </div>
                  ) : isStrengthMode ? (
                    <div className="text-[9px] font-bold text-ink/60 truncate flex items-center gap-1">
                      {detail.bestExerciseName ? <span>依据 {detail.bestExerciseName}</span> : <span>暂无力量证据</span>}
                      {detail.strengthConfidence && (
                        <span className={`px-1 border border-ink/30 ${CONFIDENCE_STYLES[detail.strengthConfidence]}`}>
                          {CONFIDENCE_LABEL[detail.strengthConfidence]}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[9px] font-bold text-ink/60 truncate flex items-center gap-1">
                      <span>频{detail.frequencyScore ?? 0}</span>
                      <span>·</span>
                      <span>容{detail.volumeScore ?? 0}</span>
                      <span>·</span>
                      <span>进{detail.progressionScore ?? 0}</span>
                      <span>·</span>
                      <span>稳{detail.consistencyScore ?? 0}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-ink/50 text-right mt-2 font-bold">
            点击部位卡片，查看细分肌群与详细依据
          </p>
        </div>
      ) : (
        <div className="h-[230px] flex items-center justify-center border-2 border-dashed border-ink/20">
          <div className="text-center p-6">
            <Target size={32} className="text-ink/20 mx-auto mb-2" />
            <p className="font-black text-ink/40 uppercase text-xs italic">
              完成第一次打卡后解锁全维度能力图谱
            </p>
            <p className="text-[11px] text-ink/40 mt-1">
              复合动作按刺激系数自动折算有效组并分配至各主肌群
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
