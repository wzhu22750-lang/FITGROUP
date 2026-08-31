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
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Layers,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import {
  calculateFullWorkoutAnalytics,
  resolveExerciseMuscles,
  findExerciseStandard,
  getStrengthTier,
  bodyContextFromProfile,
  scaleThresholds,
  CategoryScoreDetail,
} from '../utils/workoutAnalytics';
import { STRENGTH_TIERS, EXERCISE_STANDARDS } from '../constants/strengthStandards';
import { CATEGORY_META } from '../constants/workoutPresets';
import {
  CATEGORY_SUB_MUSCLES,
  SUB_MUSCLE_WEIGHTS,
  EXERCISE_MUSCLE_COEFFICIENTS,
  SCORE_WEIGHTS,
  DEFAULT_CARDIO_CALORIE_TARGET,
  VOLUME_TARGET_PER_WEEK,
} from '../constants/muscleCoefficients';

// Representative exercises shown in the standards modal table
const STANDARDS_TABLE_EXERCISES = ['杠铃平板卧推', '坐姿哑铃推举', '高位下拉', '传统硬拉', '杠铃深蹲'];

export default function Statistics() {
  const cached = getCurrentUser();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cached as any);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [groupStats, setGroupStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(!cached);

  // Toggle radar view: Training Capacity Index (28-day volume+freq+weight) vs Pure Strength PR
  const [radarMode, setRadarMode] = useState<'composite' | 'strength'>('composite');
  // Chart visualization style: Radar Polygon vs 6-Dimension Progress Bars
  const [chartView, setChartView] = useState<'radar' | 'bars'>('radar');
  // Timeframe for volume distribution: 7 days vs 28 days
  const [volumeTimeframe, setVolumeTimeframe] = useState<7 | 28>(28);
  // Filter for PR list
  const [selectedPrCategory, setSelectedPrCategory] = useState<WorkoutCategory | 'ALL'>('ALL');
  // Standards modal & active tab
  const [showStandardsModal, setShowStandardsModal] = useState(false);
  const [modalTab, setModalTab] = useState<'rules' | 'tiers'>('rules');
  const [standardsTableMode, setStandardsTableMode] = useState<'personalized' | 'anchor'>('personalized');

  // Category Sub-muscle detail modal
  const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<WorkoutCategory | null>(null);

  // Collapsible sections - all collapsed by default as requested
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isPrsOpen, setIsPrsOpen] = useState(false);

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

  // Extract body context for strength scoring
  const bodyContext = useMemo(() => {
    return bodyContextFromProfile(userProfile);
  }, [userProfile?.sex, userProfile?.bodyweightKg]);

  // Compute full analytics data for 7/28 days
  const analytics = useMemo(() => {
    const prs = (userProfile?.prs || {}) as Record<string, number>;
    return calculateFullWorkoutAnalytics(workoutLogs, prs, volumeTimeframe, bodyContext);
  }, [workoutLogs, userProfile?.prs, volumeTimeframe, bodyContext]);

  // Compute 28-day analytics for top overview
  const overviewAnalytics = useMemo(() => {
    if (volumeTimeframe === 28) return analytics;
    const prs = (userProfile?.prs || {}) as Record<string, number>;
    return calculateFullWorkoutAnalytics(workoutLogs, prs, 28, bodyContext);
  }, [analytics, volumeTimeframe, workoutLogs, userProfile?.prs, bodyContext]);

  const radarChartData = useMemo(() => {
    const rawItems = analytics.radarData.map((d) => {
      const rawScore = radarMode === 'composite' ? d.composite : d.strength;
      // Visual baseline offset of 6 pts prevents 0-score dimensions from collapsing into a dead center needle
      const visualScore = rawScore === 0 ? 6 : rawScore;
      return {
        subject: d.subject,
        score: visualScore,
        rawScore,
        composite: d.composite,
        strength: d.strength,
        activity: d.activity,
        benchmark: 40,
        fullMark: 100,
        category: d.category,
      };
    });

    // Dynamic Adjacent Clustering:
    // Place all active/trained dimensions (score > 0) in contiguous adjacent positions,
    // followed by unactivated dimensions on the remaining side.
    const active = rawItems.filter((item) => item.rawScore > 0);
    const inactive = rawItems.filter((item) => item.rawScore === 0);

    if (active.length > 0 && inactive.length > 0) {
      // Sort active dimensions so strongest are connected together in a solid contiguous polygon
      active.sort((a, b) => b.rawScore - a.rawScore);
      return [...active, ...inactive];
    }

    return rawItems;
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

  const selectedCategoryDetail = selectedCategoryForModal
    ? analytics.categoryDetails[selectedCategoryForModal]
    : null;

  // Find exercises related to selected category for drill-down modal
  const selectedCategoryExercises = useMemo(() => {
    if (!selectedCategoryForModal) return [];
    return EXERCISE_MUSCLE_COEFFICIENTS.filter(
      (entry) => entry.primaryCategory === selectedCategoryForModal
    );
  }, [selectedCategoryForModal]);

  return (
    <div className="space-y-6 pb-8">
      {/* 0. Top Stat Cards (4 Tiles Overview) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Streak */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neon p-3.5 sm:p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-ink"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Active Streak</span>
            <Flame size={16} className="fill-current text-ink" />
          </div>
          <div className="text-2xl sm:text-3xl font-black italic">{userProfile?.streak || 0} <span className="text-xs uppercase font-bold not-italic">DAYS</span></div>
        </motion.div>

        {/* Total Workouts */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-ink p-3.5 sm:p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(223,255,0,1)] text-white"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Total Workouts</span>
            <Award size={16} className="text-neon" />
          </div>
          <div className="text-2xl sm:text-3xl font-black italic text-neon">
            {userProfile?.totalWorkouts || 0} <span className="text-xs uppercase font-bold text-white not-italic">TIMES</span>
          </div>
        </motion.div>

        {/* Monthly Sets Volume */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-3.5 sm:p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-ink"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-ink/70">28D Sets / 组数</span>
            <Layers size={16} className="text-ink" />
          </div>
          <div className="text-2xl sm:text-3xl font-black italic">
            {overviewAnalytics.recentSetsCount} <span className="text-xs uppercase font-bold text-ink/60 not-italic">SETS</span>
          </div>
        </motion.div>

        {/* Balance Rating */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-paper p-3.5 sm:p-4 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-ink"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-ink/70">Balance / 均衡度</span>
            <Scale size={16} className="text-ink" />
          </div>
          <div className="text-lg sm:text-xl font-black truncate mt-1">
            <span className="bg-ink text-neon px-2 py-0.5 text-xs font-black tracking-tight inline-block">
              {overviewAnalytics.insights.balanceLevel}
            </span>
          </div>
        </motion.div>
      </div>

      {/* 1. LEADERBOARD / 群组榜单 */}
      <div className="bg-white p-4 sm:p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="font-black text-ink uppercase tracking-tight flex items-center gap-2 mb-3.5 italic text-sm sm:text-base">
          <Trophy size={18} className="text-ink fill-current shrink-0" />
          <span>群组榜单 <span className="text-xs text-ink/50 font-normal not-italic ml-0.5">/ LEADERBOARD</span></span>
        </h3>
        <div className="space-y-2.5">
          {groupStats.length > 0 ? (
            groupStats.map((u, i) => (
              <div
                key={u.uid}
                className="flex items-center justify-between border-b-2 border-paper pb-2 last:border-0 last:pb-0 gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-6 h-6 border-2 border-ink flex items-center justify-center font-black text-xs shrink-0 ${
                      i === 0 ? 'bg-neon text-ink' : i === 1 ? 'bg-slate-200' : i === 2 ? 'bg-amber-100' : 'bg-paper text-ink'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="border-2 border-ink p-0.5 shrink-0">
                    {u.photoURL ? (
                      <img src={u.photoURL} className="w-7 h-7 sm:w-8 sm:h-8 object-cover" />
                    ) : (
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-paper flex items-center justify-center">
                        <UserIcon size={14} className="text-ink/30" />
                      </div>
                    )}
                  </div>
                  <span
                    className="font-black text-ink uppercase tracking-tight truncate text-xs sm:text-sm"
                    title={u.displayName}
                  >
                    {u.displayName}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-ink text-white px-2.5 py-1 italic font-black text-[11px] sm:text-xs shrink-0 whitespace-nowrap">
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

      {/* 1.5 Incomplete Profile Banner */}
      {(!userProfile?.sex || !userProfile?.bodyweightKg) && (
        <div className="bg-neon/20 border-4 border-ink p-3 sm:p-3.5 flex items-start sm:items-center justify-between gap-2.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <Info size={18} className="text-ink shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs font-black text-ink leading-tight sm:leading-normal">
              完善性别与体重后，极限力量分将按你的个人身体条件精准计算
            </p>
          </div>
          <span className="text-[10px] font-black bg-ink text-neon px-2 py-0.5 whitespace-nowrap shrink-0 border border-ink self-start sm:self-center">
            {userProfile?.sex ? `${userProfile.sex === 'female' ? '女' : '男'} · 缺体重` : userProfile?.bodyweightKg ? `${userProfile.bodyweightKg}kg · 缺性别` : '未完善身体数据'}
          </span>
        </div>
      )}

      {/* 2. Ability Radar / 六维能力图谱 (Mobile responsive) */}
      <div className="bg-white p-4 sm:p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="font-black text-ink uppercase tracking-tight flex items-center gap-1 sm:gap-1.5 italic text-xs sm:text-base min-w-0">
            <Target size={16} className="text-ink shrink-0 sm:w-[18px] sm:h-[18px]" />
            <span className="truncate">能力图谱 <span className="text-[10px] sm:text-xs text-ink/50 font-normal not-italic ml-0.5">/ SPECTRUM</span></span>
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Switcher: Radar vs Bars */}
            <div className="flex border-2 border-ink bg-paper p-0.5">
              <button
                type="button"
                onClick={() => setChartView('radar')}
                className={`px-2 py-0.5 text-[10px] font-black uppercase transition-all cursor-pointer ${
                  chartView === 'radar' ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(0,0,0,0.5)]' : 'text-ink/60 hover:text-ink'
                }`}
                title="雷达图视图"
              >
                雷达
              </button>
              <button
                type="button"
                onClick={() => setChartView('bars')}
                className={`px-2 py-0.5 text-[10px] font-black uppercase transition-all cursor-pointer ${
                  chartView === 'bars' ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(0,0,0,0.5)]' : 'text-ink/60 hover:text-ink'
                }`}
                title="条形进度明细视图"
              >
                条形
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowStandardsModal(true)}
              className="flex items-center gap-1 text-[10px] sm:text-[11px] font-black text-ink/80 hover:text-ink bg-paper px-1.5 sm:px-2 py-1 border-2 border-ink cursor-pointer transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 shrink-0 whitespace-nowrap"
            >
              <HelpCircle size={12} className="shrink-0" />
              <span>标准</span>
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-paper p-1 border-2 border-ink mb-3 gap-1">
          <button
            type="button"
            onClick={() => setRadarMode('composite')}
            className={`flex-1 py-1.5 px-1 text-[11px] sm:text-xs font-black transition-all cursor-pointer text-center truncate ${
              radarMode === 'composite'
                ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            训练能力指数
          </button>
          <button
            type="button"
            onClick={() => setRadarMode('strength')}
            className={`flex-1 py-1.5 px-1 text-[11px] sm:text-xs font-black transition-all cursor-pointer text-center truncate ${
              radarMode === 'strength'
                ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            极限力量水平
          </button>
        </div>

        {hasAnyData ? (
          <div>
            {chartView === 'radar' ? (
              /* Responsive Radar chart */
              <div className="h-[250px] sm:h-[270px] w-full relative">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={230}>
                  <RadarChart cx="50%" cy="50%" outerRadius="66%" data={radarChartData}>
                    <PolarGrid stroke="#e2e8f0" strokeWidth={1.5} />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: '#000', fontSize: 10, fontWeight: '900' }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tickCount={6}
                      stroke="#94a3b8"
                      tick={{ fontSize: 8, fill: '#64748b' }}
                    />
                    {/* Benchmark Polygon (进阶均衡基准 40分) */}
                    <Radar
                      name="进阶参考 (40分)"
                      dataKey="benchmark"
                      stroke="#cbd5e1"
                      strokeDasharray="3 3"
                      fill="#f8fafc"
                      fillOpacity={0.4}
                      strokeWidth={1.5}
                    />
                    {/* User Ability Polygon */}
                    <Radar
                      name="能力评分"
                      dataKey="score"
                      stroke="#000"
                      fill="#DFFF00"
                      fillOpacity={0.75}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={false}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              /* 6-Dimension Progress Bars View (Linear & clean for asymmetric training) */
              <div className="py-2 space-y-2 mb-2">
                {Object.values(WorkoutCategory).map((cat) => {
                  const detail = analytics.categoryDetails[cat];
                  const meta = CATEGORY_META[cat];
                  const score = radarMode === 'composite' ? detail.compositeScore : detail.strengthScore;
                  const tier = getStrengthTier(score);
                  const isZero = score === 0;

                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategoryForModal(cat)}
                      className="w-full bg-paper hover:bg-white border-2 border-ink p-2 sm:p-2.5 flex flex-col gap-1.5 transition-all text-left cursor-pointer group shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5"
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
                            {isZero ? '待激活' : tier.zh}
                          </span>
                          <span className="text-xs font-black italic">
                            {score} <span className="text-[9px] text-ink/50 not-italic">分</span>
                          </span>
                          <ChevronRight size={12} className="text-ink/40 group-hover:text-ink transition-colors" />
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-ink/10 border border-ink h-2.5 overflow-hidden p-0.5 relative">
                        <div
                          className={`h-full transition-all duration-500 ${
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t-2 border-paper">
              {Object.values(WorkoutCategory).map((cat) => {
                const detail = analytics.categoryDetails[cat];
                const meta = CATEGORY_META[cat];
                const score = radarMode === 'composite' ? detail.compositeScore : detail.strengthScore;
                const tier = getStrengthTier(score);

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategoryForModal(cat)}
                    className="p-2.5 bg-paper border-2 border-ink flex flex-col gap-1 text-left cursor-pointer transition-all hover:bg-white hover:border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 group"
                  >
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <span className="font-black text-xs text-ink flex items-center gap-0.5 truncate">
                        {meta.zh}
                        <ChevronRight size={11} className="text-ink/40 group-hover:text-ink transition-colors shrink-0" />
                      </span>
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.2 border border-ink shrink-0 whitespace-nowrap ${tier.badgeBg} ${tier.badgeText}`}
                      >
                        {score === 0 ? '待激活' : tier.zh}
                      </span>
                    </div>

                    <div className="text-lg font-black italic leading-none">
                      {score} <span className="text-[10px] text-ink/60 not-italic">分</span>
                    </div>

                    {/* Breakdown indicators */}
                    {cat === WorkoutCategory.Cardio ? (
                      <div className="text-[10px] font-bold text-ink/70 truncate">
                        {detail.cardioCalories?.actual ? `${detail.cardioCalories.actual} kcal` : '0 kcal'}
                      </div>
                    ) : (
                      <div className="text-[9px] font-bold text-ink/60 truncate flex items-center gap-1">
                        <span>频{detail.frequencyScore ?? 0}</span>
                        <span>·</span>
                        <span>容{detail.volumeScore ?? 0}</span>
                        <span>·</span>
                        <span>重{detail.weightScore ?? 0}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-ink/50 text-right mt-2 font-bold">
              💡 点击任意部位卡片可查看前中后束等肌群细分指标
            </p>
          </div>
        ) : (
          <div className="h-[230px] flex items-center justify-center border-2 border-dashed border-ink/20">
            <div className="text-center p-6">
              <Target size={32} className="text-ink/20 mx-auto mb-2" />
              <p className="font-black text-ink/40 uppercase text-xs italic">
                完成第一次打卡后解锁全维度能力雷达
              </p>
              <p className="text-[11px] text-ink/40 mt-1">
                支持复合动作自动按比例映射至各主要部位
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Training Load / 训练负荷分布 */}
      <div className="bg-white p-4 sm:p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-3.5 gap-2">
          <h3 className="font-black text-ink uppercase tracking-tight flex items-center gap-1 sm:gap-1.5 italic text-xs sm:text-base min-w-0">
            <Zap size={16} className="text-ink shrink-0 sm:w-[18px] sm:h-[18px]" />
            <span className="truncate">训练负荷分布<span className="text-[10px] sm:text-xs text-ink/50 font-normal not-italic ml-0.5 hidden min-[380px]:inline"> / LOAD</span></span>
          </h3>
          <div className="flex bg-paper border-2 border-ink p-0.5 shrink-0 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setVolumeTimeframe(7)}
              className={`px-2 py-0.5 text-[10px] font-black cursor-pointer transition-all ${
                volumeTimeframe === 7 ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
              }`}
            >
              近 7 天
            </button>
            <button
              type="button"
              onClick={() => setVolumeTimeframe(28)}
              className={`px-2 py-0.5 text-[10px] font-black cursor-pointer transition-all ${
                volumeTimeframe === 28 ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
              }`}
            >
              近 28 天
            </button>
          </div>
        </div>

        {analytics.recentSetsCount > 0 ? (
          <div className="space-y-3">
            {analytics.volumeDistribution.map((item) => {
              const isCardio = item.category === WorkoutCategory.Cardio;
              const detail = analytics.categoryDetails[item.category];

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
                          {detail.cardioCalories?.actual || 0} kcal
                        </span>
                      ) : (
                        <span className="text-ink font-black italic whitespace-nowrap">{item.sets} 加权组</span>
                      )}
                      <span className="text-[10px] bg-paper px-1.5 py-0.2 border border-ink text-ink font-black shrink-0 whitespace-nowrap">
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
              );
            })}
            <div className="pt-1.5 text-right">
              <span className="text-[10px] sm:text-[11px] font-black text-ink/60">
                近 {volumeTimeframe} 天累计完成 <span className="text-ink font-black">{analytics.recentWorkoutsCount}</span> 次打卡 · <span className="text-ink font-black">{analytics.recentSetsCount}</span> 组动作
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 border-2 border-dashed border-ink/20">
            <Activity size={24} className="text-ink/20 mx-auto mb-2" />
            <p className="text-ink/40 font-black uppercase text-xs italic">
              近 {volumeTimeframe} 天暂无训练数据，开启你的第一练吧！
            </p>
          </div>
        )}
      </div>

      {/* 4. Personal Records (PR) / 巅峰档案 (Collapsible, Default Collapsed, Tiers Removed) */}
      <div className="bg-white p-4 sm:p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <button
          type="button"
          onClick={() => setIsPrsOpen(!isPrsOpen)}
          className="w-full flex items-center justify-between text-left cursor-pointer group gap-2"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <TrendingUp size={18} className="text-ink shrink-0" />
            <h3 className="font-black text-ink uppercase tracking-tight italic text-sm sm:text-base whitespace-nowrap truncate">
              巅峰档案 <span className="text-xs text-ink/50 font-normal not-italic ml-0.5">/ PR</span>
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-black bg-paper px-2 py-0.5 border-2 border-ink text-ink shrink-0 whitespace-nowrap">
              {analytics.categorizedPrs.length} 项纪录
            </span>
            <div className="p-1 bg-paper border-2 border-ink group-hover:bg-neon transition-colors shrink-0">
              {isPrsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </div>
          </div>
        </button>

        <AnimatePresence>
          {isPrsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="pt-3.5 border-t-2 border-ink/20 mt-3">
                {/* PR Category Filter Bar */}
                <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3.5 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setSelectedPrCategory('ALL')}
                    className={`px-2.5 py-1 text-xs font-black uppercase shrink-0 border-2 border-ink cursor-pointer transition-all ${
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
                        className={`px-2.5 py-1 text-xs font-black uppercase shrink-0 border-2 border-ink cursor-pointer transition-all ${
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

                {/* Clean PR List (Tiers removed as requested) */}
                <div className="space-y-2">
                  {filteredPrs.length > 0 ? (
                    filteredPrs.map((pr) => (
                      <div
                        key={pr.name}
                        className="p-2.5 sm:p-3 bg-paper border-2 border-ink flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-black text-ink text-xs sm:text-sm tracking-tight truncate" title={pr.name}>
                            {pr.name}
                          </span>
                          <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 bg-white border border-ink/40 text-ink/70 shrink-0 whitespace-nowrap">
                            {CATEGORY_META[pr.category]?.zh || pr.category}
                          </span>
                        </div>
                        <div className="bg-ink text-neon font-black px-2.5 py-1 text-xs italic shrink-0 whitespace-nowrap border-2 border-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                          {pr.weight} {pr.unit.toUpperCase()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 border-2 border-dashed border-ink/20">
                      <Award size={22} className="text-ink/20 mx-auto mb-1.5" />
                      <p className="text-ink/30 font-black uppercase text-xs italic">
                        {selectedPrCategory === 'ALL' ? '打卡记录重量将自动录入 PR 档案' : '该部位暂无 PR 记录'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 5. Smart Insights / 训练分析与建议 (Placed at the end, Collapsible, Default Collapsed) */}
      {hasAnyData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-paper p-4 sm:p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <button
            type="button"
            onClick={() => setIsInsightsOpen(!isInsightsOpen)}
            className="w-full flex items-center justify-between text-left cursor-pointer group gap-2"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="p-1 bg-ink text-neon border-2 border-ink shrink-0">
                <Sparkles size={15} />
              </div>
              <h3 className="font-black text-ink uppercase tracking-tight text-xs sm:text-sm whitespace-nowrap truncate">
                训练分析与建议 <span className="text-[10px] text-ink/50 font-normal not-italic ml-0.5">/ INSIGHTS</span>
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black bg-white px-2 py-0.5 border-2 border-ink/40 text-ink/80 shrink-0 whitespace-nowrap">
                {analytics.insights.highlights.length + analytics.insights.recommendations.length} 条建议
              </span>
              <div className="p-1 bg-white border-2 border-ink group-hover:bg-neon transition-colors shrink-0">
                {isInsightsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>
          </button>

          <AnimatePresence>
            {isInsightsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-3.5 space-y-2 text-xs font-bold text-ink/80 leading-relaxed border-t-2 border-ink/20 mt-3">
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
          </AnimatePresence>
        </motion.div>
      )}

      {/* 6. Category Sub-Dimension Drill-Down Modal */}
      <AnimatePresence>
        {selectedCategoryForModal && selectedCategoryDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-4 border-ink p-4 sm:p-5 max-w-lg w-full max-h-[88vh] overflow-y-auto shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex items-center justify-between pb-3 border-b-2 border-ink mb-3.5">
                <div className="flex items-center gap-2">
                  <div className="bg-neon p-1.5 border-2 border-ink font-black text-sm">
                    {CATEGORY_META[selectedCategoryForModal].iconLabel}
                  </div>
                  <div>
                    <h4 className="font-black text-ink text-base uppercase flex items-center gap-1.5">
                      {selectedCategoryDetail.zh}训练深度解析
                      <span className={`text-[9px] font-black px-1.5 py-0.2 border border-ink ${selectedCategoryDetail.tier.badgeBg} ${selectedCategoryDetail.tier.badgeText}`}>
                        {selectedCategoryDetail.tier.zh}
                      </span>
                    </h4>
                    <p className="text-[10px] sm:text-[11px] text-ink/60 font-bold">
                      28天综合得分: <strong className="text-ink">{selectedCategoryDetail.trainingScore} 分</strong> · 极限PR: {selectedCategoryDetail.strengthScore} 分
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryForModal(null)}
                  className="font-black text-ink p-1 hover:bg-paper border-2 border-transparent hover:border-ink cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {selectedCategoryForModal === WorkoutCategory.Cardio ? (
                <div className="space-y-3.5 text-xs font-bold text-ink">
                  <div className="bg-paper p-3 border-2 border-ink space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black">28天有氧消耗目标</span>
                      <span className="font-black text-neon bg-ink px-2 py-0.5 text-xs">
                        {selectedCategoryDetail.cardioCalories?.actual || 0} / {selectedCategoryDetail.cardioCalories?.target || 2000} kcal
                      </span>
                    </div>
                    <div className="w-full h-3 bg-white border-2 border-ink overflow-hidden">
                      <div
                        className="h-full bg-orange-500"
                        style={{ width: `${Math.min(100, selectedCategoryDetail.cardioCalories?.completionRate || 0)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-ink/70">
                      <span>完成度: {selectedCategoryDetail.cardioCalories?.completionRate || 0}%</span>
                      <span>周均训练: {selectedCategoryDetail.weeklyWorkouts || 0} 次/周</span>
                    </div>
                  </div>

                  <p className="text-ink/80 text-[11px] leading-relaxed">
                    有氧维度基于 28 天内累计燃烧的卡路里总量计算，标准目标为 2000 kcal（约折合每周 2-3 次 30 分钟中高强度跑步或单车）。
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5 text-xs font-bold text-ink">
                  {/* Top Formula Hint */}
                  <div className="bg-paper p-2.5 border-2 border-ink text-[11px] text-ink/80">
                    <p className="font-black text-ink mb-0.5">📐 评分计算法则：</p>
                    <p>细分部位得分 = 频率分 (20%) + 容量分 (50%) + 重量进步分 (30%)</p>
                  </div>

                  {/* Sub-muscles breakdown */}
                  <div className="space-y-2">
                    <h5 className="font-black text-ink text-xs uppercase flex items-center justify-between">
                      <span>各子肌群评分明细</span>
                      <span className="text-[10px] text-ink/50 font-normal">加权汇总构成总分</span>
                    </h5>

                    {(selectedCategoryDetail.subMuscleScores || []).map((sm) => (
                      <div key={sm.subMuscle} className="bg-paper p-2.5 sm:p-3 border-2 border-ink space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-sm text-ink">{sm.zh}</span>
                            <span className="text-[9px] bg-white px-1.5 py-0.2 border border-ink/40 text-ink/70 font-black">
                              权重 {Math.round(sm.weight * 100)}%
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-base italic text-ink">{sm.score}</span>
                            <span className="text-[10px] text-ink/60 not-italic ml-0.5">分</span>
                          </div>
                        </div>

                        {/* Three sub metrics */}
                        <div className="grid grid-cols-3 gap-1 pt-0.5 text-[9px] sm:text-[10px]">
                          <div className="bg-white p-1.5 border border-ink/30 text-center">
                            <div className="text-ink/60 font-bold">频率分 (20%)</div>
                            <div className="font-black text-ink mt-0.5">{sm.frequencyScore}分</div>
                            <div className="text-[8px] sm:text-[9px] text-ink/50 font-normal">{sm.weeklyFrequency}次/周</div>
                          </div>
                          <div className="bg-white p-1.5 border border-ink/30 text-center">
                            <div className="text-ink/60 font-bold">容量分 (50%)</div>
                            <div className="font-black text-ink mt-0.5">{sm.volumeScore}分</div>
                            <div className="text-[8px] sm:text-[9px] text-ink/50 font-normal">{sm.weeklyWeightedSets}组/周</div>
                          </div>
                          <div className="bg-white p-1.5 border border-ink/30 text-center">
                            <div className="text-ink/60 font-bold">重量分 (30%)</div>
                            <div className="font-black text-ink mt-0.5">{sm.weightScore}分</div>
                            <div className="text-[8px] sm:text-[9px] text-ink/50 font-normal">历史对比</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Representative Exercises and Coefficient Splits */}
                  {selectedCategoryExercises.length > 0 && (
                    <div className="border-t-2 border-ink pt-2.5 space-y-1.5">
                      <h5 className="font-black text-ink text-xs uppercase">
                        该部位代表动作与肌群分配系数
                      </h5>
                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                        {selectedCategoryExercises.slice(0, 8).map((ex) => (
                          <div key={ex.name} className="flex items-center justify-between bg-white p-2 border border-ink/40 text-[11px]">
                            <span className="font-black text-ink truncate mr-2">{ex.name}</span>
                            <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                              {Object.entries(ex.subMuscles).map(([smKey, ratio]) => (
                                <span key={smKey} className="bg-paper px-1.5 py-0.2 border border-ink/30 text-[9px] font-black">
                                  {smKey}: {Math.round((ratio || 0) * 100)}%
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedCategoryForModal(null)}
                className="w-full mt-3.5 bg-ink text-neon border-2 border-ink py-2.5 font-black uppercase text-xs cursor-pointer hover:bg-black/80 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                返回图谱
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. Standards & Scoring Rules Explanation Modal */}
      <AnimatePresence>
        {showStandardsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-4 border-ink p-4 sm:p-5 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex items-center justify-between pb-2.5 border-b-2 border-ink mb-3">
                <div className="flex items-center gap-2">
                  <div className="bg-neon p-1 border-2 border-ink">
                    <Scale size={16} className="text-ink" />
                  </div>
                  <h4 className="font-black text-ink text-sm sm:text-base uppercase">六维量化规则与进阶标准</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStandardsModal(false)}
                  className="font-black text-ink p-1 hover:bg-paper border-2 border-transparent hover:border-ink cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="flex bg-paper p-1 border-2 border-ink mb-3.5 gap-1">
                <button
                  type="button"
                  onClick={() => setModalTab('rules')}
                  className={`flex-1 py-1.5 text-xs font-black transition-all cursor-pointer ${
                    modalTab === 'rules'
                      ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                      : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  28天训练能力算法
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('tiers')}
                  className={`flex-1 py-1.5 text-xs font-black transition-all cursor-pointer ${
                    modalTab === 'tiers'
                      ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                      : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  5档极限力量标准
                </button>
              </div>

              {modalTab === 'rules' ? (
                <div className="space-y-3 text-xs font-bold text-ink">
                  <div className="bg-paper p-2.5 sm:p-3 border-2 border-ink space-y-1">
                    <p className="font-black text-xs sm:text-sm text-ink">🎯 力量五维通用计算公式</p>
                    <p className="text-ink/80 leading-relaxed text-[11px]">
                      <strong>细分部位分 = 频率分 × 20% + 容量分 × 50% + 重量进步分 × 30%</strong>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                      <span className="font-black text-ink">1. 频率分 (20%)</span>
                      <p className="text-[11px] text-ink/70">
                        每周 0 次 = 0 分 ｜ 每周 1 次 = 50 分 ｜ 每周 2 次 = 75 分 ｜ 每周 3 次及以上 = 100 分。
                      </p>
                    </div>

                    <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                      <span className="font-black text-ink">2. 容量分 (50%)</span>
                      <p className="text-[11px] text-ink/70">
                        按动作刺激系数拆分折算为加权训练组，以每周 <strong>12 个加权正式组</strong> 为 100 分标准。
                      </p>
                    </div>

                    <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                      <span className="font-black text-ink">3. 重量进步分 (30%)</span>
                      <p className="text-[11px] text-ink/70">
                        对比当前 28 天加权负重总量与个人历史基准（过去 4-8 周）的变化，无历史基准时默认 50 分。
                      </p>
                    </div>

                    <div className="bg-white p-2.5 border-2 border-ink space-y-0.5">
                      <span className="font-black text-ink">4. 有氧维度</span>
                      <p className="text-[11px] text-ink/70">
                        以 28 天累计消耗 <strong>2,000 kcal</strong> 为满分标准，通过设备或打卡实时抓取计算。
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs font-bold text-ink">
                  <div className="bg-paper p-2.5 sm:p-3 border-2 border-ink space-y-1">
                    <p className="font-black text-xs sm:text-sm text-ink">⚡️ 极限力量个人化评估</p>
                    <p className="text-ink/80 leading-relaxed text-[11px]">
                      极限力量按 Epley 估算 1RM（<code className="bg-white px-1 border border-ink/40">1RM = 重量 × (1 + 次数/30)</code>），再根据<strong>你的性别与体重</strong>生成五档标准（基准锚点来自 Strength Level 男性 70kg 社区数据，使用幂函数缩放到个人）。未填写身体数据时，暂按 70kg 男性参考。身高仅用于 BMI，不参与力量分。
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {Object.values(STRENGTH_TIERS).map((t) => (
                      <div key={t.key} className="p-2 border-2 border-ink bg-paper flex items-start gap-2">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 border border-ink shrink-0 ${t.badgeBg} ${t.badgeText}`}>
                          {t.zh} ({t.score}分)
                        </span>
                        <span className="text-ink/80 text-[10px] sm:text-[11px] leading-snug">{t.description}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t-2 border-ink pt-2.5">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <h5 className="font-black text-ink text-xs uppercase">代表动作各档位参考对照</h5>
                      <div className="flex bg-paper border-2 border-ink p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setStandardsTableMode('personalized')}
                          className={`px-1.5 py-0.5 text-[9px] font-black cursor-pointer transition-all ${
                            standardsTableMode === 'personalized' ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
                          }`}
                        >
                          我的标准
                        </button>
                        <button
                          type="button"
                          onClick={() => setStandardsTableMode('anchor')}
                          className={`px-1.5 py-0.5 text-[9px] font-black cursor-pointer transition-all ${
                            standardsTableMode === 'anchor' ? 'bg-ink text-neon' : 'text-ink/60 hover:text-ink'
                          }`}
                        >
                          男70kg参考
                        </button>
                      </div>
                    </div>

                    <p className="text-[10px] text-ink/60 mb-1.5 font-bold">
                      {standardsTableMode === 'personalized'
                        ? bodyContext
                          ? `💡 当前展示：${bodyContext.sex === 'female' ? '女性' : '男性'} ${bodyContext.bodyweightKg}kg 专属力量阈值`
                          : '💡 当前展示：暂未设置身体数据，默认采用男 70kg 基准'
                        : '💡 当前展示：Strength Level 国际 70kg 男性锚点对照表'}
                    </p>

                    <div className="overflow-x-auto border-2 border-ink">
                      <table className="w-full text-[9px] sm:text-[10px] text-left">
                        <thead className="bg-ink text-white font-black">
                          <tr>
                            <th className="p-1 sm:p-1.5">动作</th>
                            <th className="p-1 sm:p-1.5">新手</th>
                            <th className="p-1 sm:p-1.5">入门</th>
                            <th className="p-1 sm:p-1.5">进阶</th>
                            <th className="p-1 sm:p-1.5">熟练</th>
                            <th className="p-1 sm:p-1.5">精英</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/20">
                          {STANDARDS_TABLE_EXERCISES.map((name) => {
                            const std = findExerciseStandard(name);
                            if (!std) return null;
                            const thresholds = standardsTableMode === 'personalized'
                              ? scaleThresholds(std, bodyContext)
                              : std.thresholds;
                            return (
                              <tr key={std.name}>
                                <td className="p-1 sm:p-1.5 font-black">{std.name}</td>
                                {thresholds.map((t, idx) => (
                                  <td key={idx} className="p-1 sm:p-1.5">
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
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowStandardsModal(false)}
                className="w-full mt-3 bg-ink text-neon border-2 border-ink py-2.5 font-black uppercase text-xs cursor-pointer hover:bg-black/80 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                我知道了
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
