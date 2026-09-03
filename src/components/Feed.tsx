import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  subscribeToPublicWorkoutLogs,
  subscribeToMyWorkoutLogs,
  fetchPublicWorkoutLogs,
  fetchMyWorkoutLogs,
  getCurrentUser,
} from '../api';
import { WorkoutLog } from '../types';
import LogCard from './LogCard';
import {
  getCachedPublicLogs,
  setCachedPublicLogs,
  getCachedMyLogs,
  setCachedMyLogs,
  mergeLogsPreservingIdentity,
  shouldTriggerPullRefresh,
  getMonotonicTime,
  isOptimisticUpdateExpired,
  stripUpdateMetadata,
  OptimisticUpdateMetadata,
} from '../utils/feedCache';
import { listenAppResume } from '../native';
import { Globe, Users, User as UserIcon, Dumbbell, Activity, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const TeamDashboard = lazy(() => import('./TeamDashboard'));
const preloadTeamDashboard = () => {
  void import('./TeamDashboard');
};

type FeedTab = 'public' | 'team' | 'my';

interface FeedProps {
  onNavigateToLog?: () => void;
}

export default function Feed({ onNavigateToLog }: FeedProps) {
  const [activeDomain, setActiveDomain] = useState<FeedTab>('public');
  const currentUser = getCurrentUser();

  // Public Feed State with SWR local cache
  const [publicLogs, setPublicLogs] = useState<WorkoutLog[]>(() => getCachedPublicLogs());
  const [publicLoading, setPublicLoading] = useState(() => getCachedPublicLogs().length === 0);
  const [publicError, setPublicError] = useState('');

  // Inactive tab activation tracking (defer queries until user switches)
  const [hasActivatedMy, setHasActivatedMy] = useState(false);
  const [hasActivatedTeam, setHasActivatedTeam] = useState(false);

  // My Logs State
  const [myLogs, setMyLogs] = useState<WorkoutLog[]>(() => {
    return currentUser ? getCachedMyLogs(currentUser.uid) : [];
  });
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState('');

  // Network offline state detection
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  // Pull-to-refresh touch coordinates and request version tracking
  const touchY = useRef(0);
  const touchX = useRef(0);
  const touchStartScrollY = useRef(0);
  const publicFetchVersion = useRef(0);
  const myFetchVersion = useRef(0);
  const recentLogUpdates = useRef<Record<string, Partial<WorkoutLog> & OptimisticUpdateMetadata>>({});
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const reconcileRecentUpdates = useCallback((logs: WorkoutLog[], domain: 'public' | 'my') => {
    return logs
      .filter((log) => {
        const update = recentLogUpdates.current[log.id];
        if (!update) return true;
        if (isOptimisticUpdateExpired(update)) {
          delete recentLogUpdates.current[log.id];
          return true;
        }
        if (update._deleted) return false;
        return !(domain === 'public' && update.visibility && update.visibility !== 'public');
      })
      .map((log) => {
        const update = recentLogUpdates.current[log.id];
        if (!update) return log;
        if (isOptimisticUpdateExpired(update)) {
          delete recentLogUpdates.current[log.id];
          return log;
        }
        const cleanUpdate = stripUpdateMetadata(update);
        return { ...log, ...cleanUpdate };
      });
  }, []);

  // Silent background revalidation (used by app resume & online reconnect)
  const revalidateSilently = useCallback(() => {
    if (activeDomain === 'public') {
      const pVersion = ++publicFetchVersion.current;
      void fetchPublicWorkoutLogs()
        .then((data) => {
          if (!isMounted.current) return;
          if (pVersion === publicFetchVersion.current) {
            const reconciled = reconcileRecentUpdates(data, 'public');
            setPublicLogs((prev) => {
              const merged = mergeLogsPreservingIdentity(prev, reconciled);
              setCachedPublicLogs(merged);
              return merged;
            });
            setPublicError('');
          }
        })
        .catch(() => undefined);
    } else if (activeDomain === 'my' && currentUser && hasActivatedMy) {
      const mVersion = ++myFetchVersion.current;
      void fetchMyWorkoutLogs(currentUser.uid)
        .then((data) => {
          if (!isMounted.current) return;
          if (mVersion === myFetchVersion.current) {
            const reconciled = reconcileRecentUpdates(data, 'my');
            setMyLogs((prev) => {
              const merged = mergeLogsPreservingIdentity(prev, reconciled);
              setCachedMyLogs(currentUser.uid, merged);
              return merged;
            });
            setMyError('');
          }
        })
        .catch(() => undefined);
    }
  }, [activeDomain, currentUser?.uid, hasActivatedMy, reconcileRecentUpdates]);

  // Handle app lifecycle resume (Android Capacitor suspend/resume and window focus)
  useEffect(() => {
    return listenAppResume(() => {
      revalidateSilently();
    });
  }, [revalidateSilently]);

  // Handle network reconnection (online/offline transitions)
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      revalidateSilently();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [revalidateSilently]);

  // 1. Subscribe to Public Feed (background SWR revalidation)
  useEffect(() => {
    if (publicLogs.length === 0) {
      setPublicLoading(true);
    }
    const unsub = subscribeToPublicWorkoutLogs(
      (data) => {
        if (!isMounted.current) return;
        // Bump version so stale in-flight manual fetches don't overwrite realtime data
        publicFetchVersion.current++;
        const reconciled = reconcileRecentUpdates(data, 'public');
        setPublicLogs((prev) => {
          const merged = mergeLogsPreservingIdentity(prev, reconciled);
          setCachedPublicLogs(merged);
          return merged;
        });
        setPublicLoading(false);
        setPublicError('');
      },
      (err) => {
        if (!isMounted.current) return;
        setPublicError(err.message || '全员广场动态加载失败');
        setPublicLoading(false);
      }
    );

    return () => unsub();
  }, [reconcileRecentUpdates]);

  // 2. Track activation of 'my' and 'team' domains
  useEffect(() => {
    if (activeDomain === 'my' && !hasActivatedMy) {
      setHasActivatedMy(true);
    }
    if (activeDomain === 'team' && !hasActivatedTeam) {
      setHasActivatedTeam(true);
    }
  }, [activeDomain, hasActivatedMy, hasActivatedTeam]);

  // 3. Subscribe to My Logs Feed ONLY after activation
  useEffect(() => {
    if (!hasActivatedMy || !currentUser) {
      return;
    }

    if (myLogs.length === 0) {
      const cached = getCachedMyLogs(currentUser.uid);
      if (cached.length > 0) {
        setMyLogs(cached);
      } else {
        setMyLoading(true);
      }
    }
    const unsub = subscribeToMyWorkoutLogs(
      currentUser.uid,
      (data) => {
        if (!isMounted.current) return;
        myFetchVersion.current++;
        const reconciled = reconcileRecentUpdates(data, 'my');
        setMyLogs((prev) => {
          const merged = mergeLogsPreservingIdentity(prev, reconciled);
          setCachedMyLogs(currentUser.uid, merged);
          return merged;
        });
        setMyLoading(false);
        setMyError('');
      },
      (err) => {
        if (!isMounted.current) return;
        setMyError(err.message || '个人打卡记录加载失败');
        setMyLoading(false);
      }
    );

    return () => unsub();
  }, [hasActivatedMy, currentUser?.uid, reconcileRecentUpdates]);

  const handleLogUpdated = useCallback((updated?: Partial<WorkoutLog> & { id: string; _deleted?: boolean }) => {
    if (!updated?.id) {
      const pVersion = ++publicFetchVersion.current;
      void fetchPublicWorkoutLogs()
        .then((data) => {
          if (!isMounted.current) return;
          if (pVersion === publicFetchVersion.current) {
            const reconciled = reconcileRecentUpdates(data, 'public');
            setPublicLogs((prev) => {
              const merged = mergeLogsPreservingIdentity(prev, reconciled);
              setCachedPublicLogs(merged);
              return merged;
            });
          }
        })
        .catch(() => undefined);
      if (currentUser && hasActivatedMy) {
        const mVersion = ++myFetchVersion.current;
        void fetchMyWorkoutLogs(currentUser.uid)
          .then((data) => {
            if (!isMounted.current) return;
            if (mVersion === myFetchVersion.current) {
              const reconciled = reconcileRecentUpdates(data, 'my');
              setMyLogs((prev) => {
                const merged = mergeLogsPreservingIdentity(prev, reconciled);
                setCachedMyLogs(currentUser.uid, merged);
                return merged;
              });
            }
          })
          .catch(() => undefined);
      }
      return;
    }

    const nowMonotonic = getMonotonicTime();
    const nowWallClock = Date.now();
    const existing = recentLogUpdates.current[updated.id] || { id: updated.id };
    const merged: Partial<WorkoutLog> & OptimisticUpdateMetadata = {
      ...existing,
      ...updated,
      _monotonicAt: nowMonotonic,
      _wallClockAt: nowWallClock,
      _updatedAt: nowWallClock,
    };
    recentLogUpdates.current[updated.id] = merged;

    window.setTimeout(() => {
      if (recentLogUpdates.current[updated.id]?._monotonicAt === nowMonotonic) {
        delete recentLogUpdates.current[updated.id];
      }
    }, 30_000);

    const cleanMerged = stripUpdateMetadata(merged);

    // Optimistic deletion
    if (updated._deleted) {
      setPublicLogs((prev) => {
        const next = prev.filter((log) => log.id !== updated.id);
        setCachedPublicLogs(next);
        return next;
      });
      setMyLogs((prev) => {
        const next = prev.filter((log) => log.id !== updated.id);
        if (currentUser) {
          setCachedMyLogs(currentUser.uid, next);
        }
        return next;
      });
      return;
    }

    setPublicLogs((prev) => {
      let next: WorkoutLog[];
      if (merged.visibility && merged.visibility !== 'public') {
        next = prev.filter((log) => log.id !== updated.id);
      } else {
        next = prev.map((log) => (log.id === updated.id ? { ...log, ...cleanMerged } : log));
      }
      setCachedPublicLogs(next);
      return next;
    });

    setMyLogs((prev) => {
      const next = prev.map((log) => (log.id === updated.id ? { ...log, ...cleanMerged } : log));
      if (currentUser) {
        setCachedMyLogs(currentUser.uid, next);
      }
      return next;
    });

    // Reconcile in the background with version check to prevent out-of-order overwrite
    const pVersion = ++publicFetchVersion.current;
    void fetchPublicWorkoutLogs()
      .then((data) => {
        if (!isMounted.current) return;
        if (pVersion === publicFetchVersion.current) {
          const reconciled = reconcileRecentUpdates(data, 'public');
          setPublicLogs((prev) => {
            const preserved = mergeLogsPreservingIdentity(prev, reconciled);
            setCachedPublicLogs(preserved);
            return preserved;
          });
        }
      })
      .catch(() => undefined);
    if (currentUser && hasActivatedMy) {
      const mVersion = ++myFetchVersion.current;
      void fetchMyWorkoutLogs(currentUser.uid)
        .then((data) => {
          if (!isMounted.current) return;
          if (mVersion === myFetchVersion.current) {
            const reconciled = reconcileRecentUpdates(data, 'my');
            setMyLogs((prev) => {
              const preserved = mergeLogsPreservingIdentity(prev, reconciled);
              setCachedMyLogs(currentUser.uid, preserved);
              return preserved;
            });
          }
        })
        .catch(() => undefined);
    }
  }, [currentUser?.uid, hasActivatedMy, reconcileRecentUpdates]);

  const handlePullRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);

    // Safety fallback: ensure refreshing spinner is guaranteed to dismiss
    const safetyTimer = window.setTimeout(() => {
      if (isMounted.current) setRefreshing(false);
    }, 8000);
    const finishRefresh = () => {
      window.clearTimeout(safetyTimer);
      if (isMounted.current) {
        setRefreshing(false);
      }
    };

    if (activeDomain === 'public') {
      const pVersion = ++publicFetchVersion.current;
      void fetchPublicWorkoutLogs()
        .then((data) => {
          if (!isMounted.current) return;
          if (pVersion === publicFetchVersion.current) {
            const reconciled = reconcileRecentUpdates(data, 'public');
            setPublicLogs((prev) => {
              const merged = mergeLogsPreservingIdentity(prev, reconciled);
              setCachedPublicLogs(merged);
              return merged;
            });
            setPublicError('');
          }
        })
        .catch((err) => {
          console.warn('Public pull refresh error:', err);
        })
        .finally(finishRefresh);
    } else if (activeDomain === 'my' && currentUser) {
      const mVersion = ++myFetchVersion.current;
      void fetchMyWorkoutLogs(currentUser.uid)
        .then((data) => {
          if (!isMounted.current) return;
          if (mVersion === myFetchVersion.current) {
            const reconciled = reconcileRecentUpdates(data, 'my');
            setMyLogs((prev) => {
              const merged = mergeLogsPreservingIdentity(prev, reconciled);
              setCachedMyLogs(currentUser.uid, merged);
              return merged;
            });
            setMyError('');
          }
        })
        .catch((err) => {
          console.warn('My logs pull refresh error:', err);
        })
        .finally(finishRefresh);
    } else {
      setTimeout(finishRefresh, 400);
    }
  };

  return (
    <div
      className="space-y-5"
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          touchY.current = e.touches[0].clientY;
          touchX.current = e.touches[0].clientX;
          touchStartScrollY.current = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        }
      }}
      onTouchCancel={() => {
        touchY.current = 0;
        touchX.current = 0;
        touchStartScrollY.current = 0;
      }}
      onTouchEnd={(e) => {
        if (touchY.current > 0 && e.changedTouches.length > 0) {
          const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
          const shouldRefresh = shouldTriggerPullRefresh({
            touchStartY: touchY.current,
            touchStartX: touchX.current,
            touchEndY: e.changedTouches[0].clientY,
            touchEndX: e.changedTouches[0].clientX,
            touchStartScrollY: touchStartScrollY.current,
            scrollY,
            refreshing,
            viewportHeight: window.innerHeight,
          });
          touchY.current = 0;
          touchX.current = 0;
          touchStartScrollY.current = 0;

          if (shouldRefresh) {
            handlePullRefresh();
          }
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
          onMouseEnter={preloadTeamDashboard}
          onTouchStart={preloadTeamDashboard}
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

      {/* Offline Status Banner */}
      {isOffline && (
        <div className="bg-amber-100 border-2 border-amber-600 text-amber-900 px-3 py-2 text-xs font-bold flex items-center justify-between shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <WifiOff size={16} className="text-amber-700 shrink-0" />
            <span>离线模式：正在显示本地缓存动态</span>
          </div>
          <span className="text-[10px] uppercase font-black tracking-wider bg-amber-200 px-1.5 py-0.5 rounded border border-amber-400">
            本地缓存
          </span>
        </div>
      )}

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
              publicLogs.map((log) => (
                <LogCard key={log.id} log={log} onLogUpdated={handleLogUpdated} />
              ))
            )}
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
                  onLogUpdated={handleLogUpdated}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Domain 2: 👥 好友小队 (Deferred until activated; retained mounted to prevent tearing down subscriptions) */}
      {hasActivatedTeam && (
        <div className={activeDomain === 'team' ? 'block' : 'hidden'}>
          <Suspense fallback={
            <div className="py-16 text-center space-y-3">
              <Activity size={32} className="text-ink animate-spin inline-block" />
              <p className="font-black text-xs uppercase tracking-widest text-ink/60">加载小队数据中...</p>
            </div>
          }>
            <TeamDashboard onLogUpdated={handleLogUpdated} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
