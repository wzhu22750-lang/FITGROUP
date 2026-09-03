import { useState, useEffect, useRef } from 'react';
import {
  getUserTeams,
  subscribeToUserTeams,
  getTeamDashboard,
  subscribeToTeamDashboard,
  subscribeToTeamWorkoutLogs,
  leaveTeam,
  getCurrentUser,
} from '../api';
import { Team, TeamDashboardData, WorkoutLog } from '../types';
import { CreateTeamModal, JoinTeamModal } from './TeamModals';
import LogCard from './LogCard';
import {
  Users,
  Plus,
  KeyRound,
  Copy,
  Check,
  Flame,
  User as UserIcon,
  Crown,
  LogOut,
  ChevronDown,
  Activity,
  Zap,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TeamDashboardProps {
  onLogUpdated?: () => void;
}

export default function TeamDashboard({ onLogUpdated }: TeamDashboardProps) {
  const currentUser = getCurrentUser();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [dashboardData, setDashboardData] = useState<TeamDashboardData | null>(null);
  const [teamLogs, setTeamLogs] = useState<WorkoutLog[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [teamLogsError, setTeamLogsError] = useState('');
  const [copied, setCopied] = useState(false);
  const recentLogUpdates = useRef<Record<string, Partial<WorkoutLog> & { id: string }>>({});

  const reconcileRecentUpdates = (logs: WorkoutLog[]) => logs
    .filter((log) => {
      const update = recentLogUpdates.current[log.id];
      return !(update?.visibility && update.visibility === 'private');
    })
    .map((log) => ({ ...log, ...(recentLogUpdates.current[log.id] || {}) }));

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showTeamSwitcher, setShowTeamSwitcher] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  // 1. Subscribe to user's joined teams
  useEffect(() => {
    if (!currentUser) {
      setLoadingTeams(false);
      return;
    }

    const unsub = subscribeToUserTeams(
      currentUser.uid,
      (userTeams) => {
        setTeams(userTeams);
        setTeamsError('');
        setLoadingTeams(false);

        if (userTeams.length > 0) {
          setSelectedTeamId((prev) => {
            if (prev && userTeams.some((t) => t.id === prev)) return prev;
            return userTeams[0].id;
          });
        } else {
          setSelectedTeamId('');
        }
      },
      (error) => {
        setTeamsError(error.message || '小队列表加载失败');
        setLoadingTeams(false);
      },
    );

    return () => unsub();
  }, [currentUser?.uid]);

  // 2. Subscribe to selected team dashboard
  useEffect(() => {
    if (!selectedTeamId) {
      setDashboardData(null);
      return;
    }

    setLoadingDashboard(true);
    const unsub = subscribeToTeamDashboard(
      selectedTeamId,
      (data) => {
        setDashboardData(data);
        setDashboardError('');
        setLoadingDashboard(false);
      },
      (error) => {
        setDashboardError(error.message || '小队数据加载失败');
        setLoadingDashboard(false);
      }
    );

    return () => unsub();
  }, [selectedTeamId]);

  // 3. Subscribe to selected team's workout logs feed
  useEffect(() => {
    if (!selectedTeamId) {
      setTeamLogs([]);
      return;
    }

    const unsub = subscribeToTeamWorkoutLogs(
      selectedTeamId,
      (logs) => {
        setTeamLogs(reconcileRecentUpdates(logs));
        setTeamLogsError('');
      },
      (error) => setTeamLogsError(error.message || '小队动态加载失败'),
    );

    return () => unsub();
  }, [selectedTeamId]);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleLeaveTeam = async () => {
    if (!leaveConfirm) {
      setLeaveConfirm(true);
      setTimeout(() => setLeaveConfirm(false), 3500);
      return;
    }
    if (!selectedTeamId) return;

    try {
      await leaveTeam(selectedTeamId);
      setLeaveConfirm(false);
      const remaining = teams.filter((t) => t.id !== selectedTeamId);
      setTeams(remaining);
      if (remaining.length > 0) {
        setSelectedTeamId(remaining[0].id);
      } else {
        setSelectedTeamId('');
      }
    } catch (err) {
      console.error('Leave team failed:', err);
    }
  };

  if (loadingTeams) {
    return (
      <div className="py-16 text-center space-y-3">
        <Activity size={32} className="text-ink animate-spin inline-block" />
        <p className="font-black text-xs uppercase tracking-widest text-ink/60">加载小队数据中...</p>
      </div>
    );
  }

  // Empty State: user has not joined any team yet
  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        {teamsError && (
          <div className="bg-amber-100 border-2 border-ink px-3 py-2 text-xs font-bold text-ink">
            小队列表暂时无法刷新，请稍后重试。{teamsError}
          </div>
        )}
        <div className="bg-white border-4 border-ink p-8 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-5">
          <div className="w-16 h-16 bg-neon border-4 border-ink mx-auto flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <Users size={32} className="text-ink" />
          </div>

          <div>
            <h3 className="text-xl font-black text-ink uppercase tracking-tight italic">
              还没有加入好友小队
            </h3>
            <p className="text-xs font-black text-ink/60 mt-1 max-w-xs mx-auto">
              创建属于你们的训练突击小队，或者输入好友给的口令，一起打卡监督出勤！
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="bg-neon text-ink border-2 border-ink py-3.5 px-4 font-black uppercase text-xs flex items-center justify-center gap-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              <Plus size={16} /> 创建新小队
            </button>
            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="bg-ink text-white border-2 border-ink py-3.5 px-4 font-black uppercase text-xs flex items-center justify-center gap-2 shadow-[3px_3px_0px_0px_rgba(223,255,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              <KeyRound size={16} /> 输入口令加入
            </button>
          </div>
        </div>

        {/* Modals */}
        <AnimatePresence>
          {showCreateModal && (
            <CreateTeamModal
              onClose={() => setShowCreateModal(false)}
              onSuccess={(newTeam) => {
                setTeams((prev) => [newTeam, ...prev]);
                setSelectedTeamId(newTeam.id);
                setShowCreateModal(false);
              }}
            />
          )}
          {showJoinModal && (
            <JoinTeamModal
              onClose={() => setShowJoinModal(false)}
              onSuccess={(joinedTeam) => {
                setTeams((prev) => [joinedTeam, ...prev]);
                setSelectedTeamId(joinedTeam.id);
                setShowJoinModal(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  const currentTeam = teams.find((t) => t.id === selectedTeamId) || teams[0];
  const isTeamOwner = Boolean(currentUser && currentTeam?.createdBy === currentUser.uid);

  return (
    <div className="space-y-6">
      {dashboardError && (
        <div className="bg-amber-100 border-2 border-ink px-3 py-2 text-xs font-bold text-ink">
          小队数据暂时无法刷新，当前仍显示上次成功加载的数据。{dashboardError}
        </div>
      )}

      {/* 1. Squad Header & Team Switcher */}
      <div className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 sm:p-5 relative">
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Team Switcher dropdown trigger */}
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setShowTeamSwitcher(!showTeamSwitcher)}
              className="flex items-center gap-1.5 font-black text-ink text-base sm:text-lg uppercase tracking-tight truncate hover:text-neon transition-colors cursor-pointer"
            >
              <span className="truncate">{currentTeam?.name}</span>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${showTeamSwitcher ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu for multiple teams */}
            <AnimatePresence>
              {showTeamSwitcher && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute left-0 top-full mt-2 z-40 bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-64 divide-y-2 divide-ink"
                >
                  <div className="p-2 bg-paper text-[10px] font-black uppercase text-ink/60">
                    我加入的小队 ({teams.length})
                  </div>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTeamId(t.id);
                        setShowTeamSwitcher(false);
                      }}
                      className={`w-full text-left p-2.5 font-black text-xs uppercase flex items-center justify-between hover:bg-neon cursor-pointer ${
                        t.id === selectedTeamId ? 'bg-neon/30' : ''
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      {t.id === selectedTeamId && <Check size={14} className="shrink-0 text-ink" />}
                    </button>
                  ))}
                  <div className="p-2 bg-paper flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setShowTeamSwitcher(false); setShowCreateModal(true); }}
                      className="flex-1 bg-white border border-ink py-1 text-[10px] font-black uppercase hover:bg-neon"
                    >
                      + 新建小队
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowTeamSwitcher(false); setShowJoinModal(true); }}
                      className="flex-1 bg-white border border-ink py-1 text-[10px] font-black uppercase hover:bg-neon"
                    >
                      输入口令
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions & Code */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyCode(currentTeam.code)}
              className="bg-paper text-ink border-2 border-ink px-2 py-1 text-[10px] sm:text-xs font-black uppercase flex items-center gap-1 hover:bg-neon transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5"
              title="点击复制口令"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              <span className="tracking-wider">{currentTeam.code}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="bg-white text-ink border-2 border-ink p-1 hover:bg-neon transition-colors cursor-pointer"
              title="加入更多小队"
            >
              <Plus size={16} />
            </button>

            <button
              type="button"
              onClick={handleLeaveTeam}
              className={`p-1 border-2 border-ink transition-colors cursor-pointer ${
                leaveConfirm ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-ink/40 hover:text-red-500 hover:border-red-500'
              }`}
              title={leaveConfirm ? '点击确认退出小队' : '退出小队'}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* 2. Attendance & Check-in Dashboard */}
        {dashboardData && (
          <div className="space-y-4 pt-1">
            {/* Attendance Progress Box */}
            <div className="bg-paper border-2 border-ink p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <Zap size={16} className="text-ink fill-current" />
                  <span className="text-xs font-black text-ink uppercase tracking-wide">
                    今日出勤看板
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-ink">
                    {dashboardData.todayCheckinCount} / {dashboardData.totalMembers} 人已打卡
                  </span>
                  <span className="text-xs font-black bg-neon text-ink px-1.5 py-0.2 border border-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    {dashboardData.attendanceRate}%
                  </span>
                </div>
              </div>

              {/* Attendance Progress Bar */}
              <div className="w-full bg-white border-2 border-ink h-3.5 overflow-hidden p-0.5 relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(dashboardData.attendanceRate, 100)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full bg-neon border-r-2 border-ink"
                />
              </div>
            </div>

            {/* 3. Member Avatar Wall & List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-black text-ink/60 uppercase">
                <span>小队成员 ({dashboardData.totalMembers}/{currentTeam.maxMembers} 人)</span>
                <span>今日状态</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dashboardData.members.map((m) => (
                  <div
                    key={m.userId}
                    className={`p-2.5 border-2 border-ink flex items-center justify-between gap-2 transition-all ${
                      m.hasCheckedInToday ? 'bg-neon/15' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="relative border-2 border-ink p-0.5 bg-paper shrink-0">
                        {m.profile?.photoURL ? (
                          <img src={m.profile.photoURL} className="w-8 h-8 object-cover" />
                        ) : (
                          <div className="w-8 h-8 bg-paper flex items-center justify-center">
                            <UserIcon size={14} className="text-ink/30" />
                          </div>
                        )}
                        {m.role === 'owner' && (
                          <div className="absolute -top-1.5 -right-1.5 bg-amber-400 border border-ink p-0.5" title="队长">
                            <Crown size={9} className="text-ink fill-current" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="font-black text-xs text-ink truncate" title={m.profile?.displayName}>
                            {m.profile?.displayName || '队员'}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-ink/50 flex items-center gap-0.5">
                          <Flame size={10} className="text-amber-500 fill-current" />
                          <span>连续 {m.profile?.streak || 0} 天</span>
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {m.hasCheckedInToday ? (
                        <span className="bg-ink text-neon border border-ink px-1.5 py-0.5 text-[10px] font-black uppercase flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]">
                          <Check size={11} className="stroke-[3]" />
                          <span>已练 {m.todayWorkoutCount && m.todayWorkoutCount > 1 ? `x${m.todayWorkoutCount}` : ''}</span>
                        </span>
                      ) : (
                        <span className="bg-paper text-ink/50 border border-ink/40 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          待打卡
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Team Workout Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-ink uppercase tracking-tight text-sm flex items-center gap-1.5 italic">
            <Sparkles size={16} className="text-ink" />
            <span>队内打卡动态流 / SQUAD LOGS</span>
          </h3>
          <span className="text-[10px] font-black text-ink/50 uppercase">
            共 {teamLogs.length} 条记录
          </span>
        </div>

        {teamLogsError && teamLogs.length === 0 ? (
          <div className="bg-amber-100 border-4 border-ink p-10 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
            <Activity size={32} className="text-ink/50 mx-auto" />
            <p className="font-black text-ink/70 text-sm uppercase">小队动态加载失败</p>
            <p className="text-xs font-bold text-ink/50">{teamLogsError}</p>
          </div>
        ) : teamLogs.length === 0 ? (
          <div className="bg-white border-4 border-ink p-10 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
            <Users size={32} className="text-ink/30 mx-auto" />
            <p className="font-black text-ink/60 text-sm uppercase">
              本小队成员暂无打卡动态
            </p>
            <p className="text-xs font-bold text-ink/40">
              去打卡页面完成今日训练，小队成员就能在此互相点赞互动！
            </p>
          </div>
        ) : (
          teamLogs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              onLogUpdated={(updated) => {
                if (updated?.id) {
                  recentLogUpdates.current[updated.id] = updated;
                  window.setTimeout(() => {
                    delete recentLogUpdates.current[updated.id];
                  }, 30_000);
                  setTeamLogs((prev) => {
                    if (updated.visibility === 'private') {
                      return prev.filter((log) => log.id !== updated.id);
                    }
                    return prev.map((log) =>
                      log.id === updated.id ? { ...log, ...updated } : log
                    );
                  });
                }
                onLogUpdated?.();
                if (selectedTeamId) {
                  void getTeamDashboard(selectedTeamId).then(setDashboardData);
                }
              }}
            />
          ))
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateTeamModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={(newTeam) => {
              setTeams((prev) => [newTeam, ...prev]);
              setSelectedTeamId(newTeam.id);
              setShowCreateModal(false);
            }}
          />
        )}
        {showJoinModal && (
          <JoinTeamModal
            onClose={() => setShowJoinModal(false)}
            onSuccess={(joinedTeam) => {
              setTeams((prev) => [joinedTeam, ...prev]);
              setSelectedTeamId(joinedTeam.id);
              setShowJoinModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
