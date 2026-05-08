import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, getDocs, limit, where } from 'firebase/firestore';
import { UserProfile, WorkoutLog, WorkoutCategory } from '../types';
import { 
  Trophy, 
  Flame, 
  Target, 
  TrendingUp, 
  History,
  Calendar,
  Award
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

export default function Statistics() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [groupStats, setGroupStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      
      // Fetch user profile
      const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', auth.currentUser.uid)));
      if (!userSnap.empty) {
        setUserProfile(userSnap.docs[0].data() as UserProfile);
      }

      // Fetch group leaderboard (top 5 by streak)
      const groupSnap = await getDocs(query(collection(db, 'users'), orderBy('streak', 'desc'), limit(5)));
      setGroupStats(groupSnap.docs.map(doc => doc.data()));

      setLoading(false);
    };
    fetchData();
  }, []);

  const radarData = [
    { subject: '肩膀', A: 80, fullMark: 100 },
    { subject: '胸部', A: 90, fullMark: 100 },
    { subject: '背部', A: 70, fullMark: 100 },
    { subject: '腿部', A: 40, fullMark: 100 },
    { subject: '有氧', A: 60, fullMark: 100 },
    { subject: '其他', A: 50, fullMark: 100 },
  ];

  if (loading) return <div className="p-4 text-center text-slate-400">数据加载中...</div>;

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
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
              <PolarGrid stroke="#000" strokeWidth={1} />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#000', fontSize: 10, fontWeight: '900' }} />
              <Radar
                name="能力值"
                dataKey="A"
                stroke="#000"
                fill="#DFFF00"
                fillOpacity={0.8}
                strokeWidth={3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="font-black text-ink uppercase tracking-tighter flex items-center gap-2 mb-6 italic">
          <TrendingUp size={18} className="text-ink" />
          Personal Records / 巅峰数据
        </h3>
        <div className="space-y-3">
          {userProfile?.prs && Object.keys(userProfile.prs).length > 0 ? (
            Object.entries(userProfile.prs).map(([name, weight]) => (
              <div key={name} className="flex items-center justify-between p-4 bg-paper border-2 border-ink">
                <span className="font-black text-ink uppercase tracking-tight">{name}</span>
                <span className="font-black text-white bg-ink px-2 py-1 italic">{weight} KG</span>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-ink italic font-bold">NO RECORDS YET_</div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="font-black text-ink uppercase tracking-tighter flex items-center gap-2 mb-6 italic">
          <Trophy size={20} className="text-ink fill-current" />
          LEADERBOARD / 群组榜单
        </h3>
        <div className="space-y-4">
          {groupStats.map((u, i) => (
            <div key={u.uid} className="flex items-center justify-between border-b-2 border-paper pb-2 last:border-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 border-2 border-ink flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-neon' : 'bg-paper text-ink'}`}>
                  {i + 1}
                </div>
                <div className="border-2 border-ink p-0.5">
                  <img src={u.photoURL} className="w-8 h-8 object-cover" />
                </div>
                <span className="font-black text-ink uppercase tracking-tighter">{u.displayName}</span>
              </div>
              <div className="flex items-center gap-1 bg-ink text-white px-2 py-0.5 italic font-black text-xs">
                <Flame size={12} className="text-neon fill-current" />
                <span>{u.streak}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
