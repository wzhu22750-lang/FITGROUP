import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Check } from 'lucide-react';
import { resolveWorkoutTimestamp, toLocalWorkoutTime } from '../../utils/workoutTime';
import WorkoutSheet from './WorkoutSheet';

const pad = (n: number) => String(n).padStart(2, '0');
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

function ClockOptions({ label, count, selected, onSelect }: {
  label: string; count: number; selected: string; onSelect: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = ref.current;
    const button = list?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!list || !button) return;
    list.scrollTop += button.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - button.clientHeight) / 2;
  }, [selected]);
  return <div><p className="workout-helper">{label}</p>
    <div ref={ref} className="workout-clock-options" role="group" aria-label={`选择${label}`}>
      {Array.from({ length: count }, (_, i) => <button type="button" key={i} aria-pressed={selected === pad(i)} onClick={() => onSelect(pad(i))}>{pad(i)}</button>)}
    </div>
  </div>;
}

export default function WorkoutTimePicker({ value, disabled, onChange }: {
  value: string | null; disabled?: boolean; onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState(() => value ?? toLocalWorkoutTime());
  const [month, setMonth] = useState(() => new Date(selection.slice(0, 7) + '-01T12:00'));
  const [error, setError] = useState('');
  const display = value ?? toLocalWorkoutTime();
  const selectedDate = selection.slice(0, 10);
  const hour = selection.slice(11, 13);
  const minute = selection.slice(14, 16);
  const today = toLocalWorkoutTime().slice(0, 10);
  const monthKey = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
  const leading = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const setDate = (date: string) => { setSelection(`${date}T${hour}:${minute}`); setError(''); };
  const quickDate = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    setDate(toLocalWorkoutTime(date).slice(0, 10));
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  };
  const show = () => {
    const next = value ?? toLocalWorkoutTime();
    setSelection(next); setMonth(new Date(next.slice(0, 7) + '-01T12:00')); setError(''); setOpen(true);
  };
  return (
    <div className="workout-time-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="workout-field-label">训练日期与时间</h2>
        <span className="workout-time-badge">{value === null ? '实时记录' : display.slice(0, 10) < today ? '补打卡' : '指定时间'}</span>
      </div>
      <button id="workout-time" type="button" className="workout-time-trigger" disabled={disabled} onClick={show} aria-haspopup="dialog" aria-describedby="workout-time-hint">
        <span className="workout-time-icon"><CalendarDays size={22} /></span>
        <span className="workout-time-value"><strong>{display.slice(0, 10).replaceAll('-', ' / ')}</strong><small>{value === null ? '当前时间 · 提交时自动更新' : '按设备本地时间记录'}</small></span>
        <span className="workout-time-clock"><Clock3 size={14} />{display.slice(11, 16)}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <p id="workout-time-hint" className="workout-helper">忘记打卡也没关系，选择实际训练时间补记即可。</p>
      {open && <WorkoutSheet title="这次训练，是什么时候？" onClose={() => setOpen(false)} footer={
        <div className="workout-time-footer">
          <button type="button" className="btn-secondary" onClick={() => { onChange(null); setOpen(false); }}>使用当前时间</button>
          <button type="button" className="btn-neon" onClick={() => {
            try { resolveWorkoutTimestamp(selection); onChange(selection); setOpen(false); }
            catch (err) { setError((err as Error).message); }
          }}><Check size={17} />确认时间</button>
        </div>
      }>
        <div className="workout-date-shortcuts" role="group" aria-label="快捷日期">
          <button type="button" aria-pressed={selectedDate === today} onClick={() => quickDate(0)}>今天</button>
          <button type="button" aria-pressed={selectedDate === (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalWorkoutTime(d).slice(0, 10); })()} onClick={() => quickDate(-1)}>昨天</button>
          <span>训练统计计入所选日期</span>
        </div>
        <div className="workout-calendar-header">
          <button type="button" className="workout-icon-button" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}><ChevronLeft size={20} /></button>
          <strong>{month.getFullYear()} 年 {month.getMonth() + 1} 月</strong>
          <button type="button" className="workout-icon-button" aria-label="下个月" disabled={monthKey >= today.slice(0, 7)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}><ChevronRight size={20} /></button>
        </div>
        <div className="workout-calendar-week" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="workout-calendar-days" role="group" aria-label="选择训练日期">
          {Array.from({ length: leading }, (_, i) => <span key={`blank-${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${monthKey}-${pad(i + 1)}`;
            return <button type="button" key={date} disabled={date > today} aria-label={`${date}${date === today ? '，今天' : ''}`} aria-pressed={date === selectedDate} data-today={date === today} onClick={() => setDate(date)}>{i + 1}</button>;
          })}
        </div>
        <div className="workout-clock-heading"><strong><Clock3 size={16} />训练时间</strong><span>{hour} : {minute}</span></div>
        <div className="workout-clock-columns">
          <ClockOptions label="小时" count={24} selected={hour} onSelect={next => { setSelection(`${selectedDate}T${next}:${minute}`); setError(''); }} />
          <ClockOptions label="分钟" count={60} selected={minute} onSelect={next => { setSelection(`${selectedDate}T${hour}:${next}`); setError(''); }} />
        </div>
        <p className="workout-time-summary">已选 <strong>{selectedDate.replaceAll('-', ' / ')} · {hour}:{minute}</strong></p>
        {error && <p className="workout-submit-error" role="alert">{error}</p>}
      </WorkoutSheet>}
    </div>
  );
}
