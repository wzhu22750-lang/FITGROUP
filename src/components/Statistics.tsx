import React, { useState, useEffect, useMemo, lazy, Suspense, useCallback } from 'react';
import TrainingOverview from './TrainingOverview';
const AbilityRadarCard = lazy(() => import('./AbilityRadarCard'));
import TrainingTrendsCard from './TrainingTrendsCard';
import PersonalRecordsSection from './PersonalRecordsSection';
import StructuredInsightsSection from './StructuredInsightsSection';
import StandardsModal from './StandardsModal';
import SubMuscleModal from './SubMuscleModal';
import CommunityLeaderboard from './CommunityLeaderboard';
import {
  getCurrentUser,
  subscribeToUserProfile,
  subscribeToLeaderboard,
  subscribeToStatisticsData,
  statisticsDataStore,
} from '../api';
import { UserProfile, WorkoutCategory, WorkoutLog } from '../types';
import {
  Activity,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  calculateFullWorkoutAnalytics,
  getStrengthTier,
  getTrainingStateTier,
  bodyContextFromProfile,
} from '../utils/workoutAnalytics';
import {
  computeWeeklyTrainingTrends,
  computeExerciseProgression,
  generateDeterministicTrainingInsights,
} from '../utils/progressAnalytics';
import { getStatisticsAnalysisLogs, getStatisticsAnalytics, type StatisticsSnapshot } from '../utils/statisticsData';
import { summarizeWorkoutHistory } from '../utils/trainingPresentation';
import { CATEGORY_META } from '../constants/workoutPresets';

export default function Statistics() {
  const cached = getCurrentUser();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(cached as any);
  const [statisticsSnapshot, setStatisticsSnapshot] = useState<StatisticsSnapshot | null>(null);
  const [abilityOpen, setAbilityOpen] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [groupStats, setGroupStats] = useState<any[]>([]);
  const [workoutLogsError, setWorkoutLogsError] = useState('');
  const [logsReady, setLogsReady] = useState(false);

  // Toggle radar view: Training Capacity Index (28-day volume+freq+progression+consistency) vs Pure Strength PR
  const [radarMode, setRadarMode] = useState<'composite' | 'strength'>('composite');
  // Chart visualization style: Radar Polygon vs 6-Dimension Progress Bars
  const [chartView, setChartView] = useState<'radar' | 'bars'>(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'bars' : 'radar');
  // Timeframe for volume distribution: 7 days vs 28 days
  const [volumeTimeframe, setVolumeTimeframe] = useState<7 | 28>(28);
  // Timeframe for weekly trends: 4, 8, or 12 weeks
  const [selectedWeeks, setSelectedWeeks] = useState<4 | 8 | 12>(4);

  // Standards modal & active sub-muscle drill-down
  const [showStandardsModal, setShowStandardsModal] = useState(false);
  const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<WorkoutCategory | null>(null);

  // Collapsible detailed analysis section (Tier 3)
  const [isTier3Open, setIsTier3Open] = useState(false);
  const openStandards = useCallback(() => setShowStandardsModal(true), []);
  const closeStandards = useCallback(() => setShowStandardsModal(false), []);
  const closeMuscle = useCallback(() => setSelectedCategoryForModal(null), []);

  useEffect(() => {
    const isPreview = typeof window !== 'undefined' && typeof window.location?.search === 'string' && window.location.search.includes('preview=stats');
    if (isPreview) {
      const dayMs = 24 * 3600 * 1000;
      const now = Date.now();
      const mockLogs: WorkoutLog[] = [
        {
          id: 'demo-1',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 2 * dayMs).toISOString(),
          category: 'Chest',
          exercises: [
            { id: 'd1-1', name: '杠铃平板卧推', weight: 85, sets: 4, reps: 8, type: 'strength' },
            { id: 'd1-2', name: '上斜哑铃卧推', weight: 24, sets: 3, reps: 10, type: 'strength' },
          ],
          likesCount: 5,
          commentsCount: 2,
        },
        {
          id: 'demo-2',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 4 * dayMs).toISOString(),
          category: 'Back',
          exercises: [
            { id: 'd2-1', name: '高位下拉', weight: 65, sets: 4, reps: 10, type: 'strength' },
            { id: 'd2-2', name: '引体向上', weight: 10, sets: 3, reps: 6, type: 'strength' },
          ],
          likesCount: 3,
          commentsCount: 1,
        },
        {
          id: 'demo-3',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 6 * dayMs).toISOString(),
          category: 'Legs',
          exercises: [
            { id: 'd3-1', name: '杠铃深蹲', weight: 110, sets: 4, reps: 5, type: 'strength' },
            { id: 'd3-2', name: '传统硬拉', weight: 130, sets: 3, reps: 5, type: 'strength' },
          ],
          likesCount: 8,
          commentsCount: 4,
        },
        {
          id: 'demo-4',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 8 * dayMs).toISOString(),
          category: 'Shoulders',
          exercises: [
            { id: 'd4-1', name: '坐姿哑铃推举', weight: 22, sets: 4, reps: 8, type: 'strength' },
            { id: 'd4-2', name: '哑铃侧平举', weight: 10, sets: 4, reps: 12, type: 'strength' },
          ],
          likesCount: 2,
          commentsCount: 0,
        },
        {
          id: 'demo-5',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 10 * dayMs).toISOString(),
          category: 'Cardio',
          exercises: [
            { id: 'd5-1', name: '户外跑步', duration: 30, calories: 320, sets: 1, reps: 1, type: 'cardio' },
          ],
          likesCount: 4,
          commentsCount: 1,
        },
        {
          id: 'demo-6',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 13 * dayMs).toISOString(),
          category: 'Others',
          exercises: [
            { id: 'd6-1', name: '杠铃弯举', weight: 30, sets: 3, reps: 10, type: 'strength' },
            { id: 'd6-2', name: '绳索下压', weight: 25, sets: 3, reps: 12, type: 'strength' },
          ],
          likesCount: 3,
          commentsCount: 0,
        },
        {
          id: 'demo-7',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 16 * dayMs).toISOString(),
          category: 'Chest',
          exercises: [
            { id: 'd7-1', name: '杠铃平板卧推', weight: 82.5, sets: 4, reps: 8, type: 'strength' },
          ],
          likesCount: 2,
          commentsCount: 1,
        },
        {
          id: 'demo-8',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 19 * dayMs).toISOString(),
          category: 'Legs',
          exercises: [
            { id: 'd8-1', name: '杠铃深蹲', weight: 105, sets: 4, reps: 5, type: 'strength' },
          ],
          likesCount: 4,
          commentsCount: 2,
        },
        {
          id: 'demo-base-1',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 34 * dayMs).toISOString(),
          category: 'Chest',
          exercises: [
            { id: 'db1-1', name: '杠铃平板卧推', weight: 80, sets: 4, reps: 8, type: 'strength' },
          ],
          likesCount: 2,
          commentsCount: 0,
        },
        {
          id: 'demo-base-2',
          userId: 'demo-user-1',
          userName: '力量训练者',
          userPhoto: '',
          timestamp: new Date(now - 38 * dayMs).toISOString(),
          category: 'Legs',
          exercises: [
            { id: 'db2-1', name: '杠铃深蹲', weight: 105, sets: 4, reps: 5, type: 'strength' },
          ],
          likesCount: 1,
          commentsCount: 0,
        },
      ];

      setUserProfile({
        id: 'demo-user-1',
        displayName: '力量训练者',
        photoURL: '',
        sex: 'male',
        bodyweightKg: 75,
        streak: 7,
        totalWorkouts: 48,
        prs: {
          '杠铃平板卧推': 85,
          '杠铃深蹲': 110,
          '传统硬拉': 130,
          '坐姿哑铃推举': 22,
          '引体向上': 10,
        },
      } as any);
      setWorkoutLogs(mockLogs);
      setGroupStats([
        { id: 'g-1', displayName: '铁人阿强', totalWorkouts: 88 },
        { id: 'g-2', displayName: '力量训练者', totalWorkouts: 48 },
        { id: 'g-3', displayName: '晨跑小鹿', totalWorkouts: 42 },
        { id: 'g-4', displayName: '深蹲小李', totalWorkouts: 35 },
      ]);
      setLogsReady(true);

      return;
    }

    const user = getCurrentUser();
    if (!user) {

      return;
    }

    // 1. Real-time listener for current user's profile and stats
    const unsubProfile = subscribeToUserProfile(user.uid, (profile) => {
      setUserProfile(profile as any);

    });

    // 2. Complete recent window and historical PR evidence, read in pages.
    const unsubLogs = subscribeToStatisticsData(
      user.uid,
      (snapshot) => {
        setStatisticsSnapshot(snapshot);
        setWorkoutLogs(snapshot.recentLogs);
        setLogsReady(true);
        setWorkoutLogsError('');

      },
      (error) => {
        setWorkoutLogsError(error.message || '个人训练记录加载失败');

      },
    );

    // 3. Real-time listener for group leaderboard
    const unsubLeaderboard = subscribeToLeaderboard((leaderboard) => {
      setGroupStats(leaderboard);
    }, 5);

    return () => {
      unsubProfile?.();
      unsubLogs?.();
      unsubLeaderboard?.();
    };
  }, []);

  // Synchronize stats userProfile, logs, and leaderboard when nickname or avatar is updated
  useEffect(() => {
    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || !detail.userId) return;

      const nextName = detail.displayName;
      const nextPhoto = detail.photoURL;

      setUserProfile((prev: any) => {
        if (!prev) return prev;
        const uid = prev.uid || prev.id;
        if (uid !== detail.userId) return prev;
        return {
          ...prev,
          displayName: nextName !== undefined ? nextName : prev.displayName,
          photoURL: nextPhoto !== undefined ? nextPhoto : prev.photoURL,
        };
      });

      setGroupStats((prev) => {
        let changed = false;
        const next = prev.map((u) => {
          const uid = u.id || u.uid;
          if (uid === detail.userId) {
            const updated = {
              ...u,
              displayName: nextName !== undefined ? nextName : u.displayName,
              photoURL: nextPhoto !== undefined ? nextPhoto : u.photoURL,
            };
            if (updated.displayName !== u.displayName || updated.photoURL !== u.photoURL) {
              changed = true;
              return updated;
            }
          }
          return u;
        });
        return changed ? next : prev;
      });
    };

    window.addEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
    };
  }, []);

  // Extract body context for strength scoring
  const bodyContext = useMemo(() => {
    return bodyContextFromProfile(userProfile);
  }, [userProfile?.sex, userProfile?.bodyweightKg]);

  // All modules use the same clock snapshot; only compute 7-day data on demand.
  const referenceTime = statisticsSnapshot?.asOf ?? statisticsSnapshot?.updatedAt;
  const referenceDate = useMemo(() => new Date(referenceTime ?? Date.now()), [referenceTime, workoutLogs]);
  const analysisLogs = useMemo(() => statisticsSnapshot ? getStatisticsAnalysisLogs(statisticsSnapshot, bodyContext) : workoutLogs, [statisticsSnapshot, bodyContext, workoutLogs]);
  const historyReady = statisticsSnapshot?.historyReady ?? logsReady;
  const historySummary = useMemo(() => summarizeWorkoutHistory(statisticsSnapshot?.logs ?? workoutLogs, referenceDate), [statisticsSnapshot?.logs, workoutLogs, referenceDate]);
  const analytics28d = useMemo(() => statisticsSnapshot ? getStatisticsAnalytics(statisticsSnapshot, userProfile?.prs || {}, 28, bodyContext) : calculateFullWorkoutAnalytics(
    analysisLogs, userProfile?.prs || {}, 28, bodyContext, referenceDate,
  ), [statisticsSnapshot, analysisLogs, userProfile?.prs, bodyContext, referenceDate]);
  const analytics = useMemo(() => volumeTimeframe === 28 ? analytics28d : statisticsSnapshot ? getStatisticsAnalytics(statisticsSnapshot, userProfile?.prs || {}, 7, bodyContext) : calculateFullWorkoutAnalytics(
    analysisLogs, userProfile?.prs || {}, 7, bodyContext, referenceDate,
  ), [statisticsSnapshot, analytics28d, volumeTimeframe, analysisLogs, userProfile?.prs, bodyContext, referenceDate]);

  // Overall training state score & tier (28-day meso-cycle capacity)
  const overallTrainingScore = useMemo(() => {
    const nonCardio = Object.entries(analytics28d.categoryDetails)
      .filter(([cat]) => cat !== WorkoutCategory.Cardio)
      .map(([, d]) => d.trainingScore);
    if (!nonCardio.length) return 0;
    return Math.round(nonCardio.reduce((a, b) => a + b, 0) / nonCardio.length);
  }, [analytics28d]);

  const overallTrainingTier = useMemo(() => {
    return getTrainingStateTier(overallTrainingScore);
  }, [overallTrainingScore]);

  // Overall strength score & tier (pure 1RM benchmarks)
  const overallStrengthAssessment = useMemo(() => {
    const scores = Object.values(analytics28d.categoryDetails)
      .filter((d) => d.strengthAssessment != null)
      .map((d) => d.strengthScore);
    if (!scores.length) return null;
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return {
      score: avgScore,
      tier: getStrengthTier(avgScore),
    };
  }, [analytics28d]);

  // Trends & progress calculations
  const trends = useMemo(() => {
    return computeWeeklyTrainingTrends(workoutLogs, selectedWeeks, referenceDate, bodyContext);
  }, [workoutLogs, selectedWeeks, referenceDate, bodyContext]);

  const progression = useMemo(() => {
    return computeExerciseProgression(analysisLogs, 28, referenceDate, bodyContext);
  }, [analysisLogs, referenceDate, bodyContext]);

  const deterministicInsights = useMemo(() => {
    return generateDeterministicTrainingInsights(analytics28d, progression, trends);
  }, [analytics28d, progression, trends]);

  const keyFeedback = useMemo(() => {
    const clear = progression.find(item => item.verdict === 'clear_progress');
    const possible = progression.find(item => item.verdict === 'possible_progress');
    const progress = clear ?? possible;
    return {
      title: progress ? `${progress.exerciseName} · ${clear ? '明显进步' : '可能进步'}` : analytics28d.recentWorkoutsCount > 0 ? `近 28 天记录了 ${analytics28d.recentWorkoutsCount} 次训练` : '先记录，再看变化',
      description: progress?.evidence ?? `近 28 天完成 ${analytics28d.recentSetsCount} 组抗阻训练；${analytics28d.categoryDetails.Cardio.cardioMetrics?.effectiveMinutes ?? 0} 分钟有效有氧。`,
      badge: progress ? (clear ? '多日证据' : '待验证') : '记录概览', badgeBg: clear ? 'bg-neon text-ink' : 'bg-paper text-ink',
      action: clear ? '下次在相同动作条件下记录，确认能稳定完成当前组次数后再调整负荷。' : possible ? '继续记录这个动作的实际组次数与负荷，确认提高能否重复。' : deterministicInsights.find(item => item.level === 'suggestion')?.action ?? '先保持记录习惯，积累同动作、同条件的多个训练日。',
    };
  }, [progression, analytics28d, deterministicInsights]);

  const hasAnyData =
    (userProfile?.totalWorkouts && userProfile.totalWorkouts > 0) ||
    workoutLogs.length > 0 ||
    Object.keys(userProfile?.prs || {}).length > 0;

  if (!logsReady && !workoutLogsError) {
    return (
      <div className="space-y-4 pb-8" role="status" aria-label="训练统计加载中">
        <h1 className="text-2xl font-black">看见每一步进步</h1>
        <div className="card border-2 border-ink p-5 space-y-4 motion-safe:animate-pulse">
          <div className="h-4 bg-ink/15 w-1/3" /><div className="h-14 bg-neon border-2 border-ink w-1/2" />
          <div className="h-4 bg-ink/15 w-3/4" /><div className="h-14 bg-paper border border-ink/20" />
          <p className="text-xs font-bold">正在读取近期训练…</p>
        </div>
      </div>
    );
  }

  const selectedCategoryDetail = selectedCategoryForModal
    ? analytics28d.categoryDetails[selectedCategoryForModal]
    : null;

  return (
    <div className="statistics-page space-y-5 pb-8">
      <div className="feed-intro">
        <h1 className="text-2xl font-black tracking-tight">看见每一步进步</h1>
        <p className="mt-2 text-sm text-ink/60 leading-relaxed">不只看今天的数字，更看坚持的轨迹。</p>
      </div>

      {workoutLogsError && (
        <div className="bg-amber-100 border-2 border-ink px-3 py-2 text-xs font-bold text-ink">
          {logsReady ? '刷新失败，保留上次成功的数据。' : '训练记录暂时无法加载。'}{workoutLogsError}
          <button type="button" className="btn-secondary min-h-11 ml-2" onClick={() => void statisticsDataStore.retry(getCurrentUser()?.uid || '')}>重试读取</button>
        </div>
      )}

      {/* =========================================================================
          TIER 1: TRAINING OVERVIEW & PRIMARY CONCLUSION (第一层：训练总览)
          我最近练得怎么样？ / 近期训练反馈
          ========================================================================= */}
      <TrainingOverview
        logs={workoutLogs}
        referenceDate={referenceDate}
        ready={logsReady}
        streak={historySummary.streak}
        totalWorkouts={statisticsSnapshot?.totalWorkouts ?? userProfile?.totalWorkouts ?? historySummary.totalWorkouts}
        recentSets={analytics28d.recentSetsCount}
        balance={analytics28d.insights.balanceLevel}
      />

      {historyReady && statisticsSnapshot?.historyRefreshing && <p role="status" className="text-xs font-bold text-ink/60">历史记录正在更新，先显示上次的结果。</p>}
      {!historyReady && <p role="status" className="text-xs font-bold text-ink/60">近期数据已就绪，历史 PR 正在补齐。</p>}

      {/* 1.6 Tier 1 Key Interpretive Feedback / 近期训练反馈 */}
      <div className="card p-4 sm:p-5 bg-white border-2 border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={16} className="text-ink" />
            <h4 className="text-xs font-black uppercase tracking-wider text-ink/70">近期训练反馈</h4>
          </div>
          <span className={`text-[10px] font-black px-2 py-0.5 border border-ink ${keyFeedback.badgeBg}`}>
            {keyFeedback.badge}
          </span>
        </div>
        <h3 className="text-base font-black text-ink mb-1">{keyFeedback.title}</h3>
        <p className="text-xs text-ink/70 leading-relaxed font-medium">{keyFeedback.description}</p>
        <p className="mt-3 pt-3 border-t-2 border-ink text-xs font-bold leading-relaxed"><span className="bg-neon px-1">下一步</span> {keyFeedback.action}</p>
      </div>

      {/* =========================================================================
          TIER 2: CAPACITY & STRENGTH (第二层：能力与力量)
          近期状态与力量
          ========================================================================= */}
      {logsReady && <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider bg-ink text-neon px-1.5 py-0.5 border border-ink">
              训练表现
            </span>
            <h2 className="text-base font-black text-ink tracking-tight italic">近期状态与力量</h2>
          </div>
          <span className="text-[10px] font-mono text-ink/50 font-bold">近 28 天记录</span>
        </div>

        {/* Dual-Track Paradigm Separation Cards (训练状态 vs 极限力量) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Training State Card */}
          <div className="card p-3.5 sm:p-4 bg-white border-2 border-ink">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-black text-ink/60 uppercase">🏃 训练状态 (近28天)</span>
              <span className={`text-[10px] font-black px-1.5 py-0.2 border border-ink ${overallTrainingTier.badgeBg} ${overallTrainingTier.badgeText}`}>
                {!logsReady ? '待加载' : overallTrainingScore === 0 ? '暂无抗阻训练' : overallTrainingTier.zh}
              </span>
            </div>
            <div className="text-2xl font-black italic text-ink mb-1">
              {logsReady ? overallTrainingScore : '—'} <span className="text-xs text-ink/50 not-italic">分</span>
            </div>
            <p className="text-[11px] text-ink/60 leading-tight">
              综合反映近期抗阻训练投入，点击部位查看详细依据。
            </p>
          </div>

          {/* Strength Level Card */}
          <div className="card p-3.5 sm:p-4 bg-white border-2 border-ink">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-black text-ink/60 uppercase">🏋️ 极限力量水平</span>
              <span className={`text-[10px] font-black px-1.5 py-0.2 border border-ink ${overallStrengthAssessment ? overallStrengthAssessment.tier.badgeBg : 'bg-paper text-ink'} ${overallStrengthAssessment ? overallStrengthAssessment.tier.badgeText : ''}`}>
                {!historyReady ? '历史补齐中' : overallStrengthAssessment ? overallStrengthAssessment.tier.zh : '待测量'}
              </span>
            </div>
            <div className="text-2xl font-black italic text-ink mb-1">
              {historyReady && overallStrengthAssessment ? overallStrengthAssessment.score : '—'} <span className="text-xs text-ink/50 not-italic">分</span>
            </div>
            <p className="text-[11px] text-ink/60 leading-tight">
              {!userProfile?.sex || !userProfile?.bodyweightKg ? '资料不全，部分标准使用通用参考；展开查看依据。' : '历史最佳表现对照力量基准；数据不足时显示待测量。'}
            </p>
          </div>
        </div>

        {/* Six-Dimension Capability Radar & Bar Chart */}
        <button type="button" aria-expanded={abilityOpen} onClick={() => setAbilityOpen(value => !value)} className="btn-secondary min-h-11 w-full flex justify-between items-center">
          部位表现、雷达图与评分标准 {abilityOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {abilityOpen && <Suspense fallback={<p role="status" className="p-4 text-xs">正在加载部位表现…</p>}>
      {/* Incomplete Profile Banner — generic assessment disclosure */}
      {(!userProfile?.sex || !userProfile?.bodyweightKg) && (
        <div className="bg-white border-l-2 border-ink/40 p-3 sm:p-3.5 flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <Info size={18} className="text-ink shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs font-black text-ink leading-tight sm:leading-normal">
              {userProfile?.sex && userProfile?.bodyweightKg
                ? ''
                : !userProfile?.sex && !userProfile?.bodyweightKg
                  ? '未填写性别与体重，当前使用通用参考标准（男 70kg）估算力量水平，力量等级仅供参考'
                  : userProfile?.sex
                    ? '未填写体重，力量标准按 70kg 参考体重估算，等级置信度降低'
                    : '未填写性别，力量标准按男性参考曲线估算，等级置信度降低'}
            </p>
          </div>
          <span className="text-[10px] font-black bg-ink text-neon px-2 py-0.5 whitespace-nowrap shrink-0 border border-ink self-start sm:self-center">
            {userProfile?.sex ? `${userProfile.sex === 'female' ? '女' : '男'} · 缺体重` : userProfile?.bodyweightKg ? `${userProfile.bodyweightKg}kg · 缺性别` : '通用参考标准'}
          </span>
        </div>
      )}

        <AbilityRadarCard
          radarMode={radarMode}
          setRadarMode={setRadarMode}
          chartView={chartView}
          setChartView={setChartView}
          categoryDetails={analytics28d.categoryDetails}
          hasAnyData={hasAnyData}
          onSelectCategory={setSelectedCategoryForModal}
          onOpenStandards={openStandards}
        /></Suspense>}
      </div>}

      {/* =========================================================================
          TIER 3: RECENT TRAINING & PROGRESS (第三层：近期训练与进步)
          ========================================================================= */}
      {logsReady && <TrainingTrendsCard
        trends={trends}
        selectedWeeks={selectedWeeks}
        onSelectWeeks={setSelectedWeeks}
        progression={progression}
        volumeDistribution={analytics.volumeDistribution}
        volumeTimeframe={volumeTimeframe}
        onSelectVolumeTimeframe={setVolumeTimeframe}
        categoryDetails={analytics.categoryDetails}
        recentWorkoutsCount={analytics.recentWorkoutsCount}
        recentSetsCount={analytics.recentSetsCount}
      />}

      {/* =========================================================================
          TIER 4: PROFESSIONAL ANALYSIS & PRs (详细分析 / 专业分析)
          ========================================================================= */}
      <div className="space-y-4 pt-3 border-t-2 border-ink/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider bg-paper text-ink px-1.5 py-0.5 border border-ink">
              更多依据
            </span>
            <h2 className="text-base font-black text-ink tracking-tight italic">详细分析</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsTier3Open(!isTier3Open)}
            aria-expanded={isTier3Open}
            className="btn-secondary min-h-11 text-xs py-1 px-2.5 flex items-center gap-1 cursor-pointer"
          >
            <span>{isTier3Open ? '收起明细' : '展开明细'}</span>
            {isTier3Open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {isTier3Open && (
          <div className="space-y-4">
            {/* PR Archives */}
            {historyReady ? <PersonalRecordsSection prs={analytics28d.categorizedPrs} /> : <p role="status" className="text-xs">历史 PR 尚未补齐，近期趋势可先查看。</p>}

            {/* Structured Insights (Observation → Evidence → Interpretation → Action) */}
            <StructuredInsightsSection insights={deterministicInsights} />
          </div>
        )}
      </div>

      {/* =========================================================================
          TIER 5: COMMUNITY LEADERBOARD (第五层：社区榜单)
          ========================================================================= */}
      <CommunityLeaderboard entries={groupStats} />

      {/* Modals */}
      <StandardsModal
        isOpen={showStandardsModal}
        onClose={closeStandards}
        bodyContext={bodyContext}
      />

      <SubMuscleModal
        category={selectedCategoryForModal}
        detail={selectedCategoryDetail}
        onClose={closeMuscle}
      />
    </div>
  );
}
