/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ReactNode } from 'react';
import { auth, db, loginWithGoogle } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { WorkoutCategory, UserProfile } from './types';
import { 
  Dumbbell, 
  History, 
  BarChart3, 
  User as UserIcon, 
  Plus, 
  LogOut,
  Flame,
  Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components (to be created)
import Feed from './components/Feed';
import WorkoutLogger from './components/WorkoutLogger';
import Statistics from './components/Statistics';
import Profile from './components/Profile';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'log' | 'stats' | 'profile'>('feed');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          const newUser: UserProfile = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || 'Anonymous',
            photoURL: firebaseUser.photoURL || '',
            email: firebaseUser.email || '',
            streak: 0,
            totalWorkouts: 0,
            prs: {}
          };
          await setDoc(userRef, newUser);
        }
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
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
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-paper p-4">
        <motion.div 
          initial={{ opacity: 0, x: -50 }} 
          animate={{ opacity: 1, x: 0 }}
          className="max-w-sm w-full bg-neon p-8 border-4 border-ink shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="border-4 border-ink bg-white w-20 h-20 flex items-center justify-center mb-6">
            <Dumbbell size={40} className="text-ink" />
          </div>
          <h1 className="text-6xl font-black text-ink mb-2 leading-none tracking-tighter uppercase italic">Fit<br />Group</h1>
          <p className="text-xl font-bold mb-8 uppercase leading-tight">
            专为“熟人健身群”设计<br />记录每一次流汗
          </p>
          <button 
            onClick={loginWithGoogle}
            className="w-full bg-ink text-white py-4 px-6 font-black uppercase text-lg border-4 border-ink shadow-[4px_4px_0px_0px_rgba(255,255,255,0.5)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 cursor-pointer"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5 bg-white p-0.5" />
            GO WITH GOOGLE
          </button>
        </motion.div>
      </div>
    );
  }

  return (
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
              <Profile user={user} onLogout={() => auth.signOut()} />
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


