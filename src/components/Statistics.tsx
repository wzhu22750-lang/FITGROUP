import { useState, useEffect, useMemo } from 'react';
import {
  getCurrentUser,
  syncUserStatsFromLogs,
  subscribeToUserProfile,
  subscribeToLeaderboard,
  subscribeToUserWorkoutLogs,
} from '../api';
import { UserProfile, WorkoutCategory, WorkoutLog } from '../types';
import {
  Trophy,
  Flame,
  Target,
  TrendingUp,
  Award,
  User as UserIcon,
  Activity,
  Zap,
  HelpCircle,
  Dumbbell,
  Scale,
  Sparkles,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  calculateFullWorkoutAnalytics,
  resolveExerciseMuscles,
  findExerciseStandard,
  getStrengthTier,
} from '../utils/workoutAnalytics';
import { STRENGTH_TIERS, EXERCISE_STANDARDS } from '../constants/strengthStandards';
import { CATEGORY_META } from '../constants/workoutPresets';

// Representative exercises shown in the standards modal table (data comes from EXERCISE_STANDARDS, never hand-maintained)
const STANDARDS_TABLE_EXERCISES = ['杠铃平板卧推', '坐姿哑铃推举', '高位下拉', '传统硬拉', '杠铃深蹲'];

export default function Statistics() {
  const cached = getCurrentUser();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cached as any);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [groupStats, setGroupStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(!cached);

  // Toggle radar view: composite (strength + activity) vs pure strength PR
  const [radarMode, setRadarMode] = useState<'composite' | 'strength'>('composite');
  // Timeframe for volume distribution: 7 days vs 30 days
  const [volumeTimeframe, setVolumeTimeframe] = useState<7 | 30>(30);
  // Filter for PR list
  const [selectedPrCategory, setSelectedPrCategory] = useState<WorkoutCategory | 'ALL'>('ALL');
  // Standards modal
  const [showStandardsModal, setShowStandardsModal] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Real-time listener for current user's profile and stats
    const unsubProfile = subscribeToUserProfile(user.uid, (profile) => {
      setUserProfile(profile as any);
      setLoading(false);
    });

    // 2. Real-time listener for user's own workout logs
    const unsubLogs = subscribeToUserWorkoutLogs(user.uid, (logs) => {
      setWorkoutLogs(logs as WorkoutLog[]);
      setLoading(false);
    });

    // 3. Real-time listener for group leaderboard
    const unsubLeaderboard = subscribeToLeaderboard((leaderboard) => {
      setGroupStats(leaderboard);
    }, 5);

    // 4. Background verification
    void syncUserStatsFromLogs(user.uid).catch((err) => {
      console.warn('Background stats verification:', err);
    });

    return () => {
      unsubProfile?.();
      unsubLogs?.();
      unsubLeaderboard?.();
    };
  }, []);

  // Compute full analytics data
  const analytics = useMemo(() => {
    const prs = (userProfile?.prs || {}) as Record<string, number>;
    return calculateFullWorkoutAnalytics(workoutLogs, prs, volumeTimeframe);
  }, [workoutLogs, userProfile?.prs, volumeTimeframe]);

  // Compute 30-day analytics for top overview (reuse main analytics when already on 30d)
  const overviewAnalytics = useMemo(() => {
    if (volumeTimeframe === 30) return analytics;
    const prs = (userProfile?.prs || {}) as Record<string, number>;
    return calculateFullWorkoutAnalytics(workoutLogs, prs, 30);
  }, [analytics, volumeTimeframe, workoutLogs, userProfile?.prs]);

  const radarChartData = useMemo(() => {
    return analytics.radarData.map((d) => ({
      subject: d.subject,
      score: radarMode === 'composite' ? d.composite : d.strength,
      composite: d.composite,
      strength: d.strength,
      activity: d.activity,
      fullMark: 100,
    }));
  }, [analytics.radarData, radarMode]);

  const filteredPrs = useMemo(() => {
    if (selectedPrCategory === 'ALL') {
      return analytics.categorizedPrs;
    }
    return analytics.categorizedPrs.filter((p) => p.category === selectedPrCategory);
  }, [analytics.categorizedPrs, selectedPrCategory]);

  const hasAnyData =
    (userProfile?.totalWorkouts && userProfile.totalWorkouts > 0) ||
    workoutLogs.length > 0 ||
    Object.keys(userProfile?.prs || {}).length > 0;

  if (loading) {
    return (
      <div className="p-12 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="inline-block"
        >
          <Activity size={36} className="text-ink" />
        </motion.div>
        <p className="mt-4 font-black uppercase text-xs tracking-widest text-ink/60">
          Loading Analytics...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* 1. Top Stat Cards (4 Tiles) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neon p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-ink"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Active Streak</span>
            <Flame size={16} className="fill-current text-ink" />
          </div>
          <div className="text-3xl font-black italic">{userProfile?.streak || 0} <span className="text-xs uppercase font-bold not-italic">DAYS</span></div>
        </motion.div>

        {/* Total Workouts */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-ink p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(223,255,0,1)] text-white"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Total Workouts</span>
            <Award size={16} className="text-neon" />
          </div>
          <div className="text-3xl font-black italic text-neon">
            {userProfile?.totalWorkouts || 0} <span className="text-xs uppercase font-bold text-white not-italic">TIMES</span>
          </div>
        </motion.div>

        {/* Monthly Sets Volume */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-ink"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-ink/70">30D Sets / 组数</span>
            <Layers size={16} className="text-ink" />
          </div>
          <div className="text-3xl font-black italic">
            {overviewAnalytics.recentSetsCount} <span className="text-xs uppercase font-bold text-ink/60 not-italic">SETS</span>
          </div>
        </motion.div>

        {/* Balance Rating */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-paper p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-ink"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-ink/70">Balance / 均衡度</span>
            <Scale size={16} className="text-ink" />
          </div>
          <div className="text-xl font-black truncate mt-1">
            <span className="bg-ink text-neon px-2 py-0.5 text-xs font-black tracking-tight inline-block">
              {overviewAnalytics.insights.balanceLevel}
            </span>
          </div>
        </motion.div>
      </div>

      {/* 2. Ability Radar / 6-Dimension Strength Radar */}
      <div className="bg-white p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-black text-ink uppercase tracking-tight flex items-center gap-2 italic text-base">
            <Target size={20} className="text-ink" />
            Ability Radar / 六维能力图谱
          </h3>
          <button
            type="button"
            onClick={() => setShowStandardsModal(true)}
            className="flex items-center gap-1 text-[11px] font-black text-ink/70 hover:text-ink bg-paper px-2 py-1 border-2 border-ink cursor-pointer transition-colors"
          >
            <HelpCircle size={13} />
            <span>力量分档标准</span>
          </button>
        </div>

        {/* Mode Switcher: Composite vs Pure Strength PR */}
        <div className="flex bg-paper p-1 border-2 border-ink mb-4 gap-1">
          <button
            type="button"
            onClick={() => setRadarMode('composite')}
            className={`flex-1 py-1.5 text-xs font-black transition-all cursor-pointer ${
              radarMode === 'composite'
                ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            综合能力指数 (力量70% + 活跃30%)
          </button>
          <button
            type="button"
            onClick={() => setRadarMode('strength')}
            className={`flex-1 py-1.5 text-xs font-black transition-all cursor-pointer ${
              radarMode === 'strength'
                ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            极限力量水平 (纯PR分档)
          </button>
        </div>

        {hasAnyData ? (
          <div>
            <div className="h-[270px] w-full relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarChartData}>
                  <PolarGrid stroke="#e2e8f0" strokeWidth={1.5} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: '#000', fontSize: 11, fontWeight: '900' }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tickCount={6}
                    stroke="#94a3b8"
                    tick={{ fontSize: 9, fill: '#64748b' }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      const tier = getStrengthTier(data.score);
                      return (
                        <div className="bg-ink text-white p-3 border-2 border-neon text-xs font-black shadow-[4px_4px_0px_0px_rgba(223,255,0,1)]">
                          <p className="text-neon font-black text-sm mb-1">{data.subject}</p>
                          <p>当前评分: <span className="text-neon text-sm">{data.score} 分</span> ({tier.zh})</p>
                          <p className="text-[10px] text-white/70 mt-1">
                            力量PR: {data.strength}分 · 近期活跃: {data.activity}分
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Radar
                    name="能力评分"
                    dataKey="score"
                    stroke="#000"
                    fill="#DFFF00"
                    fillOpacity={0.75}
                    strokeWidth={2.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* 6 Category Breakdown Grid */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t-2 border-paper">
              {Object.values(WorkoutCategory).map((cat) => {
                const detail = analytics.categoryDetails[cat];
                const meta = CATEGORY_META[cat];
                const score = radarMode === 'composite' ? detail.compositeScore : detail.strengthScore;
                return (
                  <div
                    key={cat}
                    className="p-2.5 bg-paper border-2 border-ink flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-xs text-ink">{meta.zh}</span>
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.2 border border-ink ${detail.tier.badgeBg} ${detail.tier.badgeText}`}
                      >
                        {detail.tier.zh}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-lg font-black italic">{score} <span className="text-[10px] text-ink/60 not-italic">分</span></span>
                      {detail.bestRecordText && (
                        <span className="text-[10px] font-bold text-ink/70 truncate max-w-[55%]" title={detail.bestExerciseName}>
                          {detail.bestRecordText}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-[250px] flex items-center justify-center border-2 border-dashed border-ink/20">
            <div className="text-center p-6">
              <Target size={36} className="text-ink/20 mx-auto mb-3" />
              <p className="font-black text-ink/40 uppercase text-sm italic">
                完成第一次打卡后解锁全维度能力雷达
              </p>
              <p className="text-xs text-ink/40 mt-1">
                支持复合动作自动按比例映射至各主要部位
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Smart Balance & Training Insights Card */}
      {hasAnyData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-paper p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-ink text-neon border-2 border-ink">
              <Sparkles size={16} />
            </div>
            <h3 className="font-black text-ink uppercase tracking-tight text-sm">
              Smart Insights / 训练分析与进阶建议
            </h3>
          </div>

          <div className="space-y-2 text-xs font-bold text-ink/80 leading-relaxed">
            {analytics.insights.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2 bg-white p-2.5 border-2 border-ink">
                <span className="bg-neon text-ink font-black text-[10px] px-1 border border-ink shrink-0 mt-0.5">
                  优势
                </span>
                <span>{h}</span>
              </div>
            ))}

            {analytics.insights.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 bg-white p-2.5 border-2 border-ink">
                <span className="bg-ink text-neon font-black text-[10px] px-1 border border-ink shrink-0 mt-0.5">
                  建议
                </span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 4. Muscle Volume & Sets Distribution */}
      <div className="bg-white p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-black text-ink uppercase tracking-tight flex items-center gap-2 italic text-base">
            <Zap size={18} className="text-ink" />
            Training Volume / 训练容量分布
          </h3>
          <div className="flex bg-paper border-2 border-ink p-0.5">
            <button
              type="button"
              onClick={() => setVolumeTimeframe(7)}
              className={`px-2.5 py-1 text-[10px] font-black cursor-pointer transition-all ${
                volumeTimeframe === 7 ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
              }`}
            >
              近 7 天
            </button>
            <button
              type="button"
              onClick={() => setVolumeTimeframe(30)}
              className={`px-2.5 py-1 text-[10px] font-black cursor-pointer transition-all ${
                volumeTimeframe === 30 ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
              }`}
            >
              近 30 天
            </button>
          </div>
        </div>

        {analytics.recentSetsCount > 0 ? (
          <div className="space-y-3">
            {analytics.volumeDistribution.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-black">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 border border-ink inline-block" style={{ backgroundColor: item.hex }} />
                    <span className="text-ink">{item.zh}</span>
                    <span className="text-[10px] text-ink/50">({item.workoutCount} 次训练)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-ink font-black italic">{item.sets} 组</span>
                    <span className="text-[10px] bg-paper px-1.5 py-0.2 border border-ink text-ink font-black">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                {/* Visual Bar */}
                <div className="w-full h-3 bg-paper border-2 border-ink overflow-hidden flex">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`h-full ${item.color}`}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2 text-right">
              <span className="text-[11px] font-black text-ink/60">
                近 {volumeTimeframe} 天累计完成 <span className="text-ink font-black">{analytics.recentWorkoutsCount}</span> 次打卡 · <span className="text-ink font-black">{analytics.recentSetsCount}</span> 组动作
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 border-2 border-dashed border-ink/20">
            <Activity size={24} className="text-ink/20 mx-auto mb-2" />
            <p className="text-ink/40 font-black uppercase text-xs italic">
              近 {volumeTimeframe} 天暂无训练数据，开启你的第一练吧！
            </p>
          </div>
        )}
      </div>

      {/* 5. Personal Records (PR) / Categorized Benchmark Standards */}
      <div className="bg-white p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-ink uppercase tracking-tight flex items-center gap-2 italic text-base">
            <TrendingUp size={20} className="text-ink" />
            Personal Records / 巅峰档案
          </h3>
        </div>

        {/* PR Category Filter Bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedPrCategory('ALL')}
            className={`px-3 py-1 text-xs font-black uppercase shrink-0 border-2 border-ink cursor-pointer transition-all ${
              selectedPrCategory === 'ALL'
                ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-white text-ink/70 hover:bg-paper'
            }`}
          >
            全部 ({analytics.categorizedPrs.length})
          </button>
          {Object.values(WorkoutCategory).map((cat) => {
            const count = analytics.categorizedPrs.filter((p) => p.category === cat).length;
            const isSelected = selectedPrCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedPrCategory(cat)}
                className={`px-3 py-1 text-xs font-black uppercase shrink-0 border-2 border-ink cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white text-ink/70 hover:bg-paper'
                }`}
              >
                {CATEGORY_META[cat].zh} ({count})
              </button>
            );
          })}
        </div>

        {/* PR Cards List */}
        <div className="space-y-2.5">
          {filteredPrs.length > 0 ? (
            filteredPrs.map((pr) => (
              <div
                key={pr.name}
                className="p-3.5 bg-paper border-2 border-ink flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-black text-ink text-sm tracking-tight truncate" title={pr.name}>
                      {pr.name}
                    </span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 border border-ink shrink-0 ${pr.tier.badgeBg} ${pr.tier.badgeText}`}
                    >
                      {pr.tier.zh}
                    </span>
                  </div>
                  <div className="bg-ink text-neon font-black px-2.5 py-1 text-xs italic shrink-0 whitespace-nowrap border-2 border-ink">
                    {pr.weight} {pr.unit.toUpperCase()}
                  </div>
                </div>

                {/* Milestone Next Goal Hint */}
                {pr.nextMilestone ? (
                  <div className="flex items-center justify-between text-[11px] font-bold text-ink/70 bg-white p-2 border border-ink/30">
                    <span className="flex items-center gap-1">
                      <ArrowUpRight size={13} className="text-ink" />
                      下一档位: <strong className="text-ink">{pr.nextMilestone.nextTier.zh} ({pr.nextMilestone.targetWeight} {pr.unit})</strong>
                    </span>
                    <span className="text-ink font-black">
                      还差 +{pr.nextMilestone.deltaWeight} {pr.unit}
                    </span>
                  </div>
                ) : (
                  <div className="text-[10px] font-bold text-amber-900 bg-amber-50 p-1.5 border border-amber-300">
                    🏆 已达成精英级顶尖力量标准！
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-ink/20">
              <Award size={24} className="text-ink/20 mx-auto mb-2" />
              <p className="text-ink/30 font-black uppercase text-sm italic">
                {selectedPrCategory === 'ALL' ? '打卡记录重量将自动录入 PR 档案' : '该部位暂无 PR 记录'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 6. Leaderboard */}
      <div className="bg-white p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="font-black text-ink uppercase tracking-tight flex items-center gap-2 mb-4 italic text-base">
          <Trophy size={20} className="text-ink fill-current" />
          LEADERBOARD / 群组榜单
        </h3>
        <div className="space-y-3">
          {groupStats.length > 0 ? (
            groupStats.map((u, i) => (
              <div
                key={u.uid}
                className="flex items-center justify-between border-b-2 border-paper pb-2 last:border-0 last:pb-0 gap-2"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-6 h-6 border-2 border-ink flex items-center justify-center font-black text-xs shrink-0 ${
                      i === 0 ? 'bg-neon text-ink' : i === 1 ? 'bg-slate-200' : i === 2 ? 'bg-amber-100' : 'bg-paper text-ink'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="border-2 border-ink p-0.5 shrink-0">
                    {u.photoURL ? (
                      <img src={u.photoURL} className="w-8 h-8 object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-paper flex items-center justify-center">
                        <UserIcon size={14} className="text-ink/30" />
                      </div>
                    )}
                  </div>
                  <span
                    className="font-black text-ink uppercase tracking-tight truncate text-sm"
                    title={u.displayName}
                  >
                    {u.displayName}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-ink text-white px-2.5 py-1 italic font-black text-xs shrink-0 whitespace-nowrap">
                  <Flame size={12} className="text-neon fill-current shrink-0" />
                  <span>{u.streak} 天</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center py-4 text-ink/30 font-black italic text-sm uppercase">暂无数据</p>
          )}
        </div>
      </div>

      {/* 7. Standards Explanation Modal */}
      <AnimatePresence>
        {showStandardsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-4 border-ink p-5 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex items-center justify-between pb-3 border-b-2 border-ink mb-4">
                <div className="flex items-center gap-2">
                  <div className="bg-neon p-1 border-2 border-ink">
                    <Scale size={18} className="text-ink" />
                  </div>
                  <h4 className="font-black text-ink text-base uppercase">专业力量 5 档进阶标准</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStandardsModal(false)}
                  className="font-black text-ink p-1 hover:bg-paper border-2 border-transparent hover:border-ink cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs font-bold text-ink">
                <p className="text-ink/80 leading-relaxed">
                  系统采用国际力量标准（StrengthLevel / NSCA），各动作难度按等效力量系数对齐（例如：<strong>杠铃卧推 30kg ≈ 哑铃推肩 8kg ≈ 传统硬拉 50kg</strong> 均属同档新手起步），实现跨动作科学评分。
                </p>

                <div className="space-y-2">
                  {Object.values(STRENGTH_TIERS).map((t) => (
                    <div key={t.key} className="p-2.5 border-2 border-ink bg-paper flex items-start gap-2.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 border border-ink shrink-0 ${t.badgeBg} ${t.badgeText}`}>
                        {t.zh} ({t.score}分)
                      </span>
                      <span className="text-ink/80 text-[11px] leading-snug">{t.description}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t-2 border-ink pt-3">
                  <h5 className="font-black text-ink text-xs uppercase mb-2">代表动作各档位参考对照</h5>
                  <div className="overflow-x-auto border-2 border-ink">
                    <table className="w-full text-[10px] text-left">
                      <thead className="bg-ink text-white font-black">
                        <tr>
                          <th className="p-1.5">动作</th>
                          <th className="p-1.5">新手</th>
                          <th className="p-1.5">入门</th>
                          <th className="p-1.5">进阶</th>
                          <th className="p-1.5">熟练</th>
                          <th className="p-1.5">精英</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/20">
                        {STANDARDS_TABLE_EXERCISES.map((name) => {
                          const std = findExerciseStandard(name);
                          if (!std) return null;
                          return (
                            <tr key={std.name}>
                              <td className="p-1.5 font-black">{std.name}</td>
                              {std.thresholds.map((t) => (
                                <td key={t} className="p-1.5">
                                  {t}
                                  {std.unit}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowStandardsModal(false)}
                  className="w-full bg-ink text-neon border-2 border-ink py-2.5 font-black uppercase text-xs cursor-pointer hover:bg-black/80 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  我知道了
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
