import { useState, useEffect } from 'react';
import {
  getCurrentUser,
  toggleLike,
  checkUserLike,
  subscribeToComments,
  addComment,
  getUserProfile,
  deleteWorkoutLog,
} from '../api';
import { WorkoutLog, WorkoutVisibility } from '../types';
import {
  parseCategories,
  getCategoryBadgeColor,
  CATEGORY_META,
  inferLogCategories,
} from '../constants/workoutPresets';
import {
  Heart,
  MessageCircle,
  Share2,
  Clock,
  Dumbbell,
  User as UserIcon,
  Send,
  Trash2,
  Edit3,
  Globe,
  Users,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SharePosterModal from './SharePosterModal';
import EditWorkoutModal from './EditWorkoutModal';
import { pushBackHandler } from '../backStack';

function formatCompactTime(timestamp?: string): string {
  if (!timestamp) return '刚刚';
  const time = new Date(timestamp).getTime();
  if (isNaN(time)) return '刚刚';

  const diffMs = Date.now() - time;
  if (diffMs < 0 || diffMs < 60 * 1000) return '刚刚';

  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 60) return `${diffMin}分钟前`;

  const diffHours = Math.floor(diffMs / (3600 * 1000));
  if (diffHours < 24) return `${diffHours}小时前`;

  const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));
  if (diffDays < 7) return `${diffDays}天前`;

  const date = new Date(timestamp);
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}月${d}日`;
}

interface LogCardProps {
  log: WorkoutLog;
  onLogUpdated?: () => void;
}

export default function LogCard({ log: initialLog, onLogUpdated }: LogCardProps) {
  const [currentLog, setCurrentLog] = useState<WorkoutLog>(initialLog);
  const [hasLiked, setHasLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(Number(initialLog.likesCount) || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsCount, setCommentsCount] = useState(Number(initialLog.commentsCount) || 0);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userStats, setUserStats] = useState<{ streak: number; totalWorkouts: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const currentUser = getCurrentUser();
  const isOwner = Boolean(currentUser && currentLog.userId === currentUser.uid);

  // Sync prop changes
  useEffect(() => {
    setCurrentLog(initialLog);
    setLikesCount(Number(initialLog.likesCount) || 0);
    setCommentsCount(Number(initialLog.commentsCount) || 0);
  }, [initialLog]);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || !currentLog.id) return;
    checkUserLike(currentLog.id, user.uid).then(setHasLiked).catch(() => undefined);
  }, [currentLog.id]);

  useEffect(() => {
    if (!showComments || !currentLog.id) return;
    const unsub = subscribeToComments(currentLog.id, (data) => {
      setComments(data as any[]);
      setCommentsCount(Array.isArray(data) ? data.length : 0);
    });
    return () => unsub();
  }, [showComments, currentLog.id]);

  useEffect(() => {
    if (!showComments) return;
    return pushBackHandler(() => {
      setShowComments(false);
      return true;
    });
  }, [showComments]);

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3500);
      return;
    }
    if (!currentLog.id || deleting) return;
    setDeleting(true);
    try {
      await deleteWorkoutLog(currentLog.id);
      onLogUpdated?.();
    } catch (e) {
      console.error('Delete failed:', e);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleToggleLike = async () => {
    const user = getCurrentUser();
    if (!user || !currentLog.id) return;
    const prevLiked = hasLiked;
    const nextLiked = !prevLiked;

    setHasLiked(nextLiked);
    setLikesCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));

    try {
      await toggleLike(currentLog.id, user.uid, prevLiked);
    } catch (err) {
      console.error('Like failed:', err);
      setHasLiked(prevLiked);
      setLikesCount((prev) => Math.max(0, prev + (prevLiked ? 1 : -1)));
    }
  };

  const handleSendComment = async () => {
    const user = getCurrentUser();
    if (!user || !currentLog.id || !commentText.trim()) return;
    setSending(true);
    setCommentError('');
    const textToSend = commentText.trim();
    try {
      await addComment(
        currentLog.id,
        user.uid,
        user.displayName || 'User',
        user.photoURL || '',
        textToSend
      );
      setCommentText('');
      setCommentsCount((prev) => prev + 1);
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

  const handleEditSuccess = (updated: Partial<WorkoutLog>) => {
    setCurrentLog((prev) => ({ ...prev, ...updated }));
    onLogUpdated?.();
  };

  const vis: WorkoutVisibility = currentLog.visibility || 'public';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6 overflow-hidden"
    >
      <div className="p-4 sm:p-5">
        {/* Author Header */}
        <div className="flex items-start justify-between mb-3.5 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="border-2 border-ink p-0.5 bg-paper shrink-0">
              {currentLog.userPhoto ? (
                <img src={currentLog.userPhoto} className="w-9 h-9 sm:w-10 sm:h-10 object-cover" />
              ) : (
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-paper flex items-center justify-center">
                  <UserIcon size={18} className="text-ink/30" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3
                  className="font-black text-ink leading-tight uppercase tracking-tighter truncate text-sm sm:text-base"
                  title={currentLog.userName}
                >
                  {currentLog.userName}
                </h3>

                {/* Visibility Badge */}
                {vis === 'friends' && (
                  <span
                    className="inline-flex items-center gap-0.5 bg-sky-100 text-sky-800 border border-sky-600 px-1 py-0.2 text-[9px] font-black uppercase whitespace-nowrap"
                    title="好友小队可见"
                  >
                    <Users size={9} /> 好友小队
                  </span>
                )}
                {vis === 'private' && (
                  <span
                    className="inline-flex items-center gap-0.5 bg-zinc-800 text-white border border-black px-1 py-0.2 text-[9px] font-black uppercase whitespace-nowrap"
                    title="仅自己可见"
                  >
                    <Lock size={9} /> 仅自己
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold text-ink/50 flex items-center gap-1 whitespace-nowrap mt-0.5">
                <Clock size={10} className="shrink-0 text-ink/40" />
                <span className="whitespace-nowrap">{formatCompactTime(currentLog.timestamp)}</span>
              </p>
            </div>
          </div>

          {/* Right Action / Categories / Edit / Delete */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[55%] pt-0.5">
            {inferLogCategories(currentLog.category, currentLog.categories, currentLog.exercises).map((cat) => (
              <div
                key={cat}
                className={`px-1.5 sm:px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase tracking-tighter shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] whitespace-nowrap ${getCategoryBadgeColor(cat)}`}
              >
                {CATEGORY_META[cat]?.zh || cat}
              </div>
            ))}

            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="px-1.5 sm:px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase bg-white text-ink/70 hover:bg-neon hover:text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer flex items-center gap-0.5 whitespace-nowrap"
                  title="编辑此打卡"
                >
                  <Edit3 size={11} />
                  <span>编辑</span>
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`px-1.5 sm:px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase transition-all cursor-pointer flex items-center gap-0.5 shrink-0 whitespace-nowrap ${
                    deleteConfirm
                      ? 'bg-red-500 text-white shadow-none animate-pulse'
                      : 'bg-white text-ink/40 hover:text-red-500 hover:border-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                  }`}
                  title="删除打卡"
                >
                  <Trash2 size={11} />
                  {deleteConfirm ? <span>{deleting ? '...' : '确认?'}</span> : <span>删除</span>}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Note */}
        {currentLog.note && (
          <p className="text-ink text-base sm:text-lg leading-snug mb-4 font-black uppercase tracking-tight break-words whitespace-pre-wrap">
            "{currentLog.note}"
          </p>
        )}

        {/* Exercises */}
        <div className="space-y-2 mb-4">
          {(currentLog.exercises || []).map((ex) => (
            <div key={ex.id} className="bg-paper border-2 border-ink p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="bg-black border border-black dark:border-zinc-700 p-1 shrink-0 flex items-center justify-center">
                  <Dumbbell size={14} className="text-neon" />
                </div>
                <span className="font-black text-ink text-xs uppercase tracking-tighter truncate" title={ex.name}>
                  {ex.name}
                </span>
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
                    <span className="bg-neon px-1">{ex.duration || 0}M</span>
                    {typeof ex.distance === 'number' && ex.distance > 0 ? (
                      <>
                        <span>/</span>
                        <span>{ex.distance}K</span>
                      </>
                    ) : null}
                    {typeof ex.calories === 'number' && ex.calories > 0 ? (
                      <>
                        <span>/</span>
                        <span>{ex.calories}C</span>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between pt-4 border-t-2 border-ink/10">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleLike}
              className={`flex items-center gap-2 text-xs font-black px-3 py-1 border-2 border-ink transition-all cursor-pointer ${
                hasLiked
                  ? 'bg-ink text-neon'
                  : 'bg-white text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
              }`}
            >
              <Heart size={16} fill={hasLiked ? 'currentColor' : 'none'} />
              <span>{likesCount}</span>
            </button>
            <button
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-2 text-xs font-black px-3 py-1 border-2 border-ink transition-all cursor-pointer ${
                showComments
                  ? 'bg-ink text-neon'
                  : 'bg-white text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
              }`}
            >
              <MessageCircle size={16} />
              <span>{commentsCount}</span>
            </button>
          </div>
          <button
            onClick={handleShare}
            className="bg-paper p-1 border-2 border-ink hover:bg-neon transition-colors cursor-pointer"
            title="生成打卡海报"
          >
            <Share2 size={16} />
          </button>
        </div>

        {/* Comments Section */}
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
                  comments.map((c) => (
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
                        <span className="text-[10px] font-black text-ink uppercase truncate block" title={c.userName}>
                          {c.userName}
                        </span>
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

      {/* Share Poster Modal */}
      <AnimatePresence>
        {showShareModal && (
          <SharePosterModal
            log={currentLog}
            userStats={userStats}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && (
          <EditWorkoutModal
            log={currentLog}
            onClose={() => setShowEditModal(false)}
            onSuccess={handleEditSuccess}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
