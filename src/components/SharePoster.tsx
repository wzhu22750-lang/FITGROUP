import { Flame, Award, Target, Dumbbell, Timer, User as UserIcon } from 'lucide-react';
import { WorkoutLog } from '../types';
import { getCategoryBadgeColor, CATEGORY_META, inferLogCategories } from '../constants/workoutPresets';

interface SharePosterProps {
  log: WorkoutLog;
  statLabel: string;
  statValue: string;
  statIcon: 'flame' | 'award' | 'target';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDate(ts: string) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}  ${WEEKDAYS[d.getDay()]}`;
}

const StatIcon = {
  flame: Flame,
  award: Award,
  target: Target,
};

export default function SharePoster({ log, statLabel, statValue, statIcon }: SharePosterProps) {
  const Icon = StatIcon[statIcon];
  const categories = inferLogCategories(log.category, log.categories, log.exercises);

  return (
    <div className="bg-white border-4 border-ink shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] w-[375px] max-w-full p-5 font-sans select-none">
      {/* Brand Header */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <div>
          <h2 className="font-black text-base uppercase tracking-[0.3em] text-ink leading-none">FitGroup</h2>
          <div className="h-[2px] w-16 bg-neon mt-0.5" />
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end max-w-[60%]">
          {categories.map((cat) => (
            <div
              key={cat}
              className={`px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${getCategoryBadgeColor(cat)}`}
            >
              {CATEGORY_META[cat]?.zh || cat}
            </div>
          ))}
        </div>
      </div>

      {/* User Info */}
      <div className="flex items-center gap-3 mb-3">
        <div className="border-2 border-ink p-0.5 bg-paper flex-shrink-0">
          {log.userPhoto ? (
            <img src={log.userPhoto} className="w-12 h-12 object-cover" alt="" crossOrigin="anonymous" />
          ) : (
            <div className="w-12 h-12 bg-paper flex items-center justify-center">
              <UserIcon size={24} className="text-ink/30" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-lg text-ink uppercase tracking-tighter leading-tight truncate" title={log.userName}>{log.userName}</h3>
          <p className="text-[10px] font-black text-ink/40 uppercase tracking-widest truncate">{formatDate(log.timestamp)}</p>
        </div>
      </div>

      {/* Neon Divider */}
      <hr className="border-t-2 border-dashed border-neon my-3" />

      {/* Exercise Cards */}
      <div className="space-y-2 mb-3">
        {(log.exercises || []).map((ex) => (
          <div key={ex.id} className="bg-paper border-2 border-ink p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-ink p-1 flex-shrink-0">
                {ex.type === 'strength' ? (
                  <Dumbbell size={14} className="text-neon" />
                ) : (
                  <Timer size={14} className="text-neon" />
                )}
              </div>
              <span className="font-black text-xs text-ink uppercase tracking-tighter truncate">
                {ex.name || (ex.type === 'strength' ? 'Exercise' : 'Activity')}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {ex.type === 'strength' ? (
                <>
                  <Pill label={`${ex.weight || '--'} KG`} />
                  <Pill label={`${ex.sets || '--'} SETS`} />
                  <Pill label={`${ex.reps || '--'} REPS`} />
                </>
              ) : (
                <>
                  <Pill label={`${ex.duration || '--'} MIN`} />
                  {typeof ex.distance === 'number' && ex.distance > 0 ? (
                    <Pill label={`${ex.distance} KM`} />
                  ) : null}
                  {typeof ex.calories === 'number' && ex.calories > 0 ? (
                    <Pill label={`${ex.calories} CAL`} />
                  ) : null}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      {log.note && (
        <div className="border-l-4 border-neon pl-3 py-1 my-3">
          <p className="font-black text-sm text-ink italic leading-snug line-clamp-3">"{log.note}"</p>
        </div>
      )}

      {/* Photo */}
      {log.photoUrl && (
        <div className="border-4 border-ink aspect-[4/3] overflow-hidden bg-paper my-3">
          <img src={log.photoUrl} className="w-full h-full object-cover grayscale contrast-125" alt="" crossOrigin="anonymous" />
        </div>
      )}

      {/* Stat Highlight */}
      <div className="bg-neon border-4 border-ink p-4 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] my-3">
        <Icon size={28} className="text-ink fill-current mx-auto mb-1" />
        <p className="text-[10px] font-black text-ink uppercase tracking-widest">{statLabel}</p>
        <p className="text-4xl font-black text-ink italic leading-none">{statValue}</p>
      </div>

      {/* Footer */}
      <hr className="border-t-2 border-dashed border-neon my-3" />
      <p className="text-[10px] font-black text-ink/30 uppercase tracking-[0.3em] text-center">
        FitGroup · 健身打卡
      </p>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="bg-neon text-ink px-2 py-1 border-2 border-ink text-[11px] font-black uppercase leading-none">
      {label}
    </span>
  );
}
