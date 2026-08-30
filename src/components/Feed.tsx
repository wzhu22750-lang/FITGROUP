import { useState, useEffect, useRef } from 'react';
import {
  subscribeToPublicWorkoutLogs,
  subscribeToMyWorkoutLogs,
  getCurrentUser,
} from '../api';
import { WorkoutLog } from '../types';
import LogCard from './LogCard';
import TeamDashboard from './TeamDashboard';
import { Globe, Users, User as UserIcon, Dumbbell, Activity, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type FeedTab = 'public' | 'team' | 'my';

interface FeedProps {
  onNavigateToLog?: () => void;
}

export default function Feed({ onNavigateToLog }: FeedProps) {
  const [activeDomain, setActiveDomain] = useState<FeedTab>('public');
  const currentUser = getCurrentUser();

  // Public Feed State
  const [publicLogs, setPublicLogs] = useState<WorkoutLog[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState('');

  // My Logs State
  const [myLogs, setMyLogs] = useState<WorkoutLog[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState('');

  const touchY = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  // 1. Subscribe to Public Feed
  useEffect(() => {
    setPublicLoading(true);
    const unsub = subscribeToPublicWorkoutLogs(
      (data) => {
        setPublicLogs(data);
        setPublicLoading(false);
        setPublicError('');
      },
      (err) => {
        setPublicError(err.message || '广场动态加载失败');
        setPublicLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // 2. Subscribe to My Logs Feed
  useEffect(() => {
    if (!currentUser) {
      setMyLoading(false);
      return;
    }

    setMyLoading(true);
    const unsub = subscribeToMyWorkoutLogs(
      currentUser.uid,
      (data) => {
        setMyLogs(data);
        setMyLoading(false);
        setMyError('');
      },
      (err) => {
        setMyError(err.message || '个人打卡记录加载失败');
        setMyLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  const handlePullRefresh = () => {
    setRefreshing(true);
    if (activeDomain === 'public') {
      const stop = subscribeToPublicWorkoutLogs(
        (data) => {
          setPublicLogs(data);
          setRefreshing(false);
          stop();
        },
        () => {
          setRefreshing(false);
          stop();
        }
      );
    } else if (activeDomain === 'my' && currentUser) {
      const stop = subscribeToMyWorkoutLogs(
        currentUser.uid,
        (data) => {
          setMyLogs(data);
          setRefreshing(false);
          stop();
        },
        () => {
          setRefreshing(false);
          stop();
        }
      );
    } else {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  return (
    <div
      className="space-y-5"
      onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        if (e.changedTouches[0].clientY - touchY.current > 80 && window.scrollY < 10) {
          handlePullRefresh();
        }
      }}
    >
      {/* Three Segmented Domain Tabs */}
      <div className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-1.5 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setActiveDomain('public')}
          className={`py-2.5 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeDomain === 'public'
              ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-paper text-ink/70 hover:bg-white hover:text-ink'
          }`}
        >
          <Globe size={15} />
          <span>全员广场</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDomain('team')}
          className={`py-2.5 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeDomain === 'team'
              ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-paper text-ink/70 hover:bg-white hover:text-ink'
          }`}
        >
          <Users size={15} />
          <span>好友小队</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDomain('my')}
          className={`py-2.5 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeDomain === 'my'
              ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-paper text-ink/70 hover:bg-white hover:text-ink'
          }`}
        >
          <UserIcon size={15} />
          <span>我的打卡</span>
        </button>
      </div>

      {refreshing && (
        <div className="text-center py-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
            className="inline-block"
          >
            <Dumbbell size={22} className="text-neon" />
          </motion.div>
        </div>
      )}

      {/* Domain Content */}
      <AnimatePresence mode="wait">
        {/* Domain 1: 🌐 全员广场 */}
        {activeDomain === 'public' && (
          <motion.div
            key="public-domain"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {publicLoading && publicLogs.length === 0 ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white h-56 border-4 border-ink animate-pulse" />
                ))}
              </div>
            ) : publicError && publicLogs.length === 0 ? (
              <div className="bg-white border-4 border-ink p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-black text-ink text-lg mb-2 uppercase">广场动态加载失败</p>
                <p className="text-ink/50 font-bold text-xs mb-4">{publicError}</p>
                <button
                  onClick={handlePullRefresh}
                  className="bg-neon text-ink border-2 border-ink px-6 py-2.5 font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  点击重试
                </button>
              </div>
            ) : publicLogs.length === 0 ? (
              <div className="bg-white border-4 border-ink p-12 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
                <Globe size={36} className="text-ink/30 mx-auto" />
                <p className="font-black text-ink/70 text-sm uppercase">全员广场暂无公开打卡</p>
                <p className="text-xs font-bold text-ink/40">发布全员公开打卡，即可在此被所有 FitGroup 健友看到！</p>
              </div>
            ) : (
              publicLogs.map((log) => <LogCard key={log.id} log={log} />)
            )}
          </motion.div>
        )}

        {/* Domain 2: 👥 好友小队 */}
        {activeDomain === 'team' && (
          <motion.div
            key="team-domain"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <TeamDashboard />
          </motion.div>
        )}

        {/* Domain 3: 👤 我的打卡 (个人训练历史管理主要入口) */}
        {activeDomain === 'my' && (
          <motion.div
            key="my-domain"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {myLoading && myLogs.length === 0 ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white h-56 border-4 border-ink animate-pulse" />
                ))}
              </div>
            ) : myError && myLogs.length === 0 ? (
              <div className="bg-white border-4 border-ink p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-black text-ink text-lg mb-2 uppercase">记录加载失败</p>
                <p className="text-ink/50 font-bold text-xs mb-4">{myError}</p>
                <button
                  onClick={handlePullRefresh}
                  className="bg-neon text-ink border-2 border-ink px-6 py-2.5 font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  点击重试
                </button>
              </div>
            ) : myLogs.length === 0 ? (
              <div className="bg-white border-4 border-ink p-12 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
                <Dumbbell size={36} className="text-ink/30 mx-auto" />
                <p className="font-black text-ink/70 text-sm uppercase">你还没有任何打卡记录</p>
                <p className="text-xs font-bold text-ink/40">点击下方打卡按钮，记录你的第一笔训练吧！</p>
              </div>
            ) : (
              myLogs.map((log) => (
                <LogCard
                  key={log.id}
                  log={log}
                  onLogUpdated={() => {
                    if (currentUser) {
                      subscribeToMyWorkoutLogs(currentUser.uid, (data) => setMyLogs(data))();
                    }
                  }}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
