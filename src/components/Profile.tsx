import { useState, useEffect } from 'react';
import { getCurrentUser, updateUserProfileFn, submitFeedbackFn, fetchUserFeedbacksFn } from '../api';
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
  Copy,
  Trash2,
  Lock,
  Mail,
  Search,
  Sparkles,
  CheckCircle2,
  Clock,
  KeyRound,
  FileQuestion,
  HelpCircle as QuestionIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pushBackHandler } from '../backStack';
import { useToast } from './Toast';
import type { FeedbackType, UserFeedback } from '../types';

interface ProfileProps {
  user: any;
  onLogout: () => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
}

export default function Profile({ user, onLogout, unreadCount = 0, onOpenNotifications }: ProfileProps) {
  const [page, setPage] = useState<'main' | 'settings' | 'help' | 'security'>('main');

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
              {user?.email || '健友用户'}
            </p>
          </div>

          <div className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] divide-y-4 divide-ink">
            <ProfileItem
              icon={<Bell size={20} />}
              label="Notification / 消息通知"
              count={unreadCount > 0 ? unreadCount : undefined}
              onClick={onOpenNotifications}
            />
            <ProfileItem
              icon={<Shield size={20} />}
              label="Security / 账号与安全"
              onClick={() => setPage('security')}
            />
            <ProfileItem
              icon={<Settings size={20} />}
              label="Settings / 身体与个人档案"
              onClick={() => setPage('settings')}
            />
            <ProfileItem
              icon={<HelpCircle size={20} />}
              label="Help & Feedback / 帮助与反馈"
              onClick={() => setPage('help')}
            />
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

/* =========================================================================
   Help & Feedback Page
   ========================================================================= */

const FAQ_LIST = [
  {
    q: '力量分 (Power Score) 是如何评定的？',
    category: '评分机制',
    a: 'FitGroup 采用相对力量指数算法。系统根据你的体重与生理性别，结合三大项（卧推/深蹲/硬拉）以及主要复合动作的 1RM 最大做功表现，通过幂函数基准换算评定初学、进阶、高阶及大师级别，真实反映你的自重相对力量水平。'
  },
  {
    q: '如何创建、加入或管理健身小队？',
    category: '小队协作',
    a: '在首页「小队」专区，输入 6 位小队码即可直接加入队伍；你也可以点击「创建新小队」自建队伍并生成专属邀请码。小队支持每日队员打卡排行、出勤率统计与小队动态墙。'
  },
  {
    q: '打卡记录的可见范围有哪些？如何保护隐私？',
    category: '隐私与安全',
    a: '打卡支持三种可见范围：\n• 公开 (Public)：全站可见并计入公共信息流与排行榜；\n• 小队仅见 (Team)：仅你所在小队的队友可见；\n• 私密 (Private)：仅自己可见。\n发布后可在「我的打卡」随时点击「编辑」修改可见范围。'
  },
  {
    q: '如何添加自定义动作或有氧项目？',
    category: '训练记录',
    a: '在「记录训练」页面，点击底部的「自定义力量」或「自定义有氧」按钮，即可自由输入动作名称并配置组数/重量或时长/消耗。系统会自动保存你的常用动作以便下次快速选择。'
  },
  {
    q: '网络不稳定或离线时可以打卡吗？',
    category: '数据同步',
    a: '可以！FitGroup 内置本地离线容灾策略。即使断网，打卡记录也会保存在本地，网络恢复后会自动与 Supabase 云端同步，不会丢失训练成果。'
  },
  {
    q: '身体数据（身高/体重）会被公开展示吗？',
    category: '隐私与安全',
    a: '绝对不会。你的具体身高和体重仅保存在个人设置中，用于计算力量分与 BMI 参考值，其他用户在社区和排行榜中只能看到你的力量分等级，无法查看到你的实际体重。'
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`已复制${label}到剪贴板`, 'success');
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
      case 'bug': return '🐛 缺陷反馈';
      case 'feature': return '💡 功能建议';
      case 'exercise': return '🏋️ 动作需求';
      default: return '💬 其它交流';
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-black text-ink uppercase tracking-tighter text-lg italic">Submit Feedback / 提交意见</h3>
                <span className="text-[10px] font-black bg-neon px-2 py-0.5 border border-ink">直达开发者</span>
              </div>
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
              placeholder="搜索问题关键词 (如: 力量分、小队、隐私、离线)..."
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
                  <div key={idx} className="border-2 border-ink bg-paper transition-all">
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full p-4 flex items-center justify-between text-left font-black text-ink text-xs sm:text-sm cursor-pointer hover:bg-neon/10 transition-colors"
                    >
                      <div className="flex items-center gap-2 pr-3">
                        <span className="bg-ink text-neon text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-mono">
                          {faq.category}
                        </span>
                        <span>{faq.q}</span>
                      </div>
                      {isOpen ? <ChevronUp size={18} className="shrink-0" /> : <ChevronDown size={18} className="shrink-0" />}
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 pt-0 border-t border-ink/10 text-xs font-bold text-ink/80 leading-relaxed whitespace-pre-wrap">
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
                <h4 className="text-xs font-black text-ink uppercase tracking-wider mb-2">⚡ 核心特性</h4>
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

              <div>
                <h4 className="text-xs font-black text-ink uppercase tracking-wider mb-2">📬 联系开发者与技术支持</h4>
                <div className="space-y-2">
                  <div className="p-3 bg-paper border-2 border-ink flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-ink/50 uppercase block">官方支持邮箱</span>
                      <span className="text-xs font-mono font-bold text-ink">feedback@fitgroup.app</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('feedback@fitgroup.app', '邮箱')}
                      className="p-2 border-2 border-ink bg-white hover:bg-neon transition-colors cursor-pointer"
                      title="复制邮箱"
                    >
                      <Copy size={14} />
                    </button>
                  </div>

                  <div className="p-3 bg-paper border-2 border-ink flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-ink/50 uppercase block">健友交流与反馈群</span>
                      <span className="text-xs font-mono font-bold text-ink">QQ/微信群: 883902114</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('883902114', '群号')}
                      className="p-2 border-2 border-ink bg-white hover:bg-neon transition-colors cursor-pointer"
                      title="复制群号"
                    >
                      <Copy size={14} />
                    </button>
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
