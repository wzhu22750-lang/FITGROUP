/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ReactNode } from 'react';
import { registerWithPhone, loginWithPhone, autoLogin, logout, onAuthStateChangedFn, syncUserToDatabase } from './pocketbase';
import { WorkoutCategory, UserProfile } from './types';
import {
  Dumbbell,
  BarChart3,
  User as UserIcon,
  Plus,
  Layout,
  Phone,
  UserPlus,
  Camera,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import Feed from './components/Feed';
import WorkoutLogger from './components/WorkoutLogger';
import Statistics from './components/Statistics';
import Profile from './components/Profile';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/Toast';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'log' | 'stats' | 'profile'>('feed');

  useEffect(() => {
    const init = async () => {
      const existingUser = await autoLogin();
      if (existingUser) {
        await syncUserToDatabase(existingUser);
        setUser(existingUser);
      }
      setLoading(false);
    };
    init();

    const unsub = onAuthStateChangedFn(async (fbUser) => {
      if (fbUser) {
        setUser(fbUser);
      } else {
        setUser(null);
      }
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
    return (
      <ErrorBoundary>
        <ToastProvider>
          <LoginScreen />
        </ToastProvider>
      </ErrorBoundary>
    );
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
              <Profile user={user} onLogout={() => logout()} />
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

function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async () => {
    setErrMsg('');
    if (!/^1\d{10}$/.test(phone)) {
      setErrMsg('请输入正确的11位手机号');
      return;
    }
    try {
      await loginWithPhone(phone);
      // onAuthStateChanged will set user
    } catch (e: any) {
      setErrMsg(e.message || '登录失败，请重试');
    }
  };

  const handleRegister = async () => {
    setErrMsg('');
    if (!/^1\d{10}$/.test(phone)) {
      setErrMsg('请输入正确的11位手机号');
      return;
    }
    if (!nickname.trim()) {
      setErrMsg('请输入昵称');
      return;
    }
    try {
      await registerWithPhone(phone, nickname.trim(), avatarUrl.trim());
      // onAuthStateChanged will set user
    } catch (e: any) {
      setErrMsg(e.message || '注册失败，请重试');
    }
  };

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
          专为"熟人健身群"设计<br />记录每一次流汗
        </p>

        {/* tabs */}
        <div className="flex border-2 border-ink mb-6">
          <button
            onClick={() => { setMode('login'); setErrMsg(''); }}
            className={`flex-1 py-3 font-black text-sm uppercase flex items-center justify-center gap-2 cursor-pointer transition-colors ${mode === 'login' ? 'bg-ink text-neon' : 'bg-white text-ink'}`}
          >
            <LogIn size={16} /> 登录
          </button>
          <button
            onClick={() => { setMode('register'); setErrMsg(''); }}
            className={`flex-1 py-3 font-black text-sm uppercase flex items-center justify-center gap-2 cursor-pointer transition-colors ${mode === 'register' ? 'bg-ink text-neon' : 'bg-white text-ink'}`}
          >
            <UserPlus size={16} /> 注册
          </button>
        </div>

        {/* phone input */}
        <div className="mb-4">
          <div className="flex items-center gap-2 bg-white border-2 border-ink p-3">
            <Phone size={18} className="text-ink/40" />
            <input
              type="tel"
              placeholder="手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 font-black text-ink outline-none placeholder:opacity-30 uppercase text-lg"
              maxLength={11}
            />
          </div>
        </div>

        {/* extra fields for register */}
        <AnimatePresence>
          {mode === 'register' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 bg-white border-2 border-ink p-3 mb-4">
                <UserIcon size={18} className="text-ink/40" />
                <input
                  type="text"
                  placeholder="昵称"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="flex-1 font-black text-ink outline-none placeholder:opacity-30 uppercase"
                />
              </div>
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = reader.result as string;
                      setAvatarUrl(dataUrl);
                      setAvatarPreview(dataUrl);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {avatarPreview ? (
                  <div className="flex items-center gap-3 bg-white border-2 border-ink p-3 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <img src={avatarPreview} className="w-12 h-12 object-cover border-2 border-ink" />
                    <span className="font-black text-ink uppercase text-xs">点击更换头像</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2 bg-white border-2 border-ink p-3 hover:bg-neon transition-colors cursor-pointer"
                  >
                    <Camera size={18} className="text-ink/40" />
                    <span className="font-black text-ink uppercase text-sm">上传头像（可选）</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* error */}
        {errMsg && (
          <p className="text-red-600 font-black text-sm mb-4 bg-white border-2 border-ink p-2 text-center">{errMsg}</p>
        )}

        {/* submit */}
        <button
          onClick={mode === 'login' ? handleLogin : handleRegister}
          className="w-full bg-ink text-white py-4 px-6 font-black uppercase text-lg border-4 border-ink shadow-[4px_4px_0px_0px_rgba(255,255,255,0.5)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 cursor-pointer"
        >
          {mode === 'login' ? (
            <><LogIn size={20} /> 登录</>
          ) : (
            <><UserPlus size={20} /> 注册</>
          )}
        </button>
      </motion.div>
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


