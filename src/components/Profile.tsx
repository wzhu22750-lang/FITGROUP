import { useState, useEffect, useMemo } from 'react';
import { getCurrentUser, updateUserProfileFn, submitFeedbackFn, fetchUserFeedbacksFn, getUserWorkoutLogs } from '../api';
import { supabase } from '../lib/supabase';
import {
  LogOut,
  User as UserIcon,
  Shield,
  Settings,
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
  Sparkles,
  CheckCircle2,
  Clock,
  FileQuestion,
  HelpCircle as QuestionIcon,
  Download,
  FileText,
  FileJson,
  Copy,
  Activity,
  Dumbbell,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pushBackHandler } from '../backStack';
import { useToast } from './Toast';
import type { FeedbackType, UserFeedback, WorkoutLog } from '../types';
import { generateExportData, formatExportAsJson, formatExportAsText } from '../utils/dataExport';
import { exportTextFile } from '../native';

interface ProfileProps {
  user: any;
  onLogout: () => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
}

export default function Profile({ user, onLogout, unreadCount = 0, onOpenNotifications }: ProfileProps) {
  const [page, setPage] = useState<'main' | 'settings' | 'help' | 'security' | 'export'>('main');

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
                <img src={user.photoURL} className="w-24 h-24 object-cover" alt="Avatar" />
              ) : (
                <div className="w-24 h-24 bg-paper flex items-center justify-center">
                  <UserIcon size={40} className="text-ink/30" />
                </div>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tighter uppercase italic leading-tight text-center break-words max-w-full px-2" title={user?.displayName || 'User'}>
              {user?.displayName || 'User'}
            </h2>
            <p className="text-ink text-[10px] font-black uppercase tracking-widest mt-2 bg-white px-2 border-2 border-ink truncate max-w-full" title={user?.email}>
              {user?.email || 'FitGroup User'}
            </p>
          </div>

          <div className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] divide-y-4 divide-ink">
            <ProfileItem
              icon={<Bell size={20} />}
              label="Notifications"
              count={unreadCount > 0 ? unreadCount : undefined}
              onClick={onOpenNotifications}
            />
            <ProfileItem
              icon={<Download size={20} />}
              label="Export Data"
              onClick={() => setPage('export')}
            />
            <ProfileItem
              icon={<Shield size={20} />}
              label="Security"
              onClick={() => setPage('security')}
            />
            <ProfileItem
              icon={<Settings size={20} />}
              label="Settings"
              onClick={() => setPage('settings')}
            />
            <ProfileItem
              icon={<HelpCircle size={20} />}
              label="Help & Feedback"
              onClick={() => setPage('help')}
            />
          </div>

          <button
            onClick={onLogout}
            className="w-full bg-ink text-neon p-5 border-4 border-ink font-black uppercase italic text-xl flex items-center justify-center gap-4 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
          >
            <LogOut size={24} />
            Log Out
          </button>

          <div className="text-center text-[10px] font-black text-ink uppercase tracking-[0.4em] py-4 italic">
            FitGroup // ver_1.2.0
          </div>
        </motion.div>
      )}

      {page === 'settings' && (
        <SettingsPage user={user} onBack={() => setPage('main')} />
      )}

      {page === 'export' && (
        <ExportDataPage user={user} onBack={() => setPage('main')} />
      )}

      {page === 'help' && (
        <HelpFeedbackPage user={user} onBack={() => setPage('main')} />
      )}

      {page === 'security' && (
        <SecurityPage user={user} onBack={() => setPage('main')} />
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
        <ChevronLeft size={20} /> Back / 返回个人中心
      </button>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h2 className="font-black text-ink uppercase tracking-tighter text-xl mb-6 italic">Settings / 身体与个人档案</h2>

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
              {saved ? <><Check size={20} /> 已保存</> : saving ? '保存中...' : 'Save Changes / 保存设置'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
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
    a: '在首页小队专区输入 6 位小队码即可加入队伍；也可点击「创建新小队」生成你的专属邀请码并管理队伍。'
  },
  {
    q: '打卡记录的可见范围？',
    category: '隐私',
    a: '支持公开（全站可见并上榜）、小队仅见（仅队友可见）与私密（仅自己可见）。发布后可随时点击编辑修改。'
  },
  {
    q: '如何添加自定义动作？',
    category: '记录',
    a: '在记录训练页面底部，点击「自定义力量」或「自定义有氧」即可输入动作名称并配置组数/重量/时长。'
  },
  {
    q: '离线状态下可以打卡吗？',
    category: '同步',
    a: '可以。打卡记录会先保存在本地，网络恢复后会自动与云端同步，不会丢失训练记录。'
  },
  {
    q: '身高体重数据会公开吗？',
    category: '隐私',
    a: '不会。身高体重仅用于计算力量分与 BMI，社区中其他用户只能看到你的段位评级，无法查看具体数值。'
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
      showToast('感谢你的反馈！我们会认真评估', 'success');
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
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-500 px-2 py-0.5 text-[10px] font-black">已解决</span>;
      case 'reviewed':
        return <span className="bg-blue-100 text-blue-800 border border-blue-500 px-2 py-0.5 text-[10px] font-black">已跟进</span>;
      default:
        return <span className="bg-neon/30 text-ink border border-ink px-2 py-0.5 text-[10px] font-black">待处理</span>;
    }
  };

  const getTypeLabel = (type: FeedbackType) => {
    switch (type) {
      case 'bug': return '缺陷反馈';
      case 'feature': return '功能建议';
      case 'exercise': return '动作需求';
      default: return '其它交流';
    }
  };

  return (
    <motion.div key="help" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 font-black text-ink uppercase text-sm hover:text-neon transition-colors cursor-pointer">
        <ChevronLeft size={20} /> Back / 返回个人中心
      </button>

      {/* Sub Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-paper p-1.5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <button
          type="button"
          onClick={() => setSubTab('feedback')}
          className={`py-2.5 font-black uppercase text-xs sm:text-sm border-2 border-ink transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            subTab === 'feedback'
              ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-white text-ink hover:bg-neon/20'
          }`}
        >
          <MessageSquarePlus size={16} /> 意见反馈
        </button>
        <button
          type="button"
          onClick={() => setSubTab('faq')}
          className={`py-2.5 font-black uppercase text-xs sm:text-sm border-2 border-ink transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            subTab === 'faq'
              ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-white text-ink hover:bg-neon/20'
          }`}
        >
          <QuestionIcon size={16} /> 常见问题
        </button>
        <button
          type="button"
          onClick={() => setSubTab('about')}
          className={`py-2.5 font-black uppercase text-xs sm:text-sm border-2 border-ink transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            subTab === 'about'
              ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-white text-ink hover:bg-neon/20'
          }`}
        >
          <Info size={16} /> 关于支持
        </button>
      </div>

      {/* 1. 意见反馈 Tab */}
      {subTab === 'feedback' && (
        <div className="space-y-6">
          <form onSubmit={handleSubmitFeedback} className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-5">
            <div>
              <h3 className="font-black text-ink uppercase tracking-tighter text-lg italic mb-2">Submit Feedback / 提交意见</h3>
              <p className="text-xs text-ink/70 font-bold">遇到 Bug、想要新功能或动作预设？随时告诉我们！</p>
            </div>

            {/* Feedback Type Selector */}
            <div>
              <label className="block text-[10px] font-black text-ink uppercase mb-2">反馈类型</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['feature', 'bug', 'exercise', 'other'] as FeedbackType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFeedbackType(t)}
                    className={`py-2.5 px-2 border-2 border-ink font-black text-xs uppercase cursor-pointer transition-all ${
                      feedbackType === t
                        ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,0.4)]'
                        : 'bg-paper text-ink hover:bg-neon/20'
                    }`}
                  >
                    {getTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Input */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-black text-ink uppercase">反馈详情 / 内容描述</label>
                <span className={`text-[10px] font-black ${content.length > 500 ? 'text-red-500' : 'text-ink/40'}`}>
                  {content.length} / 500
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={500}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="请详细描述你遇到的问题或期望实现的功能..."
                className="w-full bg-paper border-4 border-ink p-3 font-bold text-sm text-ink outline-none focus:bg-white resize-none"
              />
            </div>

            {/* Contact Info (Optional) */}
            <div>
              <label className="block text-[10px] font-black text-ink uppercase mb-1.5">
                联系方式 <span className="text-ink/50 font-normal">(选填，便于沟通细节与反馈进度)</span>
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="邮箱 / 微信号 / 手机号"
                className="w-full bg-paper border-4 border-ink p-3 font-bold text-sm text-ink outline-none focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || content.trim().length === 0}
              className="w-full py-3.5 bg-ink text-neon border-4 border-ink font-black uppercase text-base flex items-center justify-center gap-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:bg-neon hover:text-ink transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>正在提交...</>
              ) : (
                <>
                  <Send size={18} /> 发送反馈 / Send Feedback
                </>
              )}
            </button>
          </form>

          {/* Feedback History */}
          <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h4 className="font-black text-ink uppercase tracking-tighter text-sm mb-4 flex items-center gap-2">
              <Clock size={16} /> 我的历史反馈 ({feedbacks.length})
            </h4>

            {loadingFeedbacks ? (
              <div className="text-center py-6 font-bold text-xs text-ink/40">加载反馈记录中...</div>
            ) : feedbacks.length === 0 ? (
              <div className="bg-paper border-2 border-dashed border-ink/20 p-6 text-center">
                <p className="text-xs font-black text-ink/40 uppercase">暂无历史提交记录</p>
                <p className="text-[10px] text-ink/40 mt-1 font-bold">你的每一条宝贵建议都会记录在此</p>
              </div>
            ) : (
              <div className="space-y-3">
                {feedbacks.map((fb) => (
                  <div key={fb.id} className="p-3.5 bg-paper border-2 border-ink space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-ink">{getTypeLabel(fb.type)}</span>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(fb.status)}
                        <span className="text-[10px] text-ink/50 font-bold">
                          {new Date(fb.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-ink/80 whitespace-pre-wrap">{fb.content}</p>
                    {fb.contact && (
                      <p className="text-[10px] text-ink/40 font-mono">联系方式: {fb.contact}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. 常见问题 FAQ Tab */}
      {subTab === 'faq' && (
        <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-ink uppercase tracking-tighter text-lg italic">
              Frequently Asked / 常见问题
            </h3>
            <span className="text-[10px] font-black bg-neon px-2 py-0.5 border border-ink">
              {filteredFaqs.length} 条解答
            </span>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/50" />
            <input
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="搜索问题关键词..."
              className="w-full bg-paper border-4 border-ink pl-10 pr-4 py-2.5 font-bold text-xs text-ink outline-none focus:bg-white"
            />
          </div>

          {/* FAQ Accordion */}
          <div className="space-y-3">
            {filteredFaqs.length === 0 ? (
              <div className="p-8 text-center bg-paper border-2 border-dashed border-ink/20">
                <FileQuestion size={36} className="text-ink/30 mx-auto mb-2" />
                <p className="font-black text-xs text-ink/60">未找到相关问题解答</p>
                <p className="text-[10px] text-ink/40 mt-1">可在「意见反馈」直接向我们提问</p>
              </div>
            ) : (
              filteredFaqs.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={idx} className="border-2 border-ink bg-paper transition-all overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full p-3.5 flex items-start justify-between text-left font-black text-ink text-xs sm:text-sm cursor-pointer hover:bg-neon/10 transition-colors gap-3"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="bg-ink text-neon text-[10px] px-1.5 py-0.5 font-bold shrink-0 mt-0.5">
                          {faq.category}
                        </span>
                        <span className="break-words font-black leading-snug flex-1 text-xs sm:text-sm">{faq.q}</span>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3.5 pt-0 border-t border-ink/10 text-xs font-bold text-ink/80 leading-relaxed break-words whitespace-pre-wrap">
                            {faq.a}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. 关于与支持 Tab */}
      {subTab === 'about' && (
        <div className="space-y-6">
          <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-4 border-b-4 border-ink pb-5 mb-5">
              <div className="w-16 h-16 bg-neon border-4 border-ink flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <Sparkles size={32} className="text-ink" />
              </div>
              <div>
                <h3 className="text-xl font-black text-ink uppercase tracking-tight italic">FitGroup // 健友同行</h3>
                <p className="text-[11px] font-bold text-ink/60">Neo-Brutalism Workout Tracker & Social</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black bg-ink text-neon px-2 py-0.5">v1.2.0</span>
                  <span className="text-[10px] font-bold text-ink/50">Build 2026.08</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black text-ink uppercase tracking-wider mb-2">核心特性</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold text-ink/80">
                  <div className="p-2.5 bg-paper border-2 border-ink flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-ink" /> 相对力量指数与 1RM 评估
                  </div>
                  <div className="p-2.5 bg-paper border-2 border-ink flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-ink" /> 小队打卡协作与出勤排行
                  </div>
                  <div className="p-2.5 bg-paper border-2 border-ink flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-ink" /> 三重隐私等级（公开/小队/私密）
                  </div>
                  <div className="p-2.5 bg-paper border-2 border-ink flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-ink" /> 离线故障自愈与本地容灾
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* =========================================================================
   Security & Account Page
   ========================================================================= */

function SecurityPage({ user, onBack }: { user: any; onBack: () => void }) {
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
      showToast('重置密码链接已发送至你的邮箱，请查收', 'success');
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
      showToast('本地临时缓存与草稿已清理', 'success');
    } catch (err) {
      showToast('清理失败', 'error');
    }
  };

  return (
    <motion.div key="security" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 font-black text-ink uppercase text-sm hover:text-neon transition-colors cursor-pointer">
        <ChevronLeft size={20} /> Back / 返回个人中心
      </button>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-6">
        <h2 className="font-black text-ink uppercase tracking-tighter text-xl italic">
          Security / 账号与安全
        </h2>

        {/* Account Info Card */}
        <div className="bg-paper p-4 border-2 border-ink space-y-3">
          <div className="flex items-center gap-2 font-black text-xs text-ink uppercase">
            <Mail size={16} /> 当前登录账号
          </div>
          <div className="font-mono text-sm font-bold text-ink break-all">
            {user?.email || '已通过匿名/访客凭证登录'}
          </div>
          <div className="text-[10px] text-ink/50 font-bold">
            用户标识 (UID): <span className="font-mono">{user?.id || user?.uid || 'Unknown'}</span>
          </div>
        </div>

        {/* Security Actions */}
        <div className="space-y-3">
          <div className="p-4 border-2 border-ink flex items-center justify-between bg-white">
            <div>
              <span className="font-black text-xs text-ink uppercase block">密码安全与重置</span>
              <span className="text-[10px] text-ink/60 font-bold">向注册邮箱发送重置密码邮件</span>
            </div>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={sendingReset || !user?.email}
              className="bg-neon text-ink border-2 border-ink px-4 py-2 font-black text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
            >
              {sendingReset ? '发送中...' : '重置密码'}
            </button>
          </div>

          <div className="p-4 border-2 border-ink flex items-center justify-between bg-white">
            <div>
              <span className="font-black text-xs text-ink uppercase block">本地缓存管理</span>
              <span className="text-[10px] text-ink/60 font-bold">清理打卡草稿与临时缓存（不影响云端数据）</span>
            </div>
            <button
              type="button"
              onClick={handleClearCache}
              className="bg-paper text-ink border-2 border-ink px-4 py-2 font-black text-xs uppercase hover:bg-red-50 hover:text-red-600 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 size={14} /> 清理缓存
            </button>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="bg-paper p-4 border-2 border-dashed border-ink/30 space-y-1.5">
          <div className="flex items-center gap-2 font-black text-xs text-ink">
            <Lock size={14} /> 数据加密与隐私承诺
          </div>
          <p className="text-[11px] text-ink/70 font-bold leading-relaxed">
            FitGroup 采用 Supabase 行级安全策略 (RLS) 与端到端传输加密。你的私密动态、身体数据（体重、身高等）受到最高级别权限隔离保护。
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* =========================================================================
   Export Data Page
   ========================================================================= */

function ExportDataPage({ user, onBack }: { user: any; onBack: () => void }) {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'json' | 'text' | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const { showToast } = useToast();

  const userId = user?.id || user?.uid;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getUserWorkoutLogs(userId, 1000)
      .then((data) => setLogs(data || []))
      .catch((err) => console.warn('Failed to load logs for export:', err))
      .finally(() => setLoading(false));
  }, [userId]);

  const exportData = useMemo(() => generateExportData(user, logs), [user, logs]);

  const handleExportJson = async () => {
    setExporting('json');
    try {
      const jsonContent = formatExportAsJson(exportData);
      const today = new Date().toISOString().split('T')[0];
      const filename = `fitgroup_export_${today}.json`;
      await exportTextFile(filename, jsonContent, 'application/json');
      showToast('JSON 数据文件已生成并唤起下载/保存', 'success');
    } catch (err: any) {
      console.error('Export JSON failed:', err);
      showToast('导出 JSON 失败，请重试', 'error');
    } finally {
      setExporting(null);
    }
  };

  const handleExportText = async () => {
    setExporting('text');
    try {
      const textContent = formatExportAsText(exportData);
      const today = new Date().toISOString().split('T')[0];
      const filename = `fitgroup_report_${today}.txt`;
      await exportTextFile(filename, textContent, 'text/plain');
      showToast('文本报告文件已生成并唤起下载/保存', 'success');
    } catch (err: any) {
      console.error('Export text failed:', err);
      showToast('导出报告失败，请重试', 'error');
    } finally {
      setExporting(null);
    }
  };

  const handleCopyText = async () => {
    try {
      const textContent = formatExportAsText(exportData);
      await navigator.clipboard.writeText(textContent);
      showToast('已复制完整文本报告到剪贴板', 'success');
    } catch (err) {
      showToast('复制到剪贴板失败', 'error');
    }
  };

  const displayedLogs = showAllLogs ? exportData.workoutLogs : exportData.workoutLogs.slice(0, 5);

  return (
    <motion.div key="export" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 font-black text-ink uppercase text-sm hover:text-neon transition-colors cursor-pointer">
        <ChevronLeft size={20} /> Back / 返回个人中心
      </button>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-6">
        <div>
          <h2 className="font-black text-ink uppercase tracking-tighter text-xl italic flex items-center gap-2">
            <Download size={22} /> Export Data / 健身数据导出
          </h2>
          <p className="text-xs text-ink/70 font-bold mt-1">
            导出你的完整个人身体档案、各维度最大单项重量 (PR) 与累计容量 (Volume)，以及历史训练记录明细。
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 bg-paper p-4 border-2 border-ink">
          <span className="text-[10px] font-black text-ink uppercase tracking-wider block">
            选择导出与备份格式
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={handleExportJson}
              className="py-3 px-4 bg-ink text-neon border-2 border-ink font-black text-xs uppercase flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 hover:bg-neon hover:text-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              <FileJson size={16} />
              {exporting === 'json' ? '生成中...' : '导出 JSON 备份文件'}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={handleExportText}
              className="py-3 px-4 bg-white text-ink border-2 border-ink font-black text-xs uppercase flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 hover:bg-neon transition-colors cursor-pointer disabled:opacity-50"
            >
              <FileText size={16} />
              {exporting === 'text' ? '生成中...' : '导出 文本报告 (.txt)'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopyText}
            className="w-full py-2.5 bg-paper hover:bg-white text-ink border-2 border-dashed border-ink/40 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Copy size={14} /> 复制文本报告到剪贴板 (直接粘贴分享)
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-xs font-bold text-ink/50">正在整理训练历史与统计数据...</div>
        ) : (
          <>
            {/* 1. 个人身体档案 */}
            <div>
              <h3 className="font-black text-ink uppercase tracking-tight text-sm mb-3 flex items-center gap-1.5">
                <UserIcon size={16} /> 一、个人身体档案数据
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-3 bg-paper border-2 border-ink">
                  <span className="text-[10px] font-black text-ink/50 uppercase block">生理性别</span>
                  <span className="text-sm font-black text-ink">{exportData.profile.sexZh}</span>
                </div>
                <div className="p-3 bg-paper border-2 border-ink">
                  <span className="text-[10px] font-black text-ink/50 uppercase block">身高</span>
                  <span className="text-sm font-black text-ink">
                    {exportData.profile.heightCm ? `${exportData.profile.heightCm} cm` : '未设置'}
                  </span>
                </div>
                <div className="p-3 bg-paper border-2 border-ink">
                  <span className="text-[10px] font-black text-ink/50 uppercase block">体重</span>
                  <span className="text-sm font-black text-ink">
                    {exportData.profile.bodyweightKg ? `${exportData.profile.bodyweightKg} kg` : '未设置'}
                  </span>
                </div>
                <div className="p-3 bg-paper border-2 border-ink">
                  <span className="text-[10px] font-black text-ink/50 uppercase block">BMI 指数</span>
                  <span className="text-sm font-black text-ink">
                    {exportData.profile.bmi !== null ? `${exportData.profile.bmi} (${exportData.profile.bmiCategoryZh})` : '未设置'}
                  </span>
                </div>
                <div className="p-3 bg-paper border-2 border-ink">
                  <span className="text-[10px] font-black text-ink/50 uppercase block">累计打卡</span>
                  <span className="text-sm font-black text-ink">{exportData.profile.totalWorkouts} 次</span>
                </div>
                <div className="p-3 bg-paper border-2 border-ink">
                  <span className="text-[10px] font-black text-ink/50 uppercase block">连续打卡</span>
                  <span className="text-sm font-black text-ink">{exportData.profile.streak} 天</span>
                </div>
              </div>
            </div>

            {/* 2. 各维度最大重量与容量 */}
            <div>
              <h3 className="font-black text-ink uppercase tracking-tight text-sm mb-3 flex items-center gap-1.5">
                <Dumbbell size={16} /> 二、各维度最大重量 (PR) 与累计容量 (Volume)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.values(exportData.dimensionSummaries).map((dim) => {
                  const isCardio = dim.category === 'Cardio';
                  const prEntries = Object.entries(dim.prs);

                  return (
                    <div key={dim.category} className="p-3.5 bg-paper border-2 border-ink space-y-2">
                      <div className="flex items-center justify-between border-b border-ink/20 pb-1.5">
                        <span className="font-black text-xs text-ink uppercase flex items-center gap-1">
                          <Layers size={14} /> {dim.nameZh} ({dim.nameEn})
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-white px-1.5 py-0.5 border border-ink">
                          {dim.workoutCount} 次训练
                        </span>
                      </div>

                      {isCardio ? (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] font-black text-ink/50 block">总时长</span>
                            <span className="font-mono font-bold text-ink">{dim.cardioMinutes || 0} 分钟</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-black text-ink/50 block">总能量消耗</span>
                            <span className="font-mono font-bold text-ink">~{(dim.cardioCaloriesKcal || 0).toLocaleString()} kcal</span>
                          </div>
                          {(dim.cardioDistanceKm || 0) > 0 && (
                            <div className="col-span-2">
                              <span className="text-[10px] font-black text-ink/50 block">总距离</span>
                              <span className="font-mono font-bold text-ink">{dim.cardioDistanceKm} km</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] font-black text-ink/50 block">最大单项重量</span>
                              <span className="font-black text-ink text-sm">
                                {dim.maxWeightKg > 0 ? `${dim.maxWeightKg} kg` : '暂无'}
                              </span>
                              {dim.bestExerciseName && (
                                <span className="text-[9px] text-ink/60 block truncate" title={dim.bestExerciseName}>
                                  {dim.bestExerciseName}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="text-[10px] font-black text-ink/50 block">累计总容量</span>
                              <span className="font-black text-ink text-sm font-mono">
                                {dim.totalVolumeKg.toLocaleString()} kg
                              </span>
                              <span className="text-[9px] text-ink/60 block">共 {dim.totalSets} 组</span>
                            </div>
                          </div>

                          {prEntries.length > 0 && (
                            <div className="pt-1.5 border-t border-ink/10">
                              <span className="text-[9px] font-black text-ink/50 uppercase block mb-1">
                                动作成绩记录 ({prEntries.length}):
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {prEntries.slice(0, 4).map(([name, w]) => (
                                  <span key={name} className="text-[10px] font-bold bg-white border border-ink/40 px-1.5 py-0.5">
                                    {name}: <span className="font-mono font-black">{w}kg</span>
                                  </span>
                                ))}
                                {prEntries.length > 4 && (
                                  <span className="text-[9px] text-ink/50 self-center font-bold">
                                    +{prEntries.length - 4} 更多
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. 历史训练打卡简略记录 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-ink uppercase tracking-tight text-sm flex items-center gap-1.5">
                  <Activity size={16} /> 三、历史训练打卡记录明细 ({exportData.workoutLogs.length} 次)
                </h3>
                {exportData.workoutLogs.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllLogs(!showAllLogs)}
                    className="text-[10px] font-black text-ink hover:text-neon underline cursor-pointer"
                  >
                    {showAllLogs ? '收起部分' : `展开全部 (${exportData.workoutLogs.length})`}
                  </button>
                )}
              </div>

              {exportData.workoutLogs.length === 0 ? (
                <div className="p-6 text-center bg-paper border-2 border-dashed border-ink/20">
                  <p className="text-xs font-black text-ink/40">暂无训练打卡记录</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {displayedLogs.map((log, idx) => (
                    <div key={log.id || idx} className="p-3 bg-paper border-2 border-ink space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-[11px] text-ink">
                          {log.date} {log.time}
                        </span>
                        <span className="font-black text-[10px] bg-white border border-ink px-1.5 py-0.5">
                          {log.categories}
                        </span>
                      </div>

                      {log.totalVolumeKg > 0 && (
                        <div className="text-[10px] font-bold text-ink/60">
                          总容量: <span className="font-mono font-black text-ink">{log.totalVolumeKg.toLocaleString()} kg</span> ({log.totalSets} 组)
                        </div>
                      )}

                      {log.exercises.length > 0 && (
                        <ul className="space-y-0.5 pt-1 text-[11px] text-ink/80">
                          {log.exercises.map((ex, eIdx) => (
                            <li key={eIdx} className="font-bold truncate">
                              • {ex}
                            </li>
                          ))}
                        </ul>
                      )}

                      {log.note && (
                        <p className="text-[10px] font-bold text-ink/60 pt-0.5 italic">
                          💬 {log.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function ProfileItem({
  icon,
  label,
  count,
  onClick
}: {
  icon: any;
  label: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between p-5 hover:bg-neon transition-colors cursor-pointer group text-left"
    >
      <div className="flex items-center gap-4">
        <div className="text-ink group-hover:scale-110 transition-transform">{icon}</div>
        <span className="font-black text-ink uppercase tracking-tighter text-base sm:text-lg">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {count !== undefined && count > 0 && (
          <span className="bg-neon text-ink border-2 border-ink text-[10px] font-black px-2 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
            {count}
          </span>
        )}
        <div className="w-2 h-2 bg-ink/20 group-hover:bg-ink transition-colors" />
      </div>
    </button>
  );
}
