import { useState, useEffect } from 'react';
import { getCurrentUser, updateUserProfileFn } from '../api';
import { LogOut, User as UserIcon, Shield, Settings, HelpCircle, Bell, ChevronLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pushBackHandler } from '../backStack';
import { useToast } from './Toast';

interface ProfileProps {
  user: any;
  onLogout: () => void;
}

export default function Profile({ user, onLogout }: ProfileProps) {
  const [page, setPage] = useState<'main' | 'settings' | 'placeholder'>('main');
  const [placeholderTitle, setPlaceholderTitle] = useState('');

  const openPlaceholder = (title: string) => {
    setPlaceholderTitle(title);
    setPage('placeholder');
  };

  useEffect(() => {
    if (page === 'main') return;
    return pushBackHandler(() => {
      setPage('main');
      return true;
    });
  }, [page]);

  return (
    <AnimatePresence mode="wait">
      {page === 'main' && (
        <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
          <div className="bg-neon p-8 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
            <div className="border-4 border-ink p-1 bg-white mb-4">
              {user?.photoURL ? (
                <img src={user.photoURL} className="w-24 h-24 object-cover" />
              ) : (
                <div className="w-24 h-24 bg-paper flex items-center justify-center">
                  <UserIcon size={40} className="text-ink/30" />
                </div>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tighter uppercase italic leading-tight text-center break-words max-w-full px-2" title={user?.displayName || 'User'}>
              {user?.displayName || 'User'}
            </h2>
            <p className="text-ink text-[10px] font-black uppercase tracking-widest mt-2 bg-white px-2 border-2 border-ink truncate max-w-full" title={user?.email}>{user?.email}</p>
          </div>

          <div className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] divide-y-4 divide-ink">
            <ProfileItem icon={<Bell size={20} />} label="Notification" count={0} onClick={() => openPlaceholder('Notification')} />
            <ProfileItem icon={<Shield size={20} />} label="Security" onClick={() => openPlaceholder('Security')} />
            <ProfileItem icon={<Settings size={20} />} label="Settings" onClick={() => setPage('settings')} />
            <ProfileItem icon={<HelpCircle size={20} />} label="Help & Feedback" onClick={() => openPlaceholder('Help & Feedback')} />
          </div>

          <button
            onClick={onLogout}
            className="w-full bg-ink text-neon p-5 border-4 border-ink font-black uppercase italic text-xl flex items-center justify-center gap-4 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
          >
            <LogOut size={24} />
            退出登录
          </button>

          <div className="text-center text-[10px] font-black text-ink uppercase tracking-[0.4em] py-4 italic">
            FitGroup // ver_1.2.0
          </div>
        </motion.div>
      )}

      {page === 'settings' && (
        <SettingsPage user={user} onBack={() => setPage('main')} />
      )}

      {page === 'placeholder' && (
        <PlaceholderPage title={placeholderTitle} onBack={() => setPage('main')} />
      )}
    </AnimatePresence>
  );
}

function SettingsPage({ user, onBack }: { user: any; onBack: () => void }) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { showToast } = useToast();

  const handleSave = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    setSaving(true);

    try {
      await updateUserProfileFn(currentUser.uid, {
        displayName: displayName.trim(),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Save settings failed:', e);
      showToast((e as Error)?.message || '保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 font-black text-ink uppercase text-sm hover:text-neon transition-colors cursor-pointer">
        <ChevronLeft size={20} /> Back
      </button>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h2 className="font-black text-ink uppercase tracking-tighter text-xl mb-6 italic">Settings / 设置</h2>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-ink uppercase mb-2">昵称</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-paper border-4 border-ink p-4 font-black text-ink uppercase outline-none focus:bg-white"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-4 font-black uppercase text-lg border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 cursor-pointer ${
              saved ? 'bg-neon text-ink' : 'bg-ink text-white'
            }`}
          >
            {saved ? <><Check size={20} /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function PlaceholderPage({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <motion.div key="placeholder" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 font-black text-ink uppercase text-sm hover:text-neon transition-colors cursor-pointer">
        <ChevronLeft size={20} /> Back
      </button>

      <div className="bg-white p-12 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
        <div className="bg-paper border-2 border-dashed border-ink/20 p-6 mb-6">
          <HelpCircle size={48} className="text-ink/20" />
        </div>
        <h3 className="font-black text-ink uppercase tracking-tighter text-xl mb-2">{title}</h3>
        <p className="text-ink/40 font-black text-xs uppercase tracking-widest">COMING SOON</p>
      </div>
    </motion.div>
  );
}

function ProfileItem({ icon, label, count, onClick }: { icon: any; label: string; count?: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-5 hover:bg-neon transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-4">
        <div className="text-ink group-hover:scale-110 transition-transform">{icon}</div>
        <span className="font-black text-ink uppercase tracking-tighter text-lg">{label}</span>
      </div>
      {count !== undefined ? (
        <span className="bg-ink text-white text-[10px] font-black px-2 py-0.5 border-2 border-ink">
          {count}
        </span>
      ) : (
        <div className="w-2 h-2 bg-ink/20 group-hover:bg-ink transition-colors" />
      )}
    </button>
  );
}
