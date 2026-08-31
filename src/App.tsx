/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, ReactNode, lazy, Suspense } from 'react';
import { logout, onAuthStateChangedFn, waitForAuthReady, subscribeToNotifications } from './api';
import { supabaseConfigError } from './lib/supabase';
import { exitApp, hideSplash, listenAndroidBack } from './native';
import {
  Dumbbell,
  BarChart3,
  User as UserIcon,
  Plus,
  Layout,
  Activity,
  Bell,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { AppNotification } from './types';

const AuthScreen = lazy(() => import('./components/AuthScreen'));
const Feed = lazy(() => import('./components/Feed'));
const WorkoutLogger = lazy(() => import('./components/WorkoutLogger'));
const Statistics = lazy(() => import('./components/Statistics'));
const Profile = lazy(() => import('./components/Profile'));
const NotificationModal = lazy(() => import('./components/NotificationModal'));
const SplashAnimation = lazy(() => import('./components/SplashAnimation'));
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(!supabaseConfigError);
  const [activeTab, setActiveTab] = useState<'feed' | 'log' | 'stats' | 'profile'>('feed');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showSplash, setShowSplash] = useState(!supabaseConfigError);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);


  useEffect(() => {
    if (supabaseConfigError) {
      void hideSplash();
      return;
    }

    waitForAuthReady()
      .then((next) => {
        setUser(next);
      })
      .catch((err) => {
        console.error('waitForAuthReady error:', err);
      })
      .finally(() => {
        setLoading(false);
        void hideSplash();
      });

    const unsub = onAuthStateChangedFn((next) => {
      setUser(next);
    });
    return () => unsub?.();
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
        <div className="bg-white border-4 border-ink p-8 max-w-sm w-full text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <Dumbbell size={48} className="text-ink mx-auto mb-4" />
          <h1 className="text-2xl font-black text-ink uppercase mb-4">配置缺失</h1>
          <p className="text-sm font-bold text-ink/70">{supabaseConfigError}</p>
        </div>
      </div>
    );
  }

  if (showSplash || loading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen bg-paper">
          <motion.div 
            animate={{ rotate: [0, 90, 180, 270, 360] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="border-8 border-ink p-4"
          >
            <Dumbbell size={48} className="text-ink" />
          </motion.div>
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
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen bg-paper">
          <Activity size={32} className="text-ink animate-spin" />
        </div>
      }>
        <AuthScreen />
      </Suspense>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="app-shell min-h-screen bg-paper max-w-lg mx-auto border-x-4 border-ink relative">
      <header className="app-header sticky top-0 z-30 bg-paper border-b-4 border-ink flex items-center justify-between px-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="bg-black border-2 border-black p-1 flex items-center justify-center shrink-0">
            <Dumbbell className="text-neon" size={24} />
          </div>
          <span className="text-3xl font-black tracking-tighter text-ink uppercase italic">FitGroup</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowNotificationsModal(true)}
            className="relative bg-white text-ink border-2 border-ink p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-neon active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            title="消息通知"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black min-w-4 h-4 px-1 rounded-full border border-ink flex items-center justify-center animate-bounce shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {activeTab === 'feed' && (
            <button 
              onClick={() => setActiveTab('log')}
              className="bg-neon text-ink border-2 border-ink p-2 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
              title="快速打卡"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
      </header>


      <main className="p-4">
        <Suspense fallback={
          <div className="p-8 text-center">
            <Activity size={32} className="text-ink animate-spin inline-block" />
          </div>
        }>
          <AnimatePresence mode="wait">
            {activeTab === 'feed' && (
              <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Feed />
              </motion.div>
            )}
            {activeTab === 'log' && (
              <motion.div key="log" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                <WorkoutLogger onSuccess={() => setActiveTab('feed')} />
              </motion.div>
            )}
            {activeTab === 'stats' && (
              <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Statistics />
              </motion.div>
            )}
              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Profile
                    user={user}
                    onLogout={async () => { await logout(); setUser(null); }}
                    unreadCount={unreadCount}
                    onOpenNotifications={() => setShowNotificationsModal(true)}
                  />
                </motion.div>
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

      <nav className="app-tabbar fixed bottom-0 left-0 right-0 bg-white border-t-4 border-ink px-2 pt-3 flex items-center justify-around max-w-[calc(32rem-8px)] mx-auto z-40">

        <NavButton active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} icon={<Layout size={24} />} label="发现" />
        <NavButton active={activeTab === 'log'} onClick={() => setActiveTab('log')} icon={<Dumbbell size={24} />} label="打卡" />
        <NavButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<BarChart3 size={24} />} label="统计" />
        <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<UserIcon size={24} />} label="我的" />
      </nav>
    </div>
    </ToastProvider>
    </ErrorBoundary>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all cursor-pointer px-4 py-1 border-2 border-transparent ${
        active 
          ? 'bg-neon text-black border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-black' 
          : 'text-slate-400 hover:text-ink'
      }`}
    >
      {icon}
      <span className="text-[10px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
}


