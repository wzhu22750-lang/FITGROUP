import { useState, useEffect, FormEvent } from 'react';
import { createTeam, joinTeamByCode } from '../api';
import { Team } from '../types';
import { DEFAULT_MAX_TEAM_MEMBERS, MIN_TEAM_MEMBERS, MAX_TEAM_MEMBERS_LIMIT } from '../constants/teamConfig';
import { Users, Plus, KeyRound, X, Check, Copy, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { pushBackHandler } from '../backStack';

interface CreateTeamModalProps {
  onClose: () => void;
  onSuccess: (team: Team) => void;
}

export function CreateTeamModal({ onClose, onSuccess }: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [maxMembers, setMaxMembers] = useState(DEFAULT_MAX_TEAM_MEMBERS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdTeam, setCreatedTeam] = useState<Team | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return pushBackHandler(() => {
      onClose();
      return true;
    });
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('请输入小队名称');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const team = await createTeam(cleanName, maxMembers);
      setCreatedTeam(team);
    } catch (err) {
      console.error('Create team failed:', err);
      setErrorMsg((err as Error)?.message || '创建小队失败，请重试');
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleFinish = () => {
    if (createdTeam) {
      onSuccess(createdTeam);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white border-4 border-ink shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm overflow-hidden"
      >
        <div className="bg-neon border-b-4 border-ink p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-ink" />
            <h3 className="font-black text-ink uppercase tracking-tight text-base italic">
              {createdTeam ? '小队创建成功' : '创建好友小队'}
            </h3>
          </div>
          <button
            type="button"
            onClick={createdTeam ? handleFinish : onClose}
            className="p-1 border-2 border-ink bg-white hover:bg-ink hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {createdTeam ? (
          <div className="p-6 text-center space-y-4">
            <div className="bg-neon/30 border-2 border-ink p-4 space-y-2">
              <span className="text-xs font-black text-ink/70 uppercase block">你的小队专属加入口令</span>
              <div className="text-2xl sm:text-3xl font-black text-ink tracking-widest uppercase bg-white border-2 border-ink py-2 px-3 inline-block shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {createdTeam.code}
              </div>
              <p className="text-[11px] font-bold text-ink/60 mt-1">
                队名：「{createdTeam.name}」 · 人数上限 {createdTeam.maxMembers} 人
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCopyCode(createdTeam.code)}
              className="w-full bg-paper text-ink border-2 border-ink py-2.5 px-4 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copied ? '口令已复制到剪贴板！' : '一键复制口令发给好友'}</span>
            </button>

            <button
              type="button"
              onClick={handleFinish}
              className="w-full bg-ink text-neon border-2 border-ink py-3 font-black uppercase text-sm shadow-[4px_4px_0px_0px_rgba(223,255,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              进入小队看板
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {errorMsg && (
              <div className="bg-red-500 text-white border-2 border-ink p-2.5 font-black text-xs uppercase">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-ink uppercase tracking-wider mb-1.5">
                小队名称 / Team Name
              </label>
              <input
                type="text"
                placeholder="例如: 早起撸铁突击队"
                maxLength={50}
                value={name}
                onChange={(e) => { setName(e.target.value); setErrorMsg(''); }}
                className="w-full bg-paper border-2 border-ink p-2.5 font-black text-ink text-sm outline-none focus:bg-white uppercase placeholder:opacity-40"
                autoFocus
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-ink uppercase tracking-wider">
                  人数上限 / Capacity
                </label>
                <span className="text-xs font-black bg-neon text-ink px-1.5 border border-ink">
                  {maxMembers} 人
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[3, 5, 8, 12].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxMembers(num)}
                    className={`py-1.5 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer ${
                      maxMembers === num
                        ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]'
                        : 'bg-paper text-ink/70 hover:bg-neon'
                    }`}
                  >
                    {num} 人
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold text-ink/50 mt-1">
                推荐 3 ~ 8 人同频打卡，互相监督出勤
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-white text-ink border-2 border-ink py-2.5 font-black uppercase text-xs hover:bg-paper cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="flex-1 bg-ink text-neon border-2 border-ink py-2.5 font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? '创建中...' : '确认创建'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

interface JoinTeamModalProps {
  onClose: () => void;
  onSuccess: (team: Team) => void;
}

export function JoinTeamModal({ onClose, onSuccess }: JoinTeamModalProps) {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return pushBackHandler(() => {
      onClose();
      return true;
    });
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('请输入小队加入口令');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const team = await joinTeamByCode(cleanCode);
      onSuccess(team);
      onClose();
    } catch (err) {
      console.error('Join team failed:', err);
      setErrorMsg((err as Error)?.message || '加入失败，请检查口令');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white border-4 border-ink shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm overflow-hidden"
      >
        <div className="bg-neon border-b-4 border-ink p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={20} className="text-ink" />
            <h3 className="font-black text-ink uppercase tracking-tight text-base italic">
              输入口令加入小队
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 border-2 border-ink bg-white hover:bg-ink hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="bg-red-500 text-white border-2 border-ink p-2.5 font-black text-xs uppercase">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-ink uppercase tracking-wider mb-1.5">
              小队口令 / Join Code
            </label>
            <input
              type="text"
              placeholder="例如: FIT-888"
              maxLength={20}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setErrorMsg(''); }}
              className="w-full bg-paper border-2 border-ink p-3 font-black text-ink text-center text-lg tracking-widest outline-none focus:bg-white uppercase placeholder:opacity-30 placeholder:tracking-normal"
              autoFocus
              required
            />
            <p className="text-[10px] font-bold text-ink/50 mt-1.5">
              向已创建小队的好友获取 6 位口令，加入后即可在小队看板中查看彼此动态与今日出勤
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white text-ink border-2 border-ink py-2.5 font-black uppercase text-xs hover:bg-paper cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="flex-1 bg-ink text-neon border-2 border-ink py-2.5 font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? '验证中...' : '加入小队'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
