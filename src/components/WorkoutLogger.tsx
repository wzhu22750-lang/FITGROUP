import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { updateWorkoutLog, createWorkoutLog, fetchMyWorkoutLogs, getCurrentUser, getUserProfile } from '../api';
import { WorkoutCategory, WorkoutLog, WorkoutVisibility } from '../types';
import { CARDIO_REFERENCE_BODYWEIGHT_KG, CATEGORY_META } from '../constants/workoutPresets';
import { formatWorkoutLogError } from '../utils/workoutLogUpdate';
import { ChevronDown, Dumbbell, Globe, History, Lock, Plus, RotateCcw, Send, Users, WifiOff } from 'lucide-react';
import {
  draftCategories, DraftExercise, exerciseKey, historyByExercise, MAX_WORKOUT_EXERCISES,
  patchDraftExercise, toRecordedExercise, validateDraftExercise,
} from '../utils/workoutDraft';
import { resolveWorkoutTimestamp, toLocalWorkoutTime } from '../utils/workoutTime';
import { useWorkoutDraft } from './workout/useWorkoutDraft';
import ExerciseEditor from './workout/ExerciseEditor';
import ExercisePicker from './workout/ExercisePicker';
import HistoryPicker from './workout/HistoryPicker';
import WorkoutSheet from './workout/WorkoutSheet';
import WorkoutTimePicker from './workout/WorkoutTimePicker';
import './workout/workout.css';

interface WorkoutLoggerProps { onSuccess: () => void; }
const visibilityOptions: { value: WorkoutVisibility; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: '全员公开', icon: Globe },
  { value: 'friends', label: '好友小队', icon: Users },
  { value: 'private', label: '仅自己', icon: Lock },
];

export default function WorkoutLogger(props: WorkoutLoggerProps) {
  const user = getCurrentUser();
  if (!user?.uid) return <p className="card p-6 text-center">请先登录，再记录训练。</p>;
  // Remount the entire editing session on account changes; never carry one account's draft to another.
  return <WorkoutSession key={user.uid} owner={user.uid} {...props} />;
}

export function WorkoutSession({ owner, onSuccess, editing }: WorkoutLoggerProps & { owner: string; editing?: {
  log: WorkoutLog;
  onSuccess: (log: WorkoutLog) => void;
  onBusy: (busy: boolean) => void;
} }) {
  const { draft, draftRef, update, commit, finish, reset, restored, storageWarning } = useWorkoutDraft(owner, editing?.log);
  const [expandedId, setExpandedId] = useState(draft.exercises[0]?.id || '');
  const [sheet, setSheet] = useState<'add' | 'history' | 'clear' | null>(null);
  const [history, setHistory] = useState<WorkoutLog[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [userWeight, setUserWeight] = useState(CARDIO_REFERENCE_BODYWEIGHT_KG);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState('');
  const [removed, setRemoved] = useState<{ exercise: DraftExercise; index: number } | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const historyMap = useMemo(() => historyByExercise(history), [history]);
  const categories = draftCategories(draft);
  const completeCount = draft.exercises.filter(ex => !Object.keys(validateDraftExercise(ex)).length).length;
  const visibilityLabel = visibilityOptions.find(option => option.value === draft.visibility)!.label;

  useEffect(() => {
    let active = true;
    setHistoryState('loading');
    void fetchMyWorkoutLogs(owner, 30).then(logs => {
      if (!active || getCurrentUser()?.uid !== owner) return;
      setHistory(logs.filter(log => log.userId === owner && log.exercises?.length).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setHistoryState('ready');
    }).catch(() => { if (active) setHistoryState('error'); });
    return () => { active = false; };
  }, [owner, historyAttempt]);

  useEffect(() => {
    let active = true;
    void getUserProfile(owner).then(profile => {
      if (active && profile?.bodyweightKg && profile.bodyweightKg > 0) setUserWeight(profile.bodyweightKg);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [owner]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const changeExercise = (id: string, patch: Partial<DraftExercise>) => {
    update(current => ({ ...current, exercises: current.exercises.map(ex => ex.id === id ? patchDraftExercise(ex, patch, userWeight) : ex) }));
    setSubmitError('');
  };
  const addExercises = (incoming: DraftExercise[]) => {
    const keys = new Set(draftRef.current.exercises.map(exerciseKey));
    const unique = incoming.filter(ex => { const key = exerciseKey(ex); if (keys.has(key)) return false; keys.add(key); return true; });
    if (draftRef.current.exercises.length + unique.length > MAX_WORKOUT_EXERCISES) { setNotice('每次训练最多 10 个动作。'); return; }
    update(current => ({ ...current, exercises: [...current.exercises, ...unique] }));
    setSheet(null);
    if (unique[0]) setExpandedId(unique[0].id);
    setNotice(`已添加 ${unique.length} 个动作，请填写实际训练数据。`);
    if (unique[0]) requestAnimationFrame(() => document.getElementById(`exercise-body-${unique[0].id}`)?.closest('section')?.scrollIntoView({ block: 'start' }));
  };
  const removeExercise = (id: string) => {
    const index = draftRef.current.exercises.findIndex(ex => ex.id === id);
    if (index < 0) return;
    setRemoved({ exercise: draftRef.current.exercises[index], index });
    update(current => ({ ...current, exercises: current.exercises.filter(ex => ex.id !== id) }));
  };
  const undoRemove = () => {
    if (!removed) return;
    if (draftRef.current.exercises.length >= MAX_WORKOUT_EXERCISES) { setNotice('已达到 10 项上限，请先移除一个动作再撤销。'); return; }
    update(current => {
      const next = [...current.exercises];
      next.splice(Math.min(removed.index, next.length), 0, removed.exercise);
      return { ...current, exercises: next };
    });
    setExpandedId(removed.exercise.id);
    setRemoved(null);
  };
  const moveExercise = (id: string, direction: -1 | 1) => update(current => {
    const index = current.exercises.findIndex(ex => ex.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.exercises.length) return current;
    const next = [...current.exercises];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return { ...current, exercises: next };
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const user = getCurrentUser();
    if (user?.uid !== owner) { setSubmitError('账号状态已变化，请重新进入打卡页。'); return; }
    if (offline) { setSubmitError(editing ? '当前离线，请联网后保存。修改暂留在当前窗口，请勿关闭。' : '当前离线，请联网后提交。训练内容仍保留在草稿中。'); return; }
    const current = draftRef.current;
    setShowErrors(true);
    if (!current.exercises.length) { setSubmitError('先添加至少一个训练动作。'); return; }
    const invalid = current.exercises.find(ex => Object.keys(validateDraftExercise(ex)).length > 0);
    if (invalid) {
      setExpandedId(invalid.id);
      const field = Object.keys(validateDraftExercise(invalid))[0];
      setSubmitError(`「${invalid.name || '未命名动作'}」还有未填写或不正确的数据。`);
      requestAnimationFrame(() => {
        const input = document.getElementById(`workout-${invalid.id}-${field}`);
        input?.scrollIntoView({ block: 'center' });
        input?.focus({ preventScroll: true });
      });
      return;
    }
    const workoutTime = current.workoutTime ?? toLocalWorkoutTime();
    let timestamp: string;
    try {
      timestamp = resolveWorkoutTimestamp(workoutTime);
    } catch (error) {
      setSubmitError((error as Error).message);
      document.getElementById('workout-time')?.focus();
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    editing?.onBusy(true);
    setSubmitError('');
    // Persist the exact payload and mutation ID before writing. A timeout must not
    // allow edits that would then be silently discarded by the server's ID deduplication.
    const snapshot = current.pending && current.workoutTime !== null ? current : commit({ ...current, workoutTime, pending: true });
    let saved = false;
    let updatedLog: WorkoutLog | undefined;
    try {
      const finalCategories = draftCategories(snapshot);
      const payload = {
        id: snapshot.id, userId: owner, userName: user.displayName || 'FitGroup', userPhoto: user.photoURL || '',
        category: finalCategories.join(', '), categories: finalCategories,
        exercises: snapshot.exercises.map(toRecordedExercise), note: snapshot.note.trim(), visibility: snapshot.visibility,
        timestamp, likesCount: 0, commentsCount: 0,
      };
      if (editing) {
        // Preserve sub-minute precision unless the user actually changes the time.
        const { timestamp: _timestamp, ...updates } = payload;
        updatedLog = await updateWorkoutLog(editing.log.id, {
          ...updates,
          ...(snapshot.workoutTime !== toLocalWorkoutTime(new Date(editing.log.timestamp)) ? { timestamp } : {}),
        });
      } else {
        await createWorkoutLog(payload);
      }
      finish();
      saved = true;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      const rejected = (/^(22|23|42|PGRST)/.test(code) && code !== '23505') || /^WORKOUT_LOG_(INVALID|EMPTY)/.test(code);
      if (rejected) commit({ ...snapshot, pending: false });
      setSubmitError(`${formatWorkoutLogError(error)} ${editing ? '修改暂留在当前窗口，请勿关闭，可重试保存。' : rejected ? '数据未保存，草稿仍在，可修改后重试。' : '本次内容已保留，请重试确认提交；不会重复创建记录。'}`);
      requestAnimationFrame(() => {
        const message = document.getElementById('workout-submit-error');
        message?.scrollIntoView({ block: 'center' });
        message?.focus({ preventScroll: true });
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      editing?.onBusy(false);
    }
    // Do not wait on a profile refresh after a successful write or report a navigation
    // failure as a save failure. The completed draft is removed only after server success.
    if (saved && getCurrentUser()?.uid === owner) {
      if (editing && updatedLog) editing.onSuccess(updatedLog);
      else onSuccess();
    }
  };

  return (
    <form className={`workout-logger${editing ? ' workout-logger-edit' : ''}`} onSubmit={handleSubmit} noValidate aria-label={editing ? '编辑训练' : '记录训练'}>
      <header className={`workout-intro ${draft.exercises.length ? 'has-entries' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="workout-kicker">YOUR NEXT REP</p><h1>{editing ? '调整这次训练。' : '今天，练点什么？'}</h1></div>
          <span className="workout-intro-mark" aria-hidden="true"><Dumbbell size={25} /></span>
        </div>
        <div className="workout-save-state" role="status">
          <span><span className="workout-status-dot" />{editing ? '保存后更新原记录，不会重复打卡' : storageWarning ? '草稿保存受限' : draft.pending ? '等待确认提交' : draft.exercises.length || draft.note ? '草稿已保存在此设备' : '边练边记，随时回来继续'}</span>
          {!editing && (draft.exercises.length > 0 || draft.note) && !draft.pending && <button type="button" onClick={() => setSheet('clear')}>清空</button>}
        </div>
      </header>

      {storageWarning && <p role="alert" className="workout-warning">{storageWarning}</p>}
      {offline && <p className="workout-warning flex items-center gap-2"><WifiOff size={16} />{editing ? '当前离线，修改暂留在当前窗口，联网后再保存。' : '离线可继续记草稿，联网后再提交。'}</p>}
      {restored && !draft.pending && <p className="workout-helper">已恢复未完成的训练，继续修改即可。草稿不会自动发布。</p>}
      {draft.pending && <p className="workout-warning">{isSubmitting ? '正在提交，请稍候…' : '上次提交尚未确认，内容暂时锁定。点击「重试提交」确认结果，避免重复打卡。'}</p>}

      <fieldset disabled={isSubmitting || draft.pending} className="workout-fields">
        <WorkoutTimePicker value={draft.workoutTime} disabled={isSubmitting || draft.pending} onChange={workoutTime => { update(current => ({ ...current, workoutTime })); setSubmitError(''); }} />
        <div className="workout-start-actions">
          <button type="button" className="btn-neon flex items-center justify-center gap-2" onClick={() => setSheet('add')} disabled={draft.exercises.length >= 10}><Plus size={19} />添加动作</button>
          <button type="button" className="btn-secondary flex items-center justify-center gap-2" onClick={() => setSheet('history')} disabled={!history.length}><History size={17} />沿用上次</button>
        </div>
        <div className="workout-history-status">
          {historyState === 'loading' ? <span>正在读取最近训练，不影响新建记录…</span> : historyState === 'error' ? <><span>历史暂不可用，仍可添加新动作。</span><button type="button" onClick={() => setHistoryAttempt(value => value + 1)}>重试</button></> : <span>{history.length ? '从最近训练开始，少填一遍。' : '第一次来？从动作库选几个熟悉的动作。'}</span>}
        </div>

        <div className="workout-section-title"><h2><span>01</span>训练内容</h2><span>{draft.exercises.length} / 10 动作</span></div>
        {!draft.exercises.length && (
          <div className="workout-empty">
            <div className="workout-empty-icon"><Plus size={28} /></div>
            <h3>先选动作，再记数字。</h3>
            <p>动作库支持多选；有历史记录的动作<br />可以一键沿用上次重量和组次。</p>
            <button type="button" className="workout-text-button" onClick={() => setSheet('add')}>打开动作库 <Plus size={16} /></button>
          </div>
        )}
        <div className="workout-exercise-list">
          {draft.exercises.map((ex, index) => <ExerciseEditor key={ex.id} exercise={ex} index={index} count={draft.exercises.length}
            expanded={expandedId === ex.id} onToggle={() => setExpandedId(expandedId === ex.id ? '' : ex.id)}
            errors={showErrors ? validateDraftExercise(ex) : {}} previous={historyMap.get(exerciseKey(ex))}
            onChange={patch => changeExercise(ex.id, patch)} onDelete={() => removeExercise(ex.id)} onMove={direction => moveExercise(ex.id, direction)} />)}
        </div>
        {removed && <div className="workout-undo" role="status"><span>已移除「{removed.exercise.name || '未命名动作'}」</span><button type="button" onClick={undoRemove}><RotateCcw size={14} />撤销</button></div>}
        {draft.exercises.length > 0 && <button type="button" className="workout-add-more" onClick={() => setSheet('add')} disabled={draft.exercises.length >= 10}><Plus size={17} />{draft.exercises.length >= 10 ? '已达到 10 个动作上限' : '继续添加动作'}</button>}
        {notice && <p className="workout-helper" role="status">{notice}</p>}

        <div className="workout-section-title"><h2><span>02</span>补充记录</h2><span>按需填写</span></div>
        <details className="workout-details">
          <summary><span>训练部位 <small>{draft.exercises.length ? categories.map(cat => CATEGORY_META[cat].zh).join(' / ') : '按动作自动识别'}</small></span><ChevronDown size={16} /></summary>
          <div className="p-4"><p className="workout-helper mb-3">动作对应部位自动保留；如有遗漏，可手动补充。</p>
            <div className="workout-category-options">
              {Object.values(WorkoutCategory).map(cat => {
                const automatic = draftCategories({ ...draft, categories: [] }).includes(cat) && draft.exercises.length > 0;
                const selected = draft.categories.includes(cat) || automatic;
                return <button type="button" key={cat} aria-pressed={selected} disabled={automatic} onClick={() => update(current => ({ ...current, categories: current.categories.includes(cat) ? current.categories.filter(value => value !== cat) : [...current.categories, cat] }))}>{CATEGORY_META[cat].zh}{automatic ? ' · 自动' : ''}</button>;
              })}
            </div>
          </div>
        </details>
        <details className="workout-details">
          <summary><span>训练心得 <small>{draft.note ? `${draft.note.length} 字` : '选填'}</small></span><ChevronDown size={16} /></summary>
          <div className="p-4"><label htmlFor="workout-note" className="workout-field-label">今天的状态、感受或小目标</label><textarea id="workout-note" value={draft.note} maxLength={500} rows={3} onChange={event => update(current => ({ ...current, note: event.target.value }))} placeholder="例如：最后一组还有余力，下次试试加重。" /><p className="workout-helper text-right mt-1">{draft.note.length} / 500</p></div>
        </details>
        <div className="workout-visibility">
          <h2 className="text-sm font-black mb-3">谁能看到这次训练？</h2>
          <div role="group" aria-label="可见范围">{visibilityOptions.map(({ value, label, icon: Icon }) => <button type="button" key={value} aria-pressed={draft.visibility === value} onClick={() => update(current => ({ ...current, visibility: value }))}><Icon size={16} />{label}</button>)}</div>
        </div>
      </fieldset>

      {submitError && <p id="workout-submit-error" tabIndex={-1} className="workout-submit-error" role="alert">{submitError}</p>}
      <footer className="workout-submitbar">
        <div><strong>{completeCount} / {draft.exercises.length} <span>项已填写</span></strong><small>{offline ? '离线草稿' : visibilityLabel}</small></div>
        <button type="submit" className="btn-neon" disabled={isSubmitting || offline || !draft.exercises.length} aria-busy={isSubmitting}>
          {isSubmitting ? '正在保存…' : draft.pending ? '重试提交' : editing ? '保存修改' : '完成打卡'}{!isSubmitting && <Send size={17} />}
        </button>
      </footer>

      {sheet === 'add' && <ExercisePicker existing={draft.exercises} history={history} onClose={() => setSheet(null)} onAdd={addExercises} />}
      {sheet === 'history' && <HistoryPicker logs={history} currentCount={draft.exercises.length} onClose={() => setSheet(null)} onImport={(exercises, mode) => {
        if (exercises.length + (mode === 'append' ? draftRef.current.exercises.length : 0) > 10) return;
        update(current => ({ ...current, exercises: mode === 'append' ? [...current.exercises, ...exercises] : exercises }));
        setExpandedId(exercises[0]?.id || ''); setRemoved(null); setShowErrors(false); setSheet(null); setNotice(`已${mode === 'append' ? '追加' : '沿用'} ${exercises.length} 个动作，请按本次实际训练调整。`);
      }} />}
      {sheet === 'clear' && <WorkoutSheet title="清空本次草稿？" onClose={() => setSheet(null)} footer={<div className="grid grid-cols-2 gap-3"><button type="button" className="btn-secondary" onClick={() => setSheet(null)}>继续记录</button><button type="button" className="btn-primary" onClick={() => { reset(); setSheet(null); setRemoved(null); setExpandedId(''); setSubmitError(''); setNotice(''); setShowErrors(false); }}>确认清空</button></div>}><p className="text-sm leading-relaxed">只清空此设备上本次未提交的动作和心得，不影响已发布的历史记录。清空后无法恢复。</p></WorkoutSheet>}
    </form>
  );
}
