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
  const [sex, setSex] = useState<'male' | 'female' | null>(user?.sex || null);
  const [bodyweightKg, setBodyweightKg] = useState<string>(
    user?.bodyweightKg !== undefined && user?.bodyweightKg !== null ? String(user.bodyweightKg) : ''
  );
  const [heightCm, setHeightCm] = useState<string>(
    user?.heightCm !== undefined && user?.heightCm !== null ? String(user.heightCm) : ''
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { showToast } = useToast();

  const numWeight = parseFloat(bodyweightKg);
  const numHeight = parseFloat(heightCm);
  const hasValidBmi = !isNaN(numWeight) && numWeight > 0 && !isNaN(numHeight) && numHeight > 0;
  const bmiValue = hasValidBmi ? (numWeight / Math.pow(numHeight / 100, 2)).toFixed(1) : null;

  const getBmiCategory = (bmi: number) => {
    if (bmi < 18.5) return { label: '偏轻', color: 'text-amber-600 bg-amber-100' };
    if (bmi < 24.0) return { label: '标准', color: 'text-emerald-700 bg-emerald-100' };
    if (bmi < 28.0) return { label: '偏重', color: 'text-blue-700 bg-blue-100' };
    return { label: '过重', color: 'text-purple-700 bg-purple-100' };
  };

  const handleSave = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    setSaving(true);

    try {
      const parsedWeight = bodyweightKg.trim() === '' ? null : parseFloat(bodyweightKg);
      const parsedHeight = heightCm.trim() === '' ? null : parseInt(heightCm, 10);

      if (parsedWeight !== null && (isNaN(parsedWeight) || parsedWeight < 30 || parsedWeight > 200)) {
        throw new Error('体重请填写 30 ~ 200 kg 之间的有效数值');
      }
      if (parsedHeight !== null && (isNaN(parsedHeight) || parsedHeight < 120 || parsedHeight > 220)) {
        throw new Error('身高请填写 120 ~ 220 cm 之间的有效整数');
      }

      await updateUserProfileFn(currentUser.uid, {
        displayName: displayName.trim(),
        sex: sex,
        bodyweightKg: parsedWeight,
        heightCm: parsedHeight,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      showToast('个人档案已更新', 'success');
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
        <h2 className="font-black text-ink uppercase tracking-tighter text-xl mb-6 italic">Settings / 个人与身体档案</h2>

        <div className="space-y-5">
          {/* 昵称 */}
          <div>
            <label className="block text-[10px] font-black text-ink uppercase mb-2">昵称</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-paper border-4 border-ink p-3.5 font-black text-ink uppercase outline-none focus:bg-white"
            />
          </div>

          {/* 生理性别 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-black text-ink uppercase">生理性别</label>
              <span className="text-[10px] text-ink/50 font-bold">用于力量分性别基准曲线</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSex('male')}
                className={`py-3 border-2 border-ink font-black text-xs uppercase cursor-pointer transition-all ${
                  sex === 'male'
                    ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                    : 'bg-paper text-ink/70 hover:text-ink'
                }`}
              >
                男 (Male)
              </button>
              <button
                type="button"
                onClick={() => setSex('female')}
                className={`py-3 border-2 border-ink font-black text-xs uppercase cursor-pointer transition-all ${
                  sex === 'female'
                    ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                    : 'bg-paper text-ink/70 hover:text-ink'
                }`}
              >
                女 (Female)
              </button>
              <button
                type="button"
                onClick={() => setSex(null)}
                className={`py-3 border-2 border-ink font-black text-xs uppercase cursor-pointer transition-all ${
                  sex === null
                    ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]'
                    : 'bg-paper text-ink/70 hover:text-ink'
                }`}
              >
                暂不设置
              </button>
            </div>
          </div>

          {/* 体重与身高 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-ink uppercase mb-2">
                体重 (kg) <span className="text-neon bg-ink px-1 ml-0.5 text-[9px]">力量分关键</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="30"
                max="200"
                placeholder="例如: 65.0"
                value={bodyweightKg}
                onChange={(e) => setBodyweightKg(e.target.value)}
                className="w-full bg-paper border-4 border-ink p-3 font-black text-ink outline-none focus:bg-white text-base"
              />
              <p className="text-[9px] text-ink/50 mt-1 font-bold">45~130kg 幂函数缩放</p>
            </div>

            <div>
              <label className="block text-[10px] font-black text-ink uppercase mb-2">
                身高 (cm) <span className="text-ink/60 text-[9px]">仅用于 BMI</span>
              </label>
              <input
                type="number"
                step="1"
                min="120"
                max="220"
                placeholder="例如: 175"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full bg-paper border-4 border-ink p-3 font-black text-ink outline-none focus:bg-white text-base"
              />
              <p className="text-[9px] text-ink/50 mt-1 font-bold">不参与力量公式计算</p>
            </div>
          </div>

          {/* BMI 只读参考卡片 */}
          {hasValidBmi && bmiValue && (
            <div className="bg-paper p-3 border-2 border-ink flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-ink/60 uppercase block">身体质量指数 (BMI)</span>
                <span className="text-xl font-black italic text-ink">{bmiValue}</span>
                <span className="text-[10px] text-ink/50 ml-1.5 font-bold">kg/m²</span>
              </div>
              <div className="text-right">
                <span className={`text-[10px] font-black px-2 py-0.5 border border-ink ${getBmiCategory(Number(bmiValue)).color}`}>
                  {getBmiCategory(Number(bmiValue)).label}
                </span>
                <p className="text-[9px] text-ink/50 mt-1 font-bold">仅作健康展示参考</p>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full py-4 font-black uppercase text-lg border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 cursor-pointer ${
                saved ? 'bg-neon text-ink' : 'bg-ink text-white'
              }`}
            >
              {saved ? <><Check size={20} /> Saved</> : saving ? 'Saving...' : 'Save Changes / 保存设置'}
            </button>
          </div>
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
