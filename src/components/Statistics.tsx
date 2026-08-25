import { useState, useEffect } from 'react';
import { getCurrentUser, syncUserStatsFromLogs, subscribeToUserProfile, subscribeToLeaderboard } from '../firebase';
import { UserProfile, WorkoutCategory } from '../types';
import {
  Trophy,
  Flame,
  Target,
  TrendingUp,
  Award,
  User as UserIcon,
  Activity,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';

export default function Statistics() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [groupStats, setGroupStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { setLoading(false); return; }

    // Self-healing recalculation from actual workout logs
    void syncUserStatsFromLogs(user.uid).then(p => {
      setUserProfile(p as any);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Real-time listener for current user's profile and stats
    const unsubProfile = subscribeToUserProfile(user.uid, (profile) => {
      setUserProfile(profile as any);
      setLoading(false);
    });

    // Real-time listener for group leaderboard
    const unsubLeaderboard = subscribeToLeaderboard((leaderboard) => {
      setGroupStats(leaderboard);
    }, 5);

    return () => {
      unsubProfile?.();
      unsubLeaderboard?.();
    };
  }, []);

  const computeRadarData = () => {
    const prs = (userProfile?.prs || {}) as Record<string, number>;
    if (Object.keys(prs).length === 0) return null;

    const values = Object.values(prs) as number[];
    const maxWeight = Math.max(...values, 1);

    return Object.values(WorkoutCategory).map(cat => {
      const catPrs = Object.entries(prs)
        .filter(([name]) => {
          // Simple category mapping by exercise name keywords
          const n = name.toLowerCase();
          switch (cat) {
            case WorkoutCategory.Chest: return n.includes('bench') || n.includes('chest') || n.includes('卧推') || n.includes('胸');
            case WorkoutCategory.Back: return n.includes('deadlift') || n.includes('pull') || n.includes('row') || n.includes('硬拉') || n.includes('背') || n.includes('划船');
            case WorkoutCategory.Legs: return n.includes('squat') || n.includes('leg') || n.includes('lunge') || n.includes('蹲') || n.includes('腿');
            case WorkoutCategory.Shoulders: return n.includes('shoulder') || n.includes('press') || n.includes('推举') || n.includes('肩');
            case WorkoutCategory.Cardio: return n.includes('run') || n.includes('跑步') || n.includes('cardio');
            default: return false;
          }
        });

      const score = catPrs.length > 0
        ? Math.round((Math.max(...catPrs.map(([, w]) => w as number)) / maxWeight) * 100)
        : 0;

      return { subject: cat, A: score, fullMark: 100 };
    });
  };

  const radarData = computeRadarData();

  if (loading) return (
    <div className="p-8 text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block">
        <Activity size={32} className="text-ink" />
      </motion.div>
    </div>
  );

  const isNewUser = !userProfile || userProfile.totalWorkouts === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-neon p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-ink"
        >
          <div className="flex items-center gap-2 mb-2">
            <Flame size={20} className="fill-current" />
            <span className="text-[10px] font-black uppercase tracking-widest">Active Streak</span>
          </div>
          <div className="text-4xl font-black italic">{userProfile?.streak || 0} DAYS</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-ink p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(223,255,0,1)] text-white"
        >
          <div className="flex items-center gap-2 mb-2">
            <Award size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Workouts</span>
          </div>
          <div className="text-4xl font-black italic">{userProfile?.totalWorkouts || 0} SESS</div>
        </motion.div>
      </div>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-ink uppercase tracking-tighter flex items-center gap-2 italic">
            <Target size={18} className="text-ink" />
            Ability Radar / 能力分布
          </h3>
        </div>
        {radarData ? (
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#000" strokeWidth={1} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#000', fontSize: 10, fontWeight: '900' }} />
                <Radar name="能力值" dataKey="A" stroke="#000" fill="#DFFF00" fillOpacity={0.8} strokeWidth={3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[250px] flex items-center justify-center border-2 border-dashed border-ink/20">
            <div className="text-center">
              <Target size={32} className="text-ink/20 mx-auto mb-3" />
              <p className="font-black text-ink/30 uppercase text-sm italic">
                {isNewUser ? '完成第一次打卡后解锁' : '完成不同部位的训练后解锁'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="font-black text-ink uppercase tracking-tighter flex items-center gap-2 mb-6 italic">
          <TrendingUp size={18} className="text-ink" />
          Personal Records / 巅峰数据
        </h3>
        <div className="space-y-3">
          {userProfile?.prs && Object.keys(userProfile.prs).length > 0 ? (
            Object.entries(userProfile.prs).map(([name, weight]) => (
              <div key={name} className="flex items-center justify-between p-4 bg-paper border-2 border-ink gap-2">
                <span className="font-black text-ink uppercase tracking-tight truncate min-w-0 flex-1" title={name}>{name}</span>
                <span className="font-black text-white bg-ink px-2 py-1 italic shrink-0 whitespace-nowrap">{weight} KG</span>
              </div>
            ))
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-ink/20">
              <Award size={24} className="text-ink/20 mx-auto mb-2" />
              <p className="text-ink/30 font-black uppercase text-sm italic">
                {isNewUser ? '打卡记录新重量自动追踪 PR' : 'NO RECORDS YET_'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="font-black text-ink uppercase tracking-tighter flex items-center gap-2 mb-6 italic">
          <Trophy size={20} className="text-ink fill-current" />
          LEADERBOARD / 群组榜单
        </h3>
        <div className="space-y-4">
          {groupStats.length > 0 ? groupStats.map((u, i) => (
            <div key={u.uid} className="flex items-center justify-between border-b-2 border-paper pb-2 last:border-0 last:pb-0 gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-6 h-6 border-2 border-ink flex items-center justify-center font-black text-xs shrink-0 ${i === 0 ? 'bg-neon' : 'bg-paper text-ink'}`}>
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
                <span className="font-black text-ink uppercase tracking-tighter truncate" title={u.displayName}>{u.displayName}</span>
              </div>
              <div className="flex items-center gap-1 bg-ink text-white px-2 py-0.5 italic font-black text-xs shrink-0 whitespace-nowrap">
                <Flame size={12} className="text-neon fill-current shrink-0" />
                <span>{u.streak}</span>
              </div>
            </div>
          )) : (
            <p className="text-center py-4 text-ink/30 font-black italic text-sm uppercase">暂无数据</p>
          )}
        </div>
      </div>
    </div>
  );
}
