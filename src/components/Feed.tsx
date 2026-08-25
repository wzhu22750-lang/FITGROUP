import { useState, useEffect, useRef } from 'react';
import { pushBackHandler } from '../backStack';
import { subscribeToWorkoutLogs, getCurrentUser, toggleLike, checkUserLike, subscribeToComments, addComment, getUserProfile, deleteWorkoutLog } from '../firebase';
import { WorkoutLog, WorkoutCategory } from '../types';
import { Heart, MessageCircle, Share2, Clock, Dumbbell, User as UserIcon, Send, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';
import SharePosterModal from './SharePosterModal';

export default function Feed() {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const touchY = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setLoading(true);
    const channel = subscribeToWorkoutLogs((data) => {
      setLogs(data as WorkoutLog[]);
      setLoading(false);
      setError('');
    }, (err) => {
      setError(err.message || '网络异常，请稍后重试');
      setLoading(false);
    });

    return () => channel();
  }, []);

  const handlePullRefresh = () => {
    setRefreshing(true);
    const stop = subscribeToWorkoutLogs((data) => {
      setLogs(data as WorkoutLog[]);
      setLoading(false);
      setError('');
      setRefreshing(false);
      stop();
    }, (err) => {
      setError(err.message || '网络异常，请稍后重试');
      setRefreshing(false);
      stop();
    });
  };

  if (loading && logs.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white h-64 rounded-3xl animate-pulse border border-slate-100" />
        ))}
      </div>
    );
  }

  if (error && logs.length === 0) {
    return (
      <div className="bg-white border-4 border-ink p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <p className="font-black text-ink text-xl mb-4 uppercase">加载失败</p>
        <p className="text-ink/50 font-bold text-sm mb-6">{error}</p>
        <button
          onClick={handlePullRefresh}
          className="bg-neon text-ink border-2 border-ink px-6 py-3 font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        if (e.changedTouches[0].clientY - touchY.current > 80 && window.scrollY < 10) {
          handlePullRefresh();
        }
      }}
    >
      {refreshing && (
        <div className="text-center py-2">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} className="inline-block">
            <Dumbbell size={20} className="text-neon" />
          </motion.div>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 italic text-slate-400">
          还没有人打卡，快来做第一个"卷王"吧！
        </div>
      ) : (
        logs.map((log) => <LogCard key={log.id} log={log} />)
      )}
    </div>
  );
}

function LogCard({ log }: { log: WorkoutLog; key?: string }) {
  const [hasLiked, setHasLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [userStats, setUserStats] = useState<{ streak: number; totalWorkouts: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const currentUser = getCurrentUser();
  const isOwner = Boolean(currentUser && log.userId === currentUser.uid);

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3500);
      return;
    }
    if (!log.id || deleting) return;
    setDeleting(true);
    try {
      await deleteWorkoutLog(log.id);
    } catch (e) {
      console.error('Delete failed:', e);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || !log.id) return;
    checkUserLike(log.id, user.uid).then(setHasLiked);
  }, [log.id]);

  useEffect(() => {
    if (!showComments || !log.id) return;
    const unsub = subscribeToComments(log.id, setComments);
    return () => unsub();
  }, [showComments, log.id]);

  useEffect(() => {
    if (!showComments) return;
    return pushBackHandler(() => {
      setShowComments(false);
      return true;
    });
  }, [showComments]);

  const handleToggleLike = async () => {
    const user = getCurrentUser();
    if (!user || !log.id) return;
    const prev = hasLiked;
    setHasLiked(!prev);
    try {
      await toggleLike(log.id, user.uid, prev);
    } catch {
      setHasLiked(prev);
    }
  };

  const handleSendComment = async () => {
    const user = getCurrentUser();
    if (!user || !log.id || !commentText.trim()) return;
    setSending(true);
    setCommentError('');
    try {
      await addComment(log.id, user.uid, user.displayName || 'User', user.photoURL || '', commentText.trim());
      setCommentText('');
    } catch (e) {
      console.error('Comment failed:', e);
      setCommentError('评论发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const handleShare = async () => {
    try {
      const user = getCurrentUser();
      if (user) {
        const profile = await getUserProfile(user.uid);
        setUserStats({
          streak: profile.streak ?? 0,
          totalWorkouts: profile.totalWorkouts ?? 0,
        });
      }
    } catch {
      setUserStats(null);
    }
    setShowShareModal(true);
  };

  const getCategoryColor = (cat: WorkoutCategory) => {
    switch (cat) {
      case WorkoutCategory.Chest: return 'bg-red-500 text-white';
      case WorkoutCategory.Back: return 'bg-blue-500 text-white';
      case WorkoutCategory.Legs: return 'bg-emerald-500 text-white';
      case WorkoutCategory.Shoulders: return 'bg-purple-500 text-white';
      case WorkoutCategory.Cardio: return 'bg-orange-500 text-white';
      default: return 'bg-ink text-white';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6"
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="border-2 border-ink p-0.5 bg-paper shrink-0">
              {log.userPhoto ? (
                <img src={log.userPhoto} className="w-10 h-10 object-cover" />
              ) : (
                <div className="w-10 h-10 bg-paper flex items-center justify-center">
                  <UserIcon size={20} className="text-ink/30" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-ink leading-tight mb-1 uppercase tracking-tighter truncate" title={log.userName}>{log.userName}</h3>
              <p className="text-[10px] font-black text-ink/40 uppercase tracking-widest flex items-center gap-1">
                <Clock size={10} className="shrink-0" />
                <span className="truncate">{log.timestamp ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true, locale: zhCN }) : '刚刚'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase tracking-tighter shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${getCategoryColor(log.category)}`}>
              {log.category}
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={`px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                  deleteConfirm
                    ? 'bg-red-500 text-white shadow-none animate-pulse'
                    : 'bg-white text-ink/40 hover:text-red-500 hover:border-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                }`}
                title="删除打卡"
              >
                <Trash2 size={12} />
                {deleteConfirm ? <span>{deleting ? '删除中...' : '确认?'}</span> : <span>删除</span>}
              </button>
            )}
          </div>
        </div>

        {log.note && (
          <p className="text-ink text-base sm:text-lg leading-snug mb-4 font-black uppercase tracking-tight break-words whitespace-pre-wrap">"{log.note}"</p>
        )}

        <div className="space-y-2 mb-4">
          {(log.exercises || []).map((ex) => (
            <div key={ex.id} className="bg-paper border-2 border-ink p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="bg-ink p-1 shrink-0">
                  <Dumbbell size={14} className="text-neon" />
                </div>
                <span className="font-black text-ink text-xs uppercase tracking-tighter truncate" title={ex.name}>{ex.name}</span>
              </div>
              <div className="text-[10px] font-black text-ink uppercase space-x-1 sm:space-x-2 shrink-0 flex items-center">
                {ex.type === 'strength' ? (
                  <>
                    <span className="bg-neon px-1">{ex.weight}KG</span>
                    <span>x</span>
                    <span>{ex.sets}S</span>
                    <span>x</span>
                    <span>{ex.reps}R</span>
                  </>
                ) : (
                  <>
                    <span className="bg-neon px-1">{ex.duration}M</span>
                    <span>/</span>
                    <span>{ex.distance}K</span>
                    <span>/</span>
                    <span>{ex.calories}C</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t-2 border-ink/10">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleLike}
              className={`flex items-center gap-2 text-xs font-black px-3 py-1 border-2 border-ink transition-all cursor-pointer ${hasLiked ? 'bg-ink text-neon' : 'bg-white text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'}`}
            >
              <Heart size={16} fill={hasLiked ? 'currentColor' : 'none'} />
              <span>{log.likesCount || 0}</span>
            </button>
            <button
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-2 text-xs font-black px-3 py-1 border-2 border-ink transition-all cursor-pointer ${showComments ? 'bg-ink text-neon' : 'bg-white text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'}`}
            >
              <MessageCircle size={16} />
              <span>{log.commentsCount || 0}</span>
            </button>
          </div>
          <button onClick={handleShare} className="bg-paper p-1 border-2 border-ink hover:bg-neon transition-colors cursor-pointer">
            <Share2 size={16} />
          </button>
        </div>

        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-4 border-t-2 border-ink pt-4"
            >
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-[10px] font-black text-ink/30 uppercase italic text-center py-4">还没有评论</p>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="flex gap-2 items-start">
                      <div className="border border-ink w-6 h-6 flex-shrink-0">
                        {c.userPhoto ? (
                          <img src={c.userPhoto} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-paper flex items-center justify-center">
                            <UserIcon size={10} className="text-ink/30" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-black text-ink uppercase truncate block" title={c.userName}>{c.userName}</span>
                        <p className="text-xs text-ink/70 break-words whitespace-pre-wrap leading-tight">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {commentError && (
                <p className="text-[10px] font-black text-red-600 uppercase mb-2">{commentError}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => { setCommentText(e.target.value); setCommentError(''); }}
                  placeholder="说点什么..."
                  className="flex-1 bg-paper border-2 border-ink p-2 text-base font-black text-ink outline-none focus:bg-white uppercase placeholder:opacity-30"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendComment(); }}
                />
                <button
                  onClick={handleSendComment}
                  disabled={sending || !commentText.trim()}
                  className="bg-neon text-ink border-2 border-ink px-3 py-2 font-black text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 cursor-pointer"
                >
                  <Send size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showShareModal && (
          <SharePosterModal
            log={log}
            userStats={userStats}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
