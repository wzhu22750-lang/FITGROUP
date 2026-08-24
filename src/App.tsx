/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ReactNode } from 'react';
import { logout, onAuthStateChangedFn, waitForAuthReady } from './firebase';
import AuthScreen from './components/AuthScreen';
import {
  Dumbbell,
  BarChart3,
  User as UserIcon,
  Plus,
  Layout,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import Feed from './components/Feed';
import WorkoutLogger from './components/WorkoutLogger';
import Statistics from './components/Statistics';
import Profile from './components/Profile';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'log' | 'stats' | 'profile'>('feed');

  useEffect(() => {
    waitForAuthReady().then((next) => {
      setUser(next);
      setLoading(false);
    });

    const unsub = onAuthStateChangedFn((next) => {
      setUser(next);
    });
    return () => unsub?.();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-paper">
        <motion.div 
          animate={{ rotate: [0, 90, 180, 270, 360] }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="border-8 border-ink p-4"
        >
          <Dumbbell size={48} className="text-ink" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="min-h-screen bg-paper pb-24 max-w-lg mx-auto border-x-4 border-ink relative">
      <header className="sticky top-0 z-30 bg-paper border-b-4 border-ink flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="bg-ink p-1">
            <Dumbbell className="text-neon" size={24} />
          </div>
          <span className="text-3xl font-black tracking-tighter text-ink uppercase italic">FitGroup</span>
        </div>
        <div className="flex items-center gap-4">
           {activeTab === 'feed' && (
             <button 
               onClick={() => setActiveTab('log')}
               className="bg-neon text-ink border-2 border-ink p-2 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
             >
               <Plus size={24} />
             </button>
           )}
        </div>
      </header>

      <main className="p-4">
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
              <Profile user={user} onLogout={async () => { await logout(); setUser(null); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-4 border-ink px-2 py-4 flex items-center justify-around max-w-[calc(32rem-8px)] mx-auto z-40">
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
      className={`flex flex-col items-center gap-1 transition-all cursor-pointer px-4 py-1 border-2 border-transparent ${active ? 'bg-neon border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'text-slate-400 hover:text-ink'}`}
    >
      {icon}
      <span className="text-[10px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
}


