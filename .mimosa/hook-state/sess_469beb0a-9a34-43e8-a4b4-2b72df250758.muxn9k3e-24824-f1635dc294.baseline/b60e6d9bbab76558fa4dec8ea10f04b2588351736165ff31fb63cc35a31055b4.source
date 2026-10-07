import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { getCurrentUser, updateUserProfileFn, submitFeedbackFn, fetchUserFeedbacksFn, subscribeToMyWorkoutLogs, fetchMyWorkoutLogs } from '../api';
import { supabase } from '../lib/supabase';
import {
  LogOut,
  User as UserIcon,
  Shield,
  HelpCircle,
  Bell,
  ChevronLeft,
  Check,
  MessageSquarePlus,
  Send,
  ChevronDown,
  ChevronUp,
  Info,
  Trash2,
  Lock,
  Mail,
  Search,
  CheckCircle2,
  Clock,
  FileQuestion,
  HelpCircle as QuestionIcon,
  Download,
  Activity,
  Dumbbell,
  Layers,
  Edit3,
  ClipboardList,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { pushBackHandler } from '../backStack';
import { useToast } from './Toast';
import type { FeedbackType, UserFeedback, WorkoutLog } from '../types';
import { ExportDataPage } from './ExportDataPage';
import LogCard from './LogCard';
import {
  getCachedMyLogs,
  setCachedMyLogs,
  mergeLogsPreservingIdentity,
} from '../utils/feedCache';

interface ProfileProps {
  user: any;
  onLogout: () => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  onUserUpdate?: (updatedUser: any) => void;
}

export default function Profile({ user, onLogout, unreadCount = 0, onOpenNotifications, onUserUpdate }: ProfileProps) {
  const [page, setPage] = useState<'main' | 'settings' | 'help' | 'security' | 'export' | 'history'>('main');
  const [currentUserProfile, setCurrentUserProfile] = useState(user);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    setCurrentUserProfile(user);
  }, [user]);

  useEffect(() => {
    if (page === 'main') return;
    return pushBackHandler(() => {
      setPage('main');
      return true;
    });
  }, [page]);

  const activeUser = currentUserProfile || user;

  const handleUserUpdate = (updated: any) => {
    setCurrentUserProfile(updated);
    onUserUpdate?.(updated);
  };

  const handleLogout = () => {
    if (!showLogoutConfirm) {
      setShowLogoutConfirm(true);
      setTimeout(() => setShowLogoutConfirm(false), 3000);
      return;
    }
    onLogout();
  };

  return (
    <AnimatePresence mode="wait">
      {page === 'main' && (
        <div key="main" className="space-y-4">
          {/* ── Compact profile header with punchy Neo-brutalist presence ── */}
          <div className="card p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-14 h-14 shrink-0 bg-paper border-2 border-ink p-0.5 flex items-center justify-center overflow-hidden shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {activeUser?.photoURL ? (
                  <img src={activeUser.photoURL} className="w-full h-full object-cover" alt="头像" />
                ) : (
                  <UserIcon size={24} className="text-ink/30" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-ink uppercase tracking-tight truncate" title={activeUser?.displayName || '用户'}>
                    {activeUser?.displayName || '用户'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setPage('settings')}
                    className="p-1 bg-white border-2 border-ink hover:bg-neon text-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0"
                    title="编辑资料"
                    aria-label="编辑资料"
                  >
                    <Edit3 size={13} />
                  </button>
                </div>
                <p className="text-xs font-mono font-bold text-ink/60 truncate mt-0.5" title={activeUser?.email}>
                  {activeUser?.email || ''}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-black uppercase bg-neon text-ink px-2 py-0.5 border-2 border-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                健友
              </span>
            </div>
          </div>

          {/* ── Primary actions ── */}
          <div className="card divide-y-2 divide-ink/10">
            <ProfileItem
              icon={<ClipboardList size={18} />}
              label="训练历史"
              subtitle="查看你的所有训练记录"
              onClick={() => setPage('history')}
            />
            {unreadCount > 0 && (
              <ProfileItem
                icon={<Bell size={18} />}
                label="消息通知"
                count={unreadCount}
                onClick={onOpenNotifications}
              />
            )}
          </div>

          {/* ── Settings & info ── */}
          <div className="card divide-y-2 divide-ink/10">
            <ProfileItem
              icon={<Edit3 size={18} />}
              label="身体与个人档案"
              onClick={() => setPage('settings')}
            />
            <ProfileItem
              icon={<Download size={18} />}
              label="数据导出"
              onClick={() => setPage('export')}
            />
            <ProfileItem
              icon={<Shield size={18} />}
              label="账号与安全"
              onClick={() => setPage('security')}
            />
            <ProfileItem
              icon={<HelpCircle size={18} />}
              label="帮助与反馈"
              onClick={() => setPage('help')}
            />
          </div>

          {/* ── Logout (low emphasis) ── */}
          <div className="card p-1">
            <button
              onClick={handleLogout}
              className={`w-full py-3.5 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                showLogoutConfirm
                  ? 'bg-red-500 text-white border-red-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] animate-pulse'
                  : 'bg-paper text-ink/60 hover:text-red-600 hover:bg-white border-transparent'
              }`}
            >
              <LogOut size={15} />
              {showLogoutConfirm ? '再次点击确认退出' : '退出当前账号'}
            </button>
          </div>

          <div className="text-center text-[11px] text-ink/20 py-2">
            FitGroup v{(user as any)?._appVersion || '1.0'}
          </div>
        </div>
      )}

      {page === 'history' && (
        <TrainingHistoryPage onBack={() => setPage('main')} />
      )}

      {page === 'settings' && (
        <SettingsPage user={activeUser} onBack={() => setPage('main')} onUserUpdate={handleUserUpdate} />
      )}

      {page === 'export' && (
        <ExportDataPage user={activeUser} onBack={() => setPage('main')} />
      )}

      {page === 'help' && (
        <HelpFeedbackPage user={activeUser} onBack={() => setPage('main')} />
      )}

      {page === 'security' && (
        <SecurityPage user={activeUser} onBack={() => setPage('main')} onLogout={onLogout} />
      )}
    </AnimatePresence>
  );
}

/* =========================================================================
   Training History Page (migrated from Feed "我的打卡")
   ========================================================================= */

function TrainingHistoryPage({ onBack }: { onBack: () => void }) {
  const currentUser = getCurrentUser();
  const [myLogs, setMyLogs] = useState<WorkoutLog[]>(() => {
    return currentUser ? getCachedMyLogs(currentUser.uid) : [];
  });
  const [loading, setLoading] = useState(() => {
    if (!currentUser) return false;
    return getCachedMyLogs(currentUser.uid).length === 0;
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) return;

    if (myLogs.length === 0) {
      const cached = getCachedMyLogs(currentUser.uid);
      if (cached.length > 0) {
        setMyLogs(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }

    const unsub = subscribeToMyWorkoutLogs(
      currentUser.uid,
      (data) => {
        setMyLogs((prev) => {
          const merged = mergeLogsPreservingIdentity(prev, data);
          setCachedMyLogs(currentUser.uid, merged);
          return merged;
        });
        setLoading(false);
        setError('');
      },
      (err) => {
        setError(err.message || '训练记录加载失败');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // Sync profile updates into local logs
  useEffect(() => {
    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || !detail.userId) return;
      setMyLogs((prev) => {
        let changed = false;
        const next = prev.map((log) => {
          if (log.userId === detail.userId) {
            const updated = {
              ...log,
              userName: detail.displayName !== undefined ? detail.displayName : log.userName,
              userPhoto: detail.photoURL !== undefined ? detail.photoURL : log.userPhoto,
            };
            if (updated.userName !== log.userName || updated.userPhoto !== log.userPhoto) {
              changed = true;
              return updated;
            }
          }
          return log;
        });
        return changed ? next : prev;
      });
    };
    window.addEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('fitgroup:user-profile-updated', handleProfileUpdate);
  }, []);

  const handleLogUpdated = useCallback((updated?: Partial<WorkoutLog> & { id: string; _deleted?: boolean }) => {
    if (!updated?.id || !currentUser) return;

    if (updated._deleted) {
      setMyLogs((prev) => {
        const next = prev.filter((log) => log.id !== updated.id);
        setCachedMyLogs(currentUser.uid, next);
        return next;
      });
      return;
    }

    setMyLogs((prev) => {
      const next = prev.map((log) => (log.id === updated.id ? { ...log, ...updated } : log));
      setCachedMyLogs(currentUser.uid, next);
      return next;
    });

    // Background refresh
    void fetchMyWorkoutLogs(currentUser.uid)
      .then((data) => {
        setMyLogs((prev) => {
          const merged = mergeLogsPreservingIdentity(prev, data);
          setCachedMyLogs(currentUser.uid, merged);
          return merged;
        });
      })
      .catch(() => undefined);
  }, [currentUser?.uid]);

  const handleRetry = () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    fetchMyWorkoutLogs(currentUser.uid)
      .then((data) => {
        setMyLogs(data);
        setCachedMyLogs(currentUser.uid, data);
        setError('');
      })
      .catch((err) => {
        setError(err.message || '加载失败');
      })
      .finally(() => setLoading(false));
  };

  return (
    <div key="history" className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors cursor-pointer py-1">
        <ChevronLeft size={18} />
        返回
      </button>

      <h2 className="text-xl font-bold text-ink">训练历史</h2>

      {loading && myLogs.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-32 animate-pulse" />
          ))}
        </div>
      ) : error && myLogs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-ink mb-2">记录加载失败</p>
          <p className="text-xs text-ink/40 mb-4">{error}</p>
          <button onClick={handleRetry} className="btn-neon px-5 py-2 text-sm">
            点击重试
          </button>
        </div>
      ) : myLogs.length === 0 ? (
        <div className="card p-10 text-center space-y-2">
          <Dumbbell size={28} className="text-ink/20 mx-auto" />
          <p className="text-sm font-medium text-ink/50">还没有训练记录</p>
          <p className="text-xs text-ink/30">完成第一次打卡后，记录会出现在这里</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myLogs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              onLogUpdated={handleLogUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Settings / 身体与个人档案
   ========================================================================= */

function SettingsPage({
  user,
  onBack,
  onUserUpdate,
}: {
  user: any;
  onBack: () => void;
  onUserUpdate?: (updatedUser: any) => void;
}) {
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
    if (bmi < 18.5) return { label: '偏轻', color: 'text-amber-600' };
    if (bmi < 24.0) return { label: '标准', color: 'text-emerald-600' };
    if (bmi < 28.0) return { label: '偏重', color: 'text-blue-600' };
    return { label: '过重', color: 'text-purple-600' };
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

      const updatedProfile = await updateUserProfileFn(currentUser.uid, {
        displayName: displayName.trim(),
        sex: sex,
        bodyweightKg: parsedWeight,
        heightCm: parsedHeight,
      });

      if (onUserUpdate && updatedProfile) {
        onUserUpdate(updatedProfile);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      showToast('个人档案及历史打卡记录已同步更新', 'success');
    } catch (e) {
      console.error('Save settings failed:', e);
      showToast((e as Error)?.message || '保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div key="settings" className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors cursor-pointer py-1">
        <ChevronLeft size={18} />
        返回
      </button>

      <div className="card p-5 space-y-5">
        <h2 className="text-lg font-bold text-ink">身体与个人档案</h2>

        <div className="space-y-4">
          {/* 昵称 */}
          <div>
            <label className="block text-xs font-semibold text-ink/60 mb-1.5">昵称</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field"
            />
            <span className="text-[11px] text-ink/40 block mt-1">
              修改后，历史打卡与统计也会同步
            </span>
          </div>

          {/* 生理性别 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink/60">生理性别</label>
              <span className="text-[11px] text-ink/30">用于力量评估基准</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([['male', '男'], ['female', '女'], [null, '暂不设置']] as const).map(([val, label]) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setSex(val as any)}
                  className={`py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    sex === val
                      ? 'bg-ink text-neon'
                      : 'bg-paper text-ink/60 hover:text-ink'
                  }`}
                  style={{ border: '1px solid rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 体重与身高 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink/60 mb-1.5">
                体重 (kg)
              </label>
              <input
                type="number"
                step="0.5"
                min="30"
                max="200"
                placeholder="例如 65"
                value={bodyweightKg}
                onChange={(e) => setBodyweightKg(e.target.value)}
                className="input-field"
              />
              <p className="text-[11px] text-ink/30 mt-1">用于力量评分计算</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink/60 mb-1.5">
                身高 (cm)
              </label>
              <input
                type="number"
                step="1"
                min="120"
                max="220"
                placeholder="例如 175"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="input-field"
              />
              <p className="text-[11px] text-ink/30 mt-1">仅用于 BMI 参考</p>
            </div>
          </div>

          {/* BMI */}
          {hasValidBmi && bmiValue && (
            <div className="bg-paper p-3 flex items-center justify-between" style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <span className="text-[11px] text-ink/40 block">BMI</span>
                <span className="text-lg font-bold text-ink">{bmiValue}</span>
                <span className="text-[11px] text-ink/30 ml-1">kg/m²</span>
              </div>
              <span className={`text-xs font-semibold ${getBmiCategory(Number(bmiValue)).color}`}>
                {getBmiCategory(Number(bmiValue)).label}
              </span>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
              saved ? 'btn-neon' : 'btn-primary'
            }`}
          >
            {saved ? <><Check size={16} /> 已保存</> : saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Help & Feedback Page
   ========================================================================= */

const FAQ_LIST = [
  {
    q: '力量分是如何评定的？',
    category: '评分',
    a: '根据体重与性别，结合三大项（卧推/深蹲/硬拉）等复合动作的 1RM 表现，通过相对力量指数公式评定等级。'
  },
  {
    q: '如何加入或创建小队？',
    category: '小队',
    a: '在动态页切换到小队页面，输入 6 位小队码即可加入队伍；也可点击「创建新小队」生成你的专属邀请码。'
  },
  {
    q: '打卡记录的可见范围？',
    category: '隐私',
    a: '支持公开（全站可见）、小队仅见（仅队友可见）与私密（仅自己可见）。发布后可随时编辑修改。'
  },
  {
    q: '如何添加自定义动作？',
    category: '记录',
    a: '在记录训练页面底部，点击「自定义力量」或「自定义有氧」即可输入动作名称并配置组数/重量/时长。'
  },
  {
    q: '离线状态下可以打卡吗？',
    category: '同步',
    a: '当前版本需要网络才能提交打卡。离线时请先保留训练信息，恢复网络后再提交。'
  },
  {
    q: '身高体重数据会公开吗？',
    category: '隐私',
    a: '不会。身高体重仅用于计算力量分与 BMI，其他用户只能看到评级，无法查看数值。'
  }
];

function HelpFeedbackPage({ user, onBack }: { user: any; onBack: () => void }) {
  const [subTab, setSubTab] = useState<'feedback' | 'faq' | 'about'>('feedback');
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('feature');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbacks, setFeedbacks] = useState<UserFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [faqSearch, setFaqSearch] = useState('');
  const { showToast } = useToast();

  const userId = user?.id || user?.uid;

  useEffect(() => {
    setLoadingFeedbacks(true);
    fetchUserFeedbacksFn(userId)
      .then((list) => setFeedbacks(list))
      .catch((err) => console.warn('fetch feedbacks err:', err))
      .finally(() => setLoadingFeedbacks(false));
  }, [userId]);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length < 5) {
      showToast('请至少输入 5 个字的详细描述', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const created = await submitFeedbackFn({
        type: feedbackType,
        content: trimmed,
        contact: contact.trim(),
      });

      setFeedbacks((prev) => [created, ...prev]);
      setContent('');
      setContact('');
      showToast('感谢反馈！我们会认真评估', 'success');
    } catch (err) {
      console.error('Submit feedback failed:', err);
      showToast('提交失败，请检查网络后重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredFaqs = FAQ_LIST.filter(
    (item) =>
      item.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      item.a.toLowerCase().includes(faqSearch.toLowerCase()) ||
      item.category.toLowerCase().includes(faqSearch.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5" style={{ borderRadius: 'var(--radius-sm)' }}>已解决</span>;
      case 'reviewed':
        return <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5" style={{ borderRadius: 'var(--radius-sm)' }}>已跟进</span>;
      default:
        return <span className="text-[10px] font-semibold text-ink/50 bg-paper px-1.5 py-0.5" style={{ borderRadius: 'var(--radius-sm)' }}>待处理</span>;
    }
  };

  const getTypeLabel = (type: FeedbackType) => {
    switch (type) {
      case 'bug': return '缺陷反馈';
      case 'feature': return '功能建议';
      case 'exercise': return '动作需求';
      default: return '其它';
    }
  };

  return (
    <div key="help" className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors cursor-pointer py-1">
        <ChevronLeft size={18} />
        返回
      </button>

      {/* Sub Tabs */}
      <div className="flex border-b border-ink/10">
        {([['feedback', '意见反馈'], ['faq', '常见问题'], ['about', '关于']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key as any)}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors cursor-pointer ${
              subTab === key ? 'text-ink border-b-2 border-ink' : 'text-ink/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feedback tab */}
      {subTab === 'feedback' && (
        <div className="space-y-4">
          <form onSubmit={handleSubmitFeedback} className="card p-5 space-y-4">
            <h3 className="text-base font-bold text-ink">提交意见</h3>

            <div>
              <label className="block text-xs font-semibold text-ink/60 mb-1.5">反馈类型</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['feature', 'bug', 'exercise', 'other'] as FeedbackType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFeedbackType(t)}
                    className={`py-2 text-xs font-medium cursor-pointer transition-colors ${
                      feedbackType === t ? 'bg-ink text-neon' : 'bg-paper text-ink/60 hover:text-ink'
                    }`}
                    style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 'var(--radius-sm)' }}
                  >
                    {getTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-ink/60">详细描述</label>
                <span className={`text-[11px] ${content.length > 500 ? 'text-red-500' : 'text-ink/30'}`}>
                  {content.length}/500
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={500}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="请详细描述你遇到的问题或期望的功能…"
                className="input-field resize-none text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink/60 mb-1.5">
                联系方式 <span className="font-normal text-ink/30">(选填)</span>
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="邮箱 / 微信号"
                className="input-field text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || content.trim().length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {submitting ? '提交中…' : <><Send size={16} /> 发送反馈</>}
            </button>
          </form>

          {/* Feedback History */}
          <div className="card p-5">
            <h4 className="text-sm font-bold text-ink mb-3 flex items-center gap-1.5">
              <Clock size={14} className="text-ink/40" />
              历史反馈 ({feedbacks.length})
            </h4>

            {loadingFeedbacks ? (
              <div className="text-center py-6 text-xs text-ink/30">加载中…</div>
            ) : feedbacks.length === 0 ? (
              <div className="text-center py-6 text-xs text-ink/30">暂无提交记录</div>
            ) : (
              <div className="space-y-2">
                {feedbacks.map((fb) => (
                  <div key={fb.id} className="p-3 bg-paper space-y-1" style={{ borderRadius: 'var(--radius-sm)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">{getTypeLabel(fb.type)}</span>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(fb.status)}
                        <span className="text-[11px] text-ink/30">
                          {new Date(fb.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-ink/60 whitespace-pre-wrap">{fb.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAQ tab */}
      {subTab === 'faq' && (
        <div className="card p-5 space-y-4">
          <h3 className="text-base font-bold text-ink">常见问题</h3>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="搜索问题…"
              className="input-field pl-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            {filteredFaqs.length === 0 ? (
              <div className="py-6 text-center text-xs text-ink/30">
                <FileQuestion size={24} className="text-ink/15 mx-auto mb-2" />
                未找到相关问题
              </div>
            ) : (
              filteredFaqs.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={idx} className="bg-paper overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 'var(--radius-sm)' }}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full p-3 flex items-start justify-between text-left cursor-pointer hover:bg-white/50 transition-colors gap-2"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="text-[10px] font-semibold bg-ink/5 text-ink/50 px-1.5 py-0.5 shrink-0 mt-0.5" style={{ borderRadius: 'var(--radius-sm)' }}>
                          {faq.category}
                        </span>
                        <span className="text-sm font-medium text-ink flex-1">{faq.q}</span>
                      </div>
                      {isOpen ? <ChevronUp size={14} className="text-ink/30 shrink-0 mt-0.5" /> : <ChevronDown size={14} className="text-ink/30 shrink-0 mt-0.5" />}
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 text-sm text-ink/60 leading-relaxed">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* About tab */}
      {subTab === 'about' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-ink/5">
            <div className="w-12 h-12 bg-neon flex items-center justify-center shrink-0" style={{ border: '2px solid #000', borderRadius: 'var(--radius-md)' }}>
              <Dumbbell size={24} className="text-ink" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">FitGroup</h3>
              <p className="text-xs text-ink/40">健友同行 · 记录训练与进步</p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-ink/40 mb-2">核心特性</h4>
            {[
              '相对力量评估与 1RM 跟踪',
              '小队打卡协作与出勤榜',
              '三重隐私等级（公开 / 小队 / 私密）',
              '离线缓存与自动恢复',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2 text-sm text-ink/60 py-1">
                <CheckCircle2 size={14} className="text-ink/20 shrink-0" />
                {feat}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Security & Account Page
   ========================================================================= */

function SecurityPage({ user, onBack, onLogout }: { user: any; onBack: () => void; onLogout?: () => void }) {
  const [sendingReset, setSendingReset] = useState(false);
  const { showToast } = useToast();

  const handleResetPassword = async () => {
    if (!user?.email) {
      showToast('未找到用户邮箱', 'warning');
      return;
    }

    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      showToast('重置密码链接已发送至邮箱', 'success');
    } catch (err: any) {
      console.error('Reset password error:', err);
      showToast(err.message || '发送失败，请稍后重试', 'error');
    } finally {
      setSendingReset(false);
    }
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('fitgroup_draft_log');
      sessionStorage.clear();
      showToast('本地缓存已清理', 'success');
    } catch (err) {
      showToast('清理失败', 'error');
    }
  };

  return (
    <div key="security" className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors cursor-pointer py-1">
        <ChevronLeft size={18} />
        返回
      </button>

      <div className="card p-5 space-y-5">
        <h2 className="text-lg font-bold text-ink">账号与安全</h2>

        {/* Account Info */}
        <div className="bg-paper p-3 space-y-2" style={{ borderRadius: 'var(--radius-sm)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold text-ink/50">
            <Mail size={14} /> 当前登录
          </div>
          <div className="text-sm font-mono text-ink break-all">
            {user?.email || '匿名登录'}
          </div>
          <div className="text-[11px] text-ink/30">
            UID: <span className="font-mono">{user?.id || user?.uid || '—'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <div>
              <span className="text-sm font-medium text-ink block">重置密码</span>
              <span className="text-[11px] text-ink/30">发送重置邮件到注册邮箱</span>
            </div>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={sendingReset || !user?.email}
              className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              {sendingReset ? '发送中…' : '发送'}
            </button>
          </div>

          <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <div>
              <span className="text-sm font-medium text-ink block">清理本地缓存</span>
              <span className="text-[11px] text-ink/30">不影响云端数据</span>
            </div>
            <button
              type="button"
              onClick={handleClearCache}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
            >
              <Trash2 size={12} /> 清理
            </button>
          </div>
        </div>

        {/* Privacy note */}
        <div className="bg-paper p-3 space-y-1" style={{ borderRadius: 'var(--radius-sm)' }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink/50">
            <Lock size={12} /> 隐私保护
          </div>
          <p className="text-[11px] text-ink/40 leading-relaxed">
            FitGroup 采用行级安全策略 (RLS) 与传输加密。私密动态和身体数据受最高级别权限隔离保护。
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileItem({
  icon,
  label,
  subtitle,
  count,
  onClick
}: {
  icon: any;
  label: string;
  subtitle?: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 hover:bg-neon/20 transition-colors cursor-pointer group text-left"
    >
      <div className="flex items-center gap-3">
        <div className="p-1.5 border-2 border-ink bg-paper group-hover:bg-neon text-ink transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">{icon}</div>
        <div>
          <span className="text-sm font-black text-ink uppercase tracking-tight block">{label}</span>
          {subtitle && <span className="text-[11px] font-bold text-ink/50 block">{subtitle}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {count !== undefined && count > 0 && (
          <span className="bg-neon text-ink border-2 border-ink text-[10px] font-black px-2 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
            {count > 9 ? '9+' : count}
          </span>
        )}
        <div className="w-2 h-2 bg-ink/20 group-hover:bg-ink transition-colors" />
      </div>
    </button>
  );
}
