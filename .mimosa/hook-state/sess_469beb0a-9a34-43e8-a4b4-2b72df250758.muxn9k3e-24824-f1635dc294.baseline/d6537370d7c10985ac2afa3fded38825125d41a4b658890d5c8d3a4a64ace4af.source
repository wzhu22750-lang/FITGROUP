import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  subscribeToPublicWorkoutLogs,
  fetchPublicWorkoutLogs,
  getCurrentUser,
} from '../api';
import { WorkoutLog } from '../types';
import LogCard from './LogCard';
import {
  getCachedPublicLogs,
  setCachedPublicLogs,
  mergeLogsPreservingIdentity,
  shouldTriggerPullRefresh,
  getMonotonicTime,
  isOptimisticUpdateExpired,
  stripUpdateMetadata,
  OptimisticUpdateMetadata,
} from '../utils/feedCache';
import { listenAppResume } from '../native';
import { markPageReady } from '../utils/startupMetrics';
import { Dumbbell, WifiOff } from 'lucide-react';

const TeamDashboard = lazy(() => import('./TeamDashboard'));
const preloadTeamDashboard = () => {
  void import('./TeamDashboard').catch(() => undefined);
};

type FeedTab = 'public' | 'team';

interface FeedProps {
  onNavigateToLog?: () => void;
}

export default function Feed({ onNavigateToLog }: FeedProps) {
  const [activeDomain, setActiveDomain] = useState<FeedTab>('public');
  const currentUser = getCurrentUser();

  // Public Feed State with SWR local cache
  const [publicLogs, setPublicLogs] = useState<WorkoutLog[]>(() =>
    // Public content can be shared across sessions; cached like state cannot.
    getCachedPublicLogs().map(log => ({ ...log, isLiked: undefined }))
  );
  const [publicLoading, setPublicLoading] = useState(() => getCachedPublicLogs().length === 0);
  const [publicError, setPublicError] = useState('');

  // Inactive tab activation tracking (defer queries until user switches)
  const [hasActivatedTeam, setHasActivatedTeam] = useState(false);

  // Network offline state detection
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  // Pull-to-refresh touch coordinates and request version tracking
  const touchY = useRef(0);
  const touchX = useRef(0);
  const touchStartScrollY = useRef(0);
  const publicFetchVersion = useRef(0);
  const recentLogUpdates = useRef<Record<string, Partial<WorkoutLog> & OptimisticUpdateMetadata>>({});
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);
  const lastRecovery = useRef(-Infinity);
  const recoveryInFlight = useRef(false);
  const [failureState, setFailureState] = useState<'timeout' | 'error'>('error');

  useEffect(() => {
    markPageReady('app-frame-ready');
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

  // All read successes (including empty results and like patches) commit through
  // the same subscription callback. Recovery bursts share one request.
  const revalidateSilently = useCallback(() => {
    if (activeDomain !== 'public' || recoveryInFlight.current || Date.now() - lastRecovery.current < 1000) return;
    lastRecovery.current = Date.now();
    recoveryInFlight.current = true;
    // Reconnection must replace a pre-offline/hung read, not join it.
    void fetchPublicWorkoutLogs(30, { force: true }).catch((err) => {
      if (!isMounted.current || err.name === 'AbortError') return;
      setPublicLoading(false);
      setFailureState(err.name === 'TimeoutError' ? 'timeout' : 'error');
      setPublicError(err.name === 'TimeoutError' ? '请求超时，请重试' : err.message || '动态加载失败');
    }).finally(() => { recoveryInFlight.current = false; });
  }, [activeDomain]);

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

  // Synchronize in-memory feeds immediately when user updates nickname or avatar
  useEffect(() => {
    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || !detail.userId) return;

      const nextName = detail.displayName;
      const nextPhoto = detail.photoURL;

      setPublicLogs((prev) => {
        let changed = false;
        const next = prev.map((log) => {
          if (log.userId === detail.userId) {
            const updatedLog = {
              ...log,
              userName: nextName !== undefined ? nextName : log.userName,
              userPhoto: nextPhoto !== undefined ? nextPhoto : log.userPhoto,
            };
            if (updatedLog.userName !== log.userName || updatedLog.userPhoto !== log.userPhoto) {
              changed = true;
              return updatedLog;
            }
          }
          return log;
        });
        return changed ? next : prev;
      });
    };

    window.addEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
    };
  }, []);


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
        setFailureState(err.name === 'TimeoutError' ? 'timeout' : 'error');
        setPublicError(err.name === 'TimeoutError' ? '请求超时，请重试' : err.message || '广场动态加载失败');
        setPublicLoading(false);
      }
    );

    return () => unsub();
  }, [reconcileRecentUpdates]);

  // 2. Track activation of 'team' domain
  useEffect(() => {
    if (activeDomain === 'team' && !hasActivatedTeam) {
      setHasActivatedTeam(true);
    }
  }, [activeDomain, hasActivatedTeam]);

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
  }, [reconcileRecentUpdates]);

  const handlePullRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);

    const finishRefresh = () => {
      if (isMounted.current) {
        setRefreshing(false);
      }
    };

    if (activeDomain === 'public') {
      const pVersion = ++publicFetchVersion.current;
      void fetchPublicWorkoutLogs(30, { force: true })
        .catch((err) => {
          if (!isMounted.current || err.name === 'AbortError') return;
          setPublicLoading(false);
          setFailureState(err.name === 'TimeoutError' ? 'timeout' : 'error');
          setPublicError(err.name === 'TimeoutError' ? '请求超时，请重试' : err.message || '动态加载失败');
        })
        .finally(finishRefresh);
    } else {
      setTimeout(finishRefresh, 400);
    }
  };

  return (
    <div
      className="space-y-4"
      data-state={isOffline ? 'offline' : publicLoading && !publicLogs.length ? 'loading' : publicError ? failureState : publicLogs.length ? 'success' : 'empty'}
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
      <div className="feed-intro">
        <h1 className="text-2xl font-black tracking-tight">一起练，更有动力</h1>
        <p className="mt-2 text-sm text-ink/60 leading-relaxed">分享每一次突破，也为彼此的坚持喝彩。</p>
      </div>
      {/* ── Segmented Domain Tabs: 广场 / 小队 ── */}
      <div className="feed-tabs" role="group" aria-label="动态范围">
        <button
          type="button"
          onClick={() => setActiveDomain('public')}
          className="feed-tab"
          aria-pressed={activeDomain === 'public'}
        >
          <span>广场动态</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveDomain('team')}
          onMouseEnter={preloadTeamDashboard}
          onTouchStart={preloadTeamDashboard}
          className="feed-tab"
          aria-pressed={activeDomain === 'team'}
        >
          <span>好友小队</span>
        </button>
      </div>

      {/* Offline Status Banner */}
      {isOffline && (
        <div className="bg-amber-100 border-2 border-amber-600 text-amber-900 px-3 py-2 text-xs font-bold flex items-center justify-between shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <WifiOff size={15} className="text-amber-700 shrink-0" />
            <span>{publicLogs.length ? '离线模式：正在显示本地缓存动态' : '网络不可用，请联网后重试'}</span>
          </div>
          <span className="text-[10px] font-black uppercase bg-amber-200 px-1.5 py-0.5 border border-amber-400">
            本地缓存
          </span>
        </div>
      )}

      {refreshing && (
        <div className="text-center py-2">
          <Dumbbell size={18} className="text-ink/30 animate-spin inline-block" />
        </div>
      )}

      {/* Domain Content */}
      {/* Domain 1: 广场 */}
      {activeDomain === 'public' && (
        <div className="space-y-4">
          {publicLoading && !isOffline && publicLogs.length === 0 ? (
            <div className="space-y-4" role="status" aria-label="正在加载训练动态">
              <span className="sr-only">正在加载训练动态</span>
              {[1, 2, 3].map((i) => (
                <div key={i} className="card p-5 space-y-4 animate-pulse" aria-hidden="true">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-ink/10" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3 w-24 bg-ink/10" />
                      <div className="h-2 w-16 bg-ink/5" />
                    </div>
                  </div>
                  <div className="h-3 w-2/3 bg-ink/10" />
                  <div className="h-12 bg-ink/5" />
                </div>
              ))}
              <button onClick={handlePullRefresh} className="btn-neon">重新加载</button>
            </div>
          ) : (publicError || isOffline) && publicLogs.length === 0 ? (
            <div className="card p-8 text-center space-y-3">
              <p className="font-black text-ink text-base uppercase">广场动态加载失败</p>
              <p className="text-ink/50 font-bold text-xs">{isOffline ? '网络不可用，请联网后重试' : publicError}</p>
              <button
                onClick={handlePullRefresh}
                className="btn-neon px-6 py-2.5 text-xs font-black uppercase"
              >
                点击重试
              </button>
            </div>
          ) : publicLogs.length === 0 ? (
            <div className="card px-6 py-10 text-center">
              <div className="w-14 h-14 mx-auto mb-5 bg-neon flex items-center justify-center border-2 border-ink">
                <Dumbbell size={26} />
              </div>
              <h2 className="text-lg font-black">从你的第一条打卡开始</h2>
              <p className="text-sm text-ink/60 mt-2 leading-relaxed">广场还没有公开动态。记录训练，<br />让健友看见你的坚持。</p>
              {onNavigateToLog && (
                <button type="button" onClick={onNavigateToLog} className="btn-neon mt-6 min-h-11">记录训练</button>
              )}
            </div>
          ) : (
            publicLogs.map((log) => (
              <LogCard key={log.id} log={log} onLogUpdated={handleLogUpdated} />
            ))
          )}
        </div>
      )}

      {/* Domain 2: 小队 (Deferred until activated; retained mounted to prevent tearing down subscriptions) */}
      {hasActivatedTeam && (
        <div className={activeDomain === 'team' ? 'block' : 'hidden'}>
          <Suspense fallback={
            <div className="py-12 text-center space-y-2">
              <Dumbbell size={24} className="text-ink/20 animate-spin inline-block" />
              <p className="text-xs text-ink/40">加载小队数据…</p>
            </div>
          }>
            <TeamDashboard onLogUpdated={handleLogUpdated} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
