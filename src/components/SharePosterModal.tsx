import { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkoutLog } from '../types';
import SharePoster from './SharePoster';

interface SharePosterModalProps {
  log: WorkoutLog;
  userStats: {
    streak: number;
    totalWorkouts: number;
  } | null;
  onClose: () => void;
}

export default function SharePosterModal({ log, userStats, onClose }: SharePosterModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/60 p-4"
      onClick={onClose}
    >
      {/* Close button (top) */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 bg-white border-2 border-ink p-2 font-black text-xs uppercase cursor-pointer hover:bg-neon transition-colors"
      >
        <X size={16} />
      </button>

      {/* Poster */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <SharePoster
          log={log}
          statLabel={stat.label}
          statValue={stat.value}
          statIcon={stat.icon}
        />
      </motion.div>

      {/* Bottom hint */}
      <p className="text-neon text-[10px] font-black uppercase tracking-widest text-center mt-4 drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]">
        截图保存到相册即可分享
      </p>
      <button
        onClick={onClose}
        className="mt-3 bg-ink text-neon border-2 border-ink px-8 py-3 font-black uppercase text-sm cursor-pointer hover:bg-white hover:text-ink transition-colors"
      >
        关闭
      </button>
    </motion.div>
  );
}
