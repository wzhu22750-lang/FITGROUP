/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, ReactNode, lazy, Suspense } from 'react';
import { logout, onAuthStateChangedFn, waitForAuthReady, subscribeToNotifications, getCurrentUser } from './api';
import { supabaseConfigError } from './lib/supabase';
import { exitApp, hideSplash, listenAndroidBack } from './native';
import {
  Dumbbell,
  BarChart3,
  User as UserIcon,
  Bell,
  Compass,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import type { AppNotification } from './types';
const Feed = lazy(() => import('./components/Feed'));

const AuthScreen = lazy(() => import('./components/AuthScreen'));
const WorkoutLogger = lazy(() => import('./components/WorkoutLogger'));
const Statistics = lazy(() => import('./components/Statistics'));
const Profile = lazy(() => import('./components/Profile'));
const NotificationModal = lazy(() => import('./components/NotificationModal'));
const SplashAnimation = lazy(() => import('./components/SplashAnimation'));
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(() => !supabaseConfigError);
  const [activeTab, setActiveTab] = useState<'feed' | 'log' | 'stats' | 'profile'>('feed');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    if (supabaseConfigError) return false;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('fitgroup_splash_shown')) {
        return false;
      }
    } catch {
      // Storage access restricted in sandbox/privacy mode
    }
    return true;
  });
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('fitgroup_splash_shown', '1');
      }
    } catch {
      // ignore
    }
  }, []);


  useEffect(() => {
    if (supabaseConfigError) {
      void hideSplash();
      return;
    }

    let disposed = false;
    waitForAuthReady()
      .then(() => {
        if (!disposed) setUser(getCurrentUser());
      })
      .catch((err) => {
        console.error('waitForAuthReady error:', err);
      })
      .finally(() => {
        if (disposed) return;
        setLoading(false);
        void hideSplash();
      });

    const unsub = onAuthStateChangedFn((next) => {
      setUser(next);
      setLoading(false);
      void hideSplash();
    });
    return () => { disposed = true; unsub?.(); };
  }, []);

  // Listen for user profile updates to instantly sync App-level user state
  useEffect(() => {
    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || !detail.userId) return;

      setUser((prev: any) => {
        if (!prev) return prev;
        const uid = prev.uid || prev.id;
        if (uid !== detail.userId) return prev;
        return {
          ...prev,
          displayName: detail.displayName !== undefined ? detail.displayName : prev.displayName,
          photoURL: detail.photoURL !== undefined ? detail.photoURL : prev.photoURL,
        };
      });
    };

    window.addEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
    };
  }, []);


  useEffect(() => {
    if (!user?.id && !user?.uid) {
      setNotifications([]);
      return;
    }
    const uid = user.id || user.uid;
    const unsub = subscribeToNotifications(uid, (list) => {
      setNotifications(list);
    });
    return () => unsub();
  }, [user?.id, user?.uid]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const preloadLog = useCallback(() => { void import('./components/WorkoutLogger').catch(() => undefined); }, []);
  const preloadStats = useCallback(() => { void import('./components/Statistics').catch(() => undefined); }, []);
  const preloadProfile = useCallback(() => { void import('./components/Profile').catch(() => undefined); }, []);

  // Preload only on navigation intent (hover/touch), not during authentication
  // or the initial feed request. This also avoids downloading editing dependencies offline.

  useEffect(() => {
    return listenAndroidBack(() => {
      if (!user) {
        void exitApp();
        return;
      }
      if (activeTabRef.current !== 'feed') {
        setActiveTab('feed');
        return;
      }
      void exitApp();
    });
  }, [user]);

  if (supabaseConfigError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-paper p-4">
        <div className="card p-8 max-w-sm w-full text-center" style={{ border: '2px solid #000', boxShadow: 'var(--shadow-cta)' }}>
          <Dumbbell size={36} className="text-ink mx-auto mb-4" />
          <h1 className="text-xl font-bold text-ink mb-3">配置缺失</h1>
          <p className="text-sm text-ink/60">{supabaseConfigError}</p>
        </div>
      </div>
    );
  }

  if (loading && !user) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen bg-paper">
          <Dumbbell size={32} className="text-ink animate-spin" />
        </div>
        {showSplash && (
          <Suspense fallback={null}>
            <SplashAnimation onComplete={handleSplashComplete} />
          </Suspense>
        )}
      </>
    );
  }

  if (!user) {
    return (
      <>
        {showSplash && (
          <Suspense fallback={null}>
            <SplashAnimation onComplete={handleSplashComplete} />
          </Suspense>
        )}
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-screen bg-paper">
            <Dumbbell size={32} className="text-ink animate-spin" />
          </div>
        }>
          <AuthScreen />
        </Suspense>
      </>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        {showSplash && (
          <Suspense fallback={null}>
            <SplashAnimation onComplete={handleSplashComplete} />
          </Suspense>
        )}
        <div className="app-shell min-h-dvh bg-paper max-w-lg mx-auto relative">
      {/* ── Compact header with bold brand personality ── */}
      <header className="app-header sticky top-0 z-30 bg-paper border-b-2 border-ink flex items-center justify-between px-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="bg-black border-2 border-black p-1 flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]">
            <Dumbbell className="text-neon" size={18} />
          </div>
          <span className="text-xl font-black tracking-tight text-ink uppercase italic">FitGroup</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNotificationsModal(true)}
            className="relative bg-white text-ink border-2 border-ink p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-neon active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="消息通知"
            aria-label={`消息通知${unreadCount > 0 ? `，${unreadCount}条未读` : ''}`}
            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black min-w-4 h-4 px-1 rounded-full border border-ink flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {activeTab === 'feed' && (
            <button 
              onClick={() => setActiveTab('log')}
              className="btn-neon min-h-11 px-3 py-1.5 text-xs flex items-center gap-1.5 font-black uppercase tracking-tight"
              title="记录训练"
              aria-label="记录训练"
            >
              <Dumbbell size={15} />
              <span>记录训练</span>
            </button>
          )}
        </div>
      </header>


      <main className="px-4 py-4">
        <Suspense fallback={
          <div className="p-8 text-center">
            <Dumbbell size={24} className="text-ink/30 animate-spin inline-block" />
          </div>
        }>
          <AnimatePresence mode="wait">
            {activeTab === 'feed' && (
              <div key="feed">
                <Feed key={user.uid} onNavigateToLog={() => setActiveTab('log')} />
              </div>
            )}
            {activeTab === 'log' && (
              <div key="log">
                <WorkoutLogger onSuccess={() => setActiveTab('feed')} />
              </div>
            )}
            {activeTab === 'stats' && (
              <div key="stats">
                <Statistics />
              </div>
            )}
              {activeTab === 'profile' && (
                <div key="profile">
                  <Profile
                    user={user}
                    onLogout={async () => { await logout(); setUser(null); }}
                    unreadCount={unreadCount}
                    onOpenNotifications={() => setShowNotificationsModal(true)}
                    onUserUpdate={(updated) => {
                      if (updated.uid === getCurrentUser()?.uid) setUser(updated);
                    }}
                  />
                </div>
              )}

          </AnimatePresence>
        </Suspense>
      </main>

      {/* Notifications Modal */}
      <AnimatePresence>
        {showNotificationsModal && (
          <Suspense fallback={null}>
            <NotificationModal
              onClose={() => setShowNotificationsModal(false)}
              onSelectLog={() => {
                setShowNotificationsModal(false);
                setActiveTab('feed');
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* ── Bottom tab bar ── */}
      <nav aria-label="主导航" className="app-tabbar fixed bottom-0 left-0 right-0 bg-white border-t border-ink/20 px-3 pt-2 flex items-center justify-around gap-2 max-w-lg mx-auto z-40">
        <NavButton active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} icon={<Compass size={22} />} label="动态" />
        <NavButton active={activeTab === 'log'} onClick={() => setActiveTab('log')} onPreload={preloadLog} icon={<Dumbbell size={22} />} label="打卡" />
        <NavButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} onPreload={preloadStats} icon={<BarChart3 size={22} />} label="统计" />
        <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} onPreload={preloadProfile} icon={<UserIcon size={22} />} label="我的" />
      </nav>
    </div>
    </ToastProvider>
    </ErrorBoundary>
  );
}

function NavButton({
  active,
  onClick,
  onPreload,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  onPreload?: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button 
      onClick={onClick}
      onMouseEnter={onPreload}
      onTouchStart={onPreload}
      className={`app-nav-button flex flex-col justify-center items-center gap-1 cursor-pointer px-3 py-1 border-2 ${
        active 
          ? 'bg-neon text-ink border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-black'
          : 'border-transparent text-ink/50 hover:text-ink font-bold'
      }`}
      style={{ minWidth: 54 }}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span className="text-[11px] leading-tight tracking-tight">{label}</span>
    </button>
  );
}
