import { Check, Flame } from 'lucide-react';
import type { WorkoutLog } from '../types';
import { recentTrainingDays } from '../utils/trainingPresentation';

interface TrainingOverviewProps {
  logs: WorkoutLog[];
  ready: boolean;
  streak: number;
  totalWorkouts: number;
  recentSets: number;
  balance: string;
}

export default function TrainingOverview({ logs, ready, streak, totalWorkouts, recentSets, balance }: TrainingOverviewProps) {
  const days = recentTrainingDays(logs);
  const sessions = days.reduce((sum, day) => sum + day.count, 0);
  const activeDays = days.filter(day => day.count > 0).length;

  return (
    <section className="training-overview" aria-label="训练概览">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold text-ink/65">近 7 天训练</span>
        <span className="streak-label"><Flame size={14} aria-hidden="true" />连续打卡 {streak} 天</span>
      </div>
      <div className="flex items-end gap-3 mt-5 mb-2">
        <span className="overview-score text-5xl font-black tracking-tighter tabular-nums">{ready ? sessions : '—'}</span>
        <span className="text-sm text-ink/60 pb-1">次打卡</span>
      </div>
      <p className="text-sm text-ink/60 leading-relaxed">
        {!ready ? '正在读取训练记录…' : activeDays > 0 ? `7 天里有 ${activeDays} 天，你为自己动了起来。` : '进步从一次训练开始，不必等到明天。'}
      </p>
      <ol className="training-week" aria-label="最近七天打卡情况">
        {days.map(({ date, count }, index) => (
          <li key={date.getTime()} aria-label={`${date.getMonth() + 1}月${date.getDate()}日，${ready ? `${count}次打卡` : '加载中'}`}>
            <span className="text-[11px] text-ink/60">{index === 6 ? '今天' : ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}</span>
            <span className={`training-day ${ready && count > 0 ? 'is-active' : ''} ${index === 6 ? 'is-today' : ''}`}>
              {ready && count > 0 ? <Check size={17} strokeWidth={2.5} aria-hidden="true" /> : <span aria-hidden="true">{date.getDate()}</span>}
            </span>
          </li>
        ))}
      </ol>
      <dl className="overview-totals">
        <div><dt>累计打卡</dt><dd>{totalWorkouts}<span>次</span></dd></div>
        <div><dt>28 天完成</dt><dd>{ready ? recentSets : '—'}<span>组</span></dd></div>
        <div><dt>训练均衡度</dt><dd className="balance-value">{ready ? balance : '—'}</dd></div>
      </dl>
    </section>
  );
}
