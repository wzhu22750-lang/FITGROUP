import { useState, useEffect, useRef, memo, lazy, Suspense } from 'react';
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
  Users,
  Lock,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
const SharePosterModal = lazy(() => import('./SharePosterModal'));
const EditWorkoutModal = lazy(() => import('./EditWorkoutModal'));
import { pushBackHandler } from '../backStack';
import { summarizeTraining } from '../utils/trainingPresentation';

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

/** Format exercise data with readable units */
function formatExerciseData(ex: { type: string; weight?: number; sets?: number; reps?: number; duration?: number; distance?: number; calories?: number }): string {
  if (ex.type === 'strength') {
    const parts: string[] = [];
    if (typeof ex.weight === 'number' && ex.weight !== 0) parts.push(`${Math.abs(ex.weight)} kg`);
    if (ex.sets && ex.sets > 0) parts.push(`${ex.sets} 组`);
    if (ex.reps && ex.reps > 0) parts.push(`${ex.reps} 次`);
    return parts.join(' × ');
  } else {
    const parts: string[] = [];
    if (ex.duration && ex.duration > 0) parts.push(`${ex.duration} 分钟`);
    if (typeof ex.distance === 'number' && ex.distance > 0) parts.push(`${ex.distance} km`);
    if (typeof ex.calories === 'number' && ex.calories > 0) parts.push(`${ex.calories} kcal`);
    return parts.join(' · ');
  }
}

interface LogCardProps {
  log: WorkoutLog;
  onLogUpdated?: (updated?: Partial<WorkoutLog> & { id: string; _deleted?: boolean }) => void;
}

const DEFAULT_VISIBLE_EXERCISES = 2;

function LogCard({ log: initialLog, onLogUpdated }: LogCardProps) {
  const [currentLog, setCurrentLog] = useState<WorkoutLog>(initialLog);
  const [hasLiked, setHasLiked] = useState<boolean | undefined>(() => initialLog.isLiked);
  const [liking, setLiking] = useState(false);
  const [likeError, setLikeError] = useState('');
  const [likesCount, setLikesCount] = useState(() => Number(initialLog.likesCount) || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsCount, setCommentsCount] = useState(() => Number(initialLog.commentsCount) || 0);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userStats, setUserStats] = useState<{ streak: number; totalWorkouts: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [expandedExercises, setExpandedExercises] = useState(false);
  const [expandedNote, setExpandedNote] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const currentUser = getCurrentUser();
  const isOwner = Boolean(currentUser && currentLog.userId === currentUser.uid);
  const authorName = (isOwner && currentUser?.displayName) ? currentUser.displayName : currentLog.userName;
  const authorPhoto = (isOwner && currentUser?.photoURL) ? currentUser.photoURL : currentLog.userPhoto;

  // Sync prop changes
  useEffect(() => {
    setCurrentLog(initialLog);
    setHasLiked(initialLog.isLiked);
    setLikesCount(Number(initialLog.likesCount) || 0);
    setCommentsCount(Number(initialLog.commentsCount) || 0);
  }, [initialLog]);

  // Unknown likes are resolved by the batch query, or on explicit interaction only.
  // Never fan out a failed batch into one request per mounted card.

  useEffect(() => {
    if (!showComments || !currentLog.id) return;
    const unsub = subscribeToComments(
      currentLog.id,
      (data) => {
        setComments(data as any[]);
        setCommentsCount(Array.isArray(data) ? data.length : 0);
      },
      (error) => setCommentError(error.message || '评论加载失败'),
    );
    return () => unsub();
  }, [showComments, currentLog.id]);

  useEffect(() => {
    if (!showComments) return;
    return pushBackHandler(() => {
      setShowComments(false);
      return true;
    });
  }, [showComments]);

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreMenu]);

  // Close more menu via back handler
  useEffect(() => {
    if (!showMoreMenu) return;
    return pushBackHandler(() => {
      setShowMoreMenu(false);
      return true;
    });
  }, [showMoreMenu]);

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
      onLogUpdated?.({ id: currentLog.id, _deleted: true });
    } catch (e) {
      console.error('Delete failed:', e);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleToggleLike = async () => {
    const user = getCurrentUser();
    if (!user || !currentLog.id || liking) return;
    setLiking(true);
    setLikeError('');
    let prevLiked = hasLiked;
    if (prevLiked === undefined) {
      try {
        prevLiked = await checkUserLike(currentLog.id, user.uid);
        if (getCurrentUser()?.uid !== user.uid) { setLiking(false); return; }
      } catch {
        setLikeError('点赞状态读取失败，请重试');
        setLiking(false);
        return;
      }
    }
    const nextLiked = !prevLiked;
    const nextLikesCount = Math.max(0, likesCount + (nextLiked ? 1 : -1));

    setHasLiked(nextLiked);
    setLikesCount(nextLikesCount);
    setCurrentLog((prev) => ({ ...prev, isLiked: nextLiked, likesCount: nextLikesCount }));
    onLogUpdated?.({ id: currentLog.id, isLiked: nextLiked, likesCount: nextLikesCount });

    try {
      await toggleLike(currentLog.id, user.uid, prevLiked);
    } catch (err) {
      console.error('Like failed:', err);
      setLikeError('点赞操作失败，请重试');
      const rollbackCount = Math.max(0, nextLikesCount + (prevLiked ? 1 : -1));
      setHasLiked(prevLiked);
      setLikesCount(rollbackCount);
      setCurrentLog((prev) => ({ ...prev, isLiked: prevLiked, likesCount: rollbackCount }));
      onLogUpdated?.({ id: currentLog.id, isLiked: prevLiked, likesCount: rollbackCount });
    } finally {
      setLiking(false);
    }
  };

  const handleSendComment = async () => {
    const user = getCurrentUser();
    if (!user || !currentLog.id || !commentText.trim() || sending) return;
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
      const nextCommentsCount = commentsCount + 1;
      setCommentsCount(nextCommentsCount);
      setCurrentLog((prev) => ({ ...prev, commentsCount: nextCommentsCount }));
      onLogUpdated?.({ id: currentLog.id, commentsCount: nextCommentsCount });
    } catch (e) {
      console.error('Comment failed:', e);
      setCommentError('评论发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const handleShare = async () => {
    setShowShareModal(true);
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
    onLogUpdated?.({ id: currentLog.id, ...updated });
    setShowMoreMenu(false);
  };

  const vis: WorkoutVisibility = currentLog.visibility || 'public';
  const allExercises = currentLog.exercises || [];
  const visibleExercises = expandedExercises ? allExercises : allExercises.slice(0, DEFAULT_VISIBLE_EXERCISES);
  const hasHiddenExercises = allExercises.length > DEFAULT_VISIBLE_EXERCISES;
  const categories = inferLogCategories(currentLog.category, currentLog.categories, currentLog.exercises);
  const training = summarizeTraining(allExercises);

  // Note handling
  const noteText = currentLog.note || '';
  const isLongNote = noteText.length > 120;
  const displayNote = isLongNote && !expandedNote ? noteText.slice(0, 120) + '…' : noteText;

  return (
    <div className="card log-card p-4 sm:p-5 mb-5">
      {/* ── Author row ── */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="border-2 border-ink p-0.5 bg-paper shrink-0">
            {authorPhoto ? (
              <img src={authorPhoto} className="w-9 h-9 sm:w-10 sm:h-10 object-cover" alt="" />
            ) : (
              <div className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center">
                <UserIcon size={18} className="text-ink/30" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-black text-ink leading-tight uppercase tracking-tight truncate text-sm sm:text-base" title={authorName}>
                {authorName}
              </span>
              {/* Visibility badge - only for non-public */}
              {vis === 'friends' && (
                <span className="inline-flex items-center gap-0.5 bg-sky-100 text-sky-900 border border-sky-600 px-1 py-0.2 text-[9px] font-black uppercase whitespace-nowrap" title="好友小队可见">
                  <Users size={10} /> 好友小队
                </span>
              )}
              {vis === 'private' && (
                <span className="inline-flex items-center gap-0.5 bg-ink text-white border border-black px-1 py-0.2 text-[9px] font-black uppercase whitespace-nowrap" title="仅自己可见">
                  <Lock size={10} /> 仅自己
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-ink/60 flex items-center gap-1 mt-1">
              <Clock size={10} className="shrink-0 text-ink/40" />
              <span>{formatCompactTime(currentLog.timestamp)}</span>
            </p>
          </div>
        </div>

        {/* More menu (owner only) */}
        {isOwner && (
          <div className="relative shrink-0" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-1.5 text-ink/50 hover:text-ink hover:bg-paper border border-transparent hover:border-ink transition-colors cursor-pointer"
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="更多操作"
              aria-label="更多操作"
              aria-expanded={showMoreMenu}
            >
              <MoreHorizontal size={18} />
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border-2 border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] py-1 z-20 min-w-[120px]">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(true); setShowMoreMenu(false); }}
                  className="w-full px-4 py-2 text-left text-xs font-black uppercase text-ink hover:bg-neon transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Edit3 size={13} />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); handleDelete(); }}
                  disabled={deleting}
                  className={`w-full px-4 py-2 text-left text-xs font-black uppercase transition-colors cursor-pointer flex items-center gap-2 ${
                    deleteConfirm ? 'text-white bg-red-500' : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 size={13} />
                  {deleteConfirm ? (deleting ? '删除中…' : '确认删除？') : '删除'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 className="text-xl font-black tracking-tight mt-5 mb-3">
        {categories.map(cat => CATEGORY_META[cat]?.zh || cat).join(' · ') || '训练'}打卡
      </h2>
      {/* Only show recorded metrics; cardio minutes are not total workout time. */}
      {training.actions > 0 && (
        <dl className="training-summary mb-5">
          <div><dt>训练动作</dt><dd>{training.actions}<span>项</span></dd></div>
          {training.sets > 0 && <div><dt>力量组数</dt><dd>{training.sets}<span>组</span></dd></div>}
          {training.cardioMinutes > 0 && <div><dt>有氧时长</dt><dd>{Number(training.cardioMinutes.toFixed(1))}<span>分钟</span></dd></div>}
          {training.sets === 0 && training.distance > 0 && <div><dt>有氧距离</dt><dd>{Number(training.distance.toFixed(2))}<span>km</span></dd></div>}
        </dl>
      )}

      {/* ── Note / 心得 ── */}
      {noteText && (
        <div className="mb-3">
          <p className="text-ink/80 text-sm leading-relaxed break-words whitespace-pre-wrap">
            {displayNote}
          </p>
          {isLongNote && (
            <button
              type="button"
              onClick={() => setExpandedNote(!expandedNote)}
              className="text-xs font-bold text-ink/50 hover:text-ink mt-1 cursor-pointer underline"
            >
              {expandedNote ? '收起' : '展开全文'}
            </button>
          )}
        </div>
      )}

      {/* ── Exercises ── */}
      {allExercises.length > 0 && (
        <div className="space-y-2 mb-3">
          {visibleExercises.map((ex) => (
            <div key={ex.id} className="bg-paper border-l-2 border-ink/20 p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="bg-black p-1 shrink-0 flex items-center justify-center">
                  <Dumbbell size={12} className="text-neon" />
                </div>
                <span className="font-bold text-ink text-xs uppercase tracking-tight truncate" title={ex.name}>
                  {ex.name}
                </span>
              </div>
              <div className="text-xs font-bold text-ink tabular-nums gap-x-1.5 gap-y-1 flex flex-wrap items-center">
                {ex.type === 'strength' ? (
                  <>
                    {typeof ex.weight === 'number' && ex.weight !== 0 && (
                      <span className="font-black">{Math.abs(ex.weight)} <span className="font-medium text-ink/55">kg</span></span>
                    )}
                    {ex.sets && ex.sets > 0 && <span>{ex.sets} 组</span>}
                    {ex.reps && ex.reps > 0 && (
                      <>
                        <span>×</span>
                        <span>{ex.reps} 次</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-black">{ex.duration || 0} <span className="font-medium text-ink/55">分钟</span></span>
                    {typeof ex.distance === 'number' && ex.distance > 0 && <span>{ex.distance} km</span>}
                    {typeof ex.calories === 'number' && ex.calories > 0 && <span>{ex.calories} kcal</span>}
                  </>
                )}
              </div>
            </div>
          ))}
          {hasHiddenExercises && (
            <button
              type="button"
              onClick={() => setExpandedExercises(!expandedExercises)}
              className="flex items-center gap-1 text-xs font-black text-ink/60 hover:text-ink cursor-pointer py-1"
            >
              {expandedExercises ? (
                <><ChevronUp size={14} /> 收起</>
              ) : (
                <><ChevronDown size={14} /> 查看全部 {allExercises.length} 个动作</>
              )}
            </button>
          )}
        </div>
      )}

      {likeError && <p role="alert" className="text-xs font-bold text-rose-600">{likeError}</p>}
      {/* ── Actions bar ── */}
      <div className="flex items-center justify-between pt-3 border-t-2 border-ink/10">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleLike}
            disabled={liking}
            aria-label={hasLiked === undefined ? '查询点赞状态并操作' : hasLiked ? '取消点赞' : '点赞'}
            data-like-state={hasLiked === undefined ? 'unknown' : hasLiked ? 'liked' : 'unliked'}
            className={`log-action ${hasLiked ? 'bg-neon text-ink' : 'text-ink/65 hover:bg-paper'}`}
            aria-pressed={hasLiked === true}
          >
            <Heart size={15} fill={hasLiked ? 'currentColor' : 'none'} />
            <span>{likesCount}</span>
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className={`log-action ${showComments ? 'bg-paper text-ink' : 'text-ink/65 hover:bg-paper'}`}
            aria-label={`评论，${commentsCount}条`}
            aria-expanded={showComments}
          >
            <MessageCircle size={15} />
            <span>{commentsCount}</span>
          </button>
        </div>
        <button
          onClick={handleShare}
          className="log-action text-ink/65 hover:bg-paper"
          title="生成打卡海报"
          aria-label="生成打卡海报"
        >
          <Share2 size={16} />
        </button>
      </div>

      {/* ── Comments Section ── */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-ink/5">
          <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-xs text-ink/30 text-center py-4">还没有评论</p>
            ) : (
              comments.map((c) => {
                const isMyComment = Boolean(currentUser && c.userId === currentUser.uid);
                const cName = (isMyComment && currentUser?.displayName) ? currentUser.displayName : c.userName;
                const cPhoto = (isMyComment && currentUser?.photoURL) ? currentUser.photoURL : c.userPhoto;
                return (
                <div key={c.id} className="flex gap-2 items-start">
                  <div className="w-6 h-6 flex-shrink-0 bg-paper overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--radius-sm)' }}>
                    {cPhoto ? (
                      <img src={cPhoto} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UserIcon size={10} className="text-ink/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-ink truncate block" title={cName}>
                      {cName}
                    </span>
                    <p className="text-xs text-ink/70 break-words whitespace-pre-wrap leading-relaxed">{c.content}</p>
                  </div>
                </div>
              );})
            )}
          </div>
          {commentError && (
            <p className="text-xs text-red-500 mb-2">{commentError}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => { setCommentText(e.target.value); setCommentError(''); }}
              placeholder="说点什么…"
              className="input-field flex-1 py-2 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendComment(); }}
            />
            <button
              onClick={handleSendComment}
              disabled={sending || !commentText.trim()}
              className="btn-neon px-3 py-2 disabled:opacity-40 cursor-pointer"
              aria-label="发送评论"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Share and edit dependencies load only on explicit interaction. */}
      <Suspense fallback={<div role="status" className="bg-white border-4 border-ink p-4">正在加载工具…</div>}>
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
      </Suspense>
    </div>
  );
}

function areLogCardPropsEqual(prev: LogCardProps, next: LogCardProps): boolean {
  if (prev.onLogUpdated !== next.onLogUpdated) return false;
  const p = prev.log;
  const n = next.log;
  if (p === n) return true;
  return (
    p.id === n.id &&
    p.likesCount === n.likesCount &&
    p.commentsCount === n.commentsCount &&
    p.isLiked === n.isLiked &&
    p.visibility === n.visibility &&
    p.category === n.category &&
    (p.categories === n.categories || JSON.stringify(p.categories) === JSON.stringify(n.categories)) &&
    p.timestamp === n.timestamp &&
    p.userName === n.userName &&
    p.userPhoto === n.userPhoto &&
    p.photoUrl === n.photoUrl &&
    p.note === n.note &&
    (p.exercises === n.exercises || JSON.stringify(p.exercises) === JSON.stringify(n.exercises))
  );
}

export default memo(LogCard, areLogCardPropsEqual);
