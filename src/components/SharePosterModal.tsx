import { useEffect, useRef, useState } from 'react';
import { Share2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { toPng } from 'html-to-image';
import { WorkoutLog } from '../types';
import SharePoster from './SharePoster';
import { pushBackHandler } from '../backStack';
import { shareImageDataUrl } from '../native';

interface SharePosterModalProps {
  log: WorkoutLog;
  userStats: {
    streak: number;
    totalWorkouts: number;
  } | null;
  onClose: () => void;
}

export default function SharePosterModal({ log, userStats, onClose }: SharePosterModalProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => pushBackHandler(() => {
    onClose();
    return true;
  }), [onClose]);

  const getStatInfo = () => {
    if (userStats && userStats.streak > 0) {
      return {
        label: '连续打卡',
        value: `${userStats.streak} 天`,
        icon: 'flame' as const,
      };
    }
    if (userStats && userStats.totalWorkouts > 0) {
      return {
        label: '累计训练',
        value: `${userStats.totalWorkouts} 次`,
        icon: 'award' as const,
      };
    }
    return {
      label: '首练纪念',
      value: '#1',
      icon: 'target' as const,
    };
  };

  const stat = getStatInfo();

  const handleShare = async () => {
    if (!posterRef.current || sharing) return;
    setSharing(true);
    setError('');
    try {
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });
      await shareImageDataUrl(dataUrl, `fitgroup-${Date.now()}.png`);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      console.error('Share poster failed:', err);
      setError('系统分享失败，请长按海报截图保存');
    } finally {
      setSharing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/60 p-4"
      style={{ paddingTop: 'calc(1rem + var(--safe-top))', paddingBottom: 'calc(1rem + var(--safe-bottom))' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 bg-white border-2 border-ink p-2 font-black text-xs uppercase cursor-pointer hover:bg-neon transition-colors"
        style={{ top: 'calc(1rem + var(--safe-top))' }}
      >
        <X size={16} />
      </button>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={posterRef}>
          <SharePoster
            log={log}
            statLabel={stat.label}
            statValue={stat.value}
            statIcon={stat.icon}
          />
        </div>
      </motion.div>

      {error && (
        <p className="text-neon text-[10px] font-black uppercase tracking-widest text-center mt-3">
          {error}
        </p>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); void handleShare(); }}
        disabled={sharing}
        className="mt-4 bg-neon text-ink border-2 border-ink px-8 py-3 font-black uppercase text-sm cursor-pointer hover:bg-white transition-colors flex items-center gap-2 disabled:opacity-60"
      >
        <Share2 size={16} />
        {sharing ? '生成海报中...' : '系统分享'}
      </button>
      <button
        onClick={onClose}
        className="mt-3 bg-ink text-neon border-2 border-ink px-8 py-3 font-black uppercase text-sm cursor-pointer hover:bg-white hover:text-ink transition-colors"
      >
        关闭
      </button>
    </motion.div>
  );
}
