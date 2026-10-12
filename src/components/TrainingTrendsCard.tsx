import React, { useState } from 'react';
import { TrendingUp, Calendar, Zap, ArrowUpRight, Minus, ArrowDownRight, Sparkles } from 'lucide-react';
import { WorkoutCategory } from '../types';
import {
  WeeklyTrendsSummary,
  ExerciseProgressComparison,
} from '../utils/progressAnalytics';
import {
  CategoryScoreDetail,
  VolumeDistributionItem,
} from '../utils/workoutAnalytics';
import { CATEGORY_META } from '../constants/workoutPresets';

interface TrainingTrendsCardProps {
  trends: WeeklyTrendsSummary;
  selectedWeeks: 4 | 8 | 12;
  onSelectWeeks: (weeks: 4 | 8 | 12) => void;
  progression: ExerciseProgressComparison[];
  volumeDistribution: VolumeDistributionItem[];
  volumeTimeframe: 7 | 28;
  onSelectVolumeTimeframe: (tf: 7 | 28) => void;
  categoryDetails: Record<WorkoutCategory, CategoryScoreDetail>;
  recentWorkoutsCount: number;
  recentSetsCount: number;
}

function TrainingTrendsCard({
  trends,
  selectedWeeks,
  onSelectWeeks,
  progression,
  volumeDistribution,
  volumeTimeframe,
  onSelectVolumeTimeframe,
  categoryDetails,
  recentWorkoutsCount,
  recentSetsCount,
}: TrainingTrendsCardProps) {
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [activeTab, setActiveTab] = useState<'trends' | 'exercises' | 'volume'>('trends');

  // Find max sets in buckets for relative bar scaling
  const maxWeeklySets = Math.max(1, ...trends.buckets.map((b) => b.totalSets));

  return (
    <div className="card p-4 sm:p-5 bg-white border-2 border-ink">
      <div className="flex items-center justify-between mb-3.5 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <TrendingUp size={18} className="text-ink shrink-0" />
          <h3 className="font-bold text-ink italic text-sm sm:text-base whitespace-nowrap truncate">
            近期训练与进步
          </h3>
        </div>

        {/* Tab switchers */}
        <div className="flex bg-paper p-0.5 border border-ink/20 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('trends')}
            className="stats-control"
            aria-pressed={activeTab === 'trends'}
          >
            周趋势
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('exercises')}
            className="stats-control"
            aria-pressed={activeTab === 'exercises'}
          >
            动作对比
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('volume')}
            className="stats-control"
            aria-pressed={activeTab === 'volume'}
          >
            负荷分布
          </button>
        </div>
      </div>

      {activeTab === 'trends' && (
        <div className="space-y-3.5">
          {/* Week Window Selector */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-ink/70">统计周期：</span>
            <div className="flex bg-paper p-0.5 border border-ink/20">
              {([4, 8, 12] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onSelectWeeks(w)}
                  className={`min-h-10 px-2 py-1 text-xs font-black transition-colors cursor-pointer ${
                    selectedWeeks === w ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  近 {w} 周
                </button>
              ))}
            </div>
          </div>

          {/* Trend Summary Banner */}
          <div className="bg-paper p-3 border-2 border-ink space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-ink flex items-center gap-1">
                <Calendar size={13} />
                <span>{trends.summaryText}</span>
              </span>
              <span className={`text-[10px] font-black px-1.5 py-0.2 border border-ink shrink-0 ${
                trends.trendDirection === 'increasing'
                  ? 'bg-neon text-ink'
                  : trends.trendDirection === 'decreasing'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-white text-ink/80'
              }`}>
                {!trends.hasEnoughData ? '数据积累中' : trends.trendDirection === 'increasing' ? '容量上升' : trends.trendDirection === 'decreasing' ? '周期减量' : '节奏平稳'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-ink/60 pt-1">
              <span>周均打卡 <strong className="text-ink">{trends.avgWorkoutsPerWeek}</strong> 次</span>
              <span>·</span>
              <span>周均动起来 <strong className="text-ink">{trends.avgActiveDaysPerWeek}</strong> 天</span>
              <span>·</span>
              <span>周均负荷 <strong className="text-ink">{trends.avgSetsPerWeek}</strong> 组</span>
            </div>
          </div>

          <p className="text-[10px] text-ink/60">包含本周；趋势方向比较等长的完整周，周均值包含本周。</p>

          {/* Visual Week Bars */}
          <div className="space-y-2 pt-1">
            {trends.buckets.map((b) => {
              const heightPercent = Math.max(8, Math.round((b.totalSets / maxWeeklySets) * 100));
              const hasWorkouts = b.workoutCount > 0;

              return (
                <div key={b.weekKey} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold gap-2">
                    <span className="text-ink font-mono text-[11px] min-w-[70px] truncate">{b.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-ink/60">{b.activeDays}天活跃</span>
                      <span className="text-ink font-black">{b.totalSets}组</span>
                      <span className="text-[10px] bg-paper px-1 border border-ink/30 text-ink/70">
                        {b.workoutCount}次
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-3 bg-paper border border-ink overflow-hidden p-0.5">
                    <div
                      className={`h-full transition-all duration-300 ${
                        hasWorkouts ? 'bg-neon border-r border-ink' : 'bg-transparent'
                      }`}
                      style={{ width: `${hasWorkouts ? heightPercent : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'exercises' && (
        <div className="space-y-2.5">
          <p className="text-[11px] text-ink/60 font-bold leading-relaxed">
            对比近 28 天与上一个 28 天周期的最佳表现；自重动作按有效负荷或次数比较。
          </p>

          {progression.length > 6 && <button type="button" aria-expanded={showAllExercises}
            onClick={() => setShowAllExercises(value => !value)} className="btn-secondary min-h-11 text-xs">
            {showAllExercises ? '收起动作明细' : `查看全部 ${progression.length} 个动作`}
          </button>}
          {progression.length > 0 ? (
            progression.slice(0, showAllExercises ? progression.length : 6).map((item) => {
              const isProgressed = item.verdict === 'clear_progress';
              const isMaintained = item.verdict === 'stable';
              const isRegressed = item.verdict === 'regressed';
              const isNew = item.status === 'new_exercise';

              return (
                <div key={item.canonicalId} className="bg-paper p-3 border-2 border-ink space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-black text-xs text-ink truncate">{item.exerciseName}</span>
                      <span className="text-[9px] font-bold px-1 py-0.2 bg-white border border-ink/40 text-ink/70 shrink-0">
                        {CATEGORY_META[item.category]?.zh || item.category}
                      </span>
                    </div>
                    <span className={`text-[10px] font-black px-1.5 py-0.2 border border-ink shrink-0 ${
                      isProgressed
                        ? 'bg-neon text-ink'
                        : isMaintained
                        ? 'bg-blue-100 text-blue-900'
                        : isRegressed
                        ? 'bg-amber-100 text-amber-900'
                        : isNew
                        ? 'bg-purple-100 text-purple-900'
                        : 'bg-white text-ink/50'
                    }`}>
                      {isProgressed
                        ? `明显进步 +${item.changePercentage}%`
                        : isMaintained
                        ? '表现稳定'
                        : isRegressed
                        ? `回落 ${item.changePercentage}%`
                        : isNew
                        ? '上期无记录'
                        : item.verdict === 'possible_progress' ? '可能进步' : '证据不足'}
                    </span>
                  </div>

                  <p className="text-[11px] text-ink/80 leading-snug font-medium">
                    {item.evidence}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6 border-2 border-dashed border-ink/20">
              <Sparkles size={20} className="text-ink/20 mx-auto mb-1.5" />
              <p className="text-ink/40 font-medium text-xs">
                完成更多标准动作记录后，系统将自动比对周期超负荷进步
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'volume' && (
        <div className="space-y-3">
          {/* Timeframe switch: 7d vs 28d */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-ink/70">负荷统计范围：</span>
            <div className="flex bg-paper p-0.5 border border-ink/20">
              <button
                type="button"
                onClick={() => onSelectVolumeTimeframe(7)}
                className={`min-h-10 px-2 py-1 text-xs font-black transition-colors cursor-pointer ${
                  volumeTimeframe === 7 ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
                }`}
              >
                近 7 天
              </button>
              <button
                type="button"
                onClick={() => onSelectVolumeTimeframe(28)}
                className={`min-h-10 px-2 py-1 text-xs font-black transition-colors cursor-pointer ${
                  volumeTimeframe === 28 ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
                }`}
              >
                近 28 天
              </button>
            </div>
          </div>

          {recentSetsCount > 0 || (categoryDetails[WorkoutCategory.Cardio].cardioVolumeMetrics?.validSessions ?? 0) > 0 ? (
            <div className="space-y-3">
              {volumeDistribution.map((item) => {
                const isCardio = item.category === WorkoutCategory.Cardio;
                const detail = categoryDetails[item.category];

                return (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-black gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 border border-ink inline-block shrink-0" style={{ backgroundColor: item.hex }} />
                        <span className="text-ink whitespace-nowrap">{item.zh}</span>
                        <span className="text-[10px] text-ink/50 shrink-0">({item.workoutCount} 次训练)</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCardio ? (
                          <span className="text-ink font-black italic whitespace-nowrap">
                            {detail?.cardioVolumeMetrics?.effectiveMinutes || 0} 分钟
                          </span>
                        ) : (
                          <span className="text-ink font-black italic whitespace-nowrap">{item.sets} 组</span>
                        )}
                        {!isCardio && <span className="text-[10px] bg-paper px-1.5 py-0.2 border border-ink text-ink font-black shrink-0 whitespace-nowrap">
                          {item.percentage}%
                        </span>}
                      </div>
                    </div>
                    {/* Visual Bar */}
                    {!isCardio && <div className="w-full h-2 bg-paper overflow-hidden flex border border-ink/30">
                      <div
                        style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                        className={`h-full ${item.color}`}
                      />
                    </div>}
                  </div>
                );
              })}
              <div className="pt-1.5 text-right">
                <span className="text-[10px] sm:text-[11px] font-black text-ink/60">
                  近 {volumeTimeframe} 天累计完成 <span className="text-ink font-black">{recentWorkoutsCount}</span> 次打卡 · <span className="text-ink font-black">{recentSetsCount}</span> 组动作
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 border-2 border-dashed border-ink/20">
              <Zap size={22} className="text-ink/20 mx-auto mb-1.5" />
              <p className="text-ink/40 font-medium text-xs">
                近 {volumeTimeframe} 天暂无训练数据，开启你的第一练吧！
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(TrainingTrendsCard);
