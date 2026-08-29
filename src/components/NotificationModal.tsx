import { useState, useEffect } from 'react';
import {
  fetchNotifications,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getCurrentUser,
} from '../api';
import { AppNotification } from '../types';
import {
  Bell,
  Heart,
  MessageCircle,
  Check,
  CheckCheck,
  Trash2,
  X,
  Clock,
  User as UserIcon,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

interface NotificationModalProps {
  onClose: () => void;
  onSelectLog?: (logId: string) => void;
}

export default function NotificationModal({ onClose, onSelectLog }: NotificationModalProps) {
  const currentUser = getCurrentUser();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return pushBackHandler(() => {
      onClose();
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const unsub = subscribeToNotifications(currentUser.uid, (list) => {
      setNotifications(list);
      setLoading(false);
    });

    return () => unsub();
  }, [currentUser?.uid]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    if (!currentUser || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsAsRead(currentUser.uid);
  };

  const handleItemClick = async (item: AppNotification) => {
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      await markNotificationAsRead(item.id);
    }
    if (onSelectLog && item.logId) {
      onSelectLog(item.logId);
      onClose();
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await deleteNotification(id);
  };

  const filteredList =
    filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-paper border-4 border-ink shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md max-h-[85vh] flex flex-col my-auto overflow-hidden"
      >
        {/* Header */}
        <div className="bg-neon border-b-4 border-ink p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-ink p-1">
              <Bell size={18} className="text-neon" />
            </div>
            <h2 className="font-black text-ink uppercase tracking-tight text-base sm:text-lg italic">
              消息通知 / NOTIFICATIONS
            </h2>
            {unreadCount > 0 && (
              <span className="bg-ink text-neon border border-ink text-[10px] font-black px-1.5 py-0.2 shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]">
                {unreadCount} 未读
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="p-1.5 border-2 border-ink bg-white hover:bg-ink hover:text-neon transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                title="一键全部已读"
              >
                <CheckCheck size={13} />
                <span>全部已读</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 border-2 border-ink bg-white hover:bg-ink hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="p-2.5 bg-white border-b-2 border-ink flex items-center justify-between shrink-0">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]'
                  : 'bg-paper text-ink/70 hover:bg-neon'
              }`}
            >
              全部 ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer ${
                filter === 'unread'
                  ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]'
                  : 'bg-paper text-ink/70 hover:bg-neon'
              }`}
            >
              未读 ({unreadCount})
            </button>
          </div>

          <span className="text-[10px] font-bold text-ink/40 uppercase">
            点赞与评论通知
          </span>
        </div>

        {/* Notifications List */}
        <div className="p-3 overflow-y-auto flex-1 space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-ink/50">
              加载通知中...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 bg-white border-2 border-ink mx-auto flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Bell size={24} className="text-ink/30" />
              </div>
              <p className="font-black text-xs uppercase text-ink/60">
                {filter === 'unread' ? '暂无未读消息' : '暂无任何消息通知'}
              </p>
              <p className="text-[10px] font-bold text-ink/40">
                当有人点赞或评论你的打卡记录时，会第一时间在这里通知你
              </p>
            </div>
          ) : (
            filteredList.map((item) => (
              <motion.div
                key={item.id}
                onClick={() => handleItemClick(item)}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 border-2 border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer transition-all relative ${
                  item.isRead ? 'bg-white hover:bg-paper' : 'bg-neon/15 hover:bg-neon/25'
                }`}
              >
                {/* Unread indicator dot */}
                {!item.isRead && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-neon border border-ink shadow-[0_0_4px_rgba(223,255,0,1)]" />
                )}

                <div className="flex items-start gap-2.5">
                  {/* Actor Avatar */}
                  <div className="relative border-2 border-ink p-0.5 bg-paper shrink-0">
                    {item.actorPhoto ? (
                      <img src={item.actorPhoto} className="w-8 h-8 object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-paper flex items-center justify-center">
                        <UserIcon size={14} className="text-ink/30" />
                      </div>
                    )}
                    <div
                      className={`absolute -bottom-1 -right-1 p-0.5 border border-ink ${
                        item.type === 'like' ? 'bg-rose-500 text-white' : 'bg-sky-400 text-ink'
                      }`}
                    >
                      {item.type === 'like' ? <Heart size={8} fill="currentColor" /> : <MessageCircle size={8} />}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-xs text-ink truncate" title={item.actorName}>
                        {item.actorName}
                      </span>
                      <span className="text-[11px] font-bold text-ink/70">
                        {item.type === 'like' ? '赞了你的打卡' : '评论了你的打卡'}
                      </span>
                      {item.logCategory && (
                        <span className="bg-paper border border-ink px-1 text-[9px] font-black uppercase text-ink/60">
                          {item.logCategory}
                        </span>
                      )}
                    </div>

                    {item.type === 'comment' && item.content && (
                      <p className="text-xs font-black text-ink bg-paper/70 border-l-2 border-ink pl-2 py-0.5 my-1.5 break-words whitespace-pre-wrap">
                        "{item.content}"
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-1 text-[10px] font-bold text-ink/40">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatCompactTime(item.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, item.id)}
                        className="text-ink/30 hover:text-red-500 p-0.5"
                        title="删除该通知"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
