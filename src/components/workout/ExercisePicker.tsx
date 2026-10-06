import { useMemo, useState } from 'react';
import { Check, Dumbbell, Plus, Search, Timer } from 'lucide-react';
import { WorkoutCategory, WorkoutLog } from '../../types';
import { CATEGORY_META, PRESET_EXERCISES_BY_CATEGORY, PresetExercise, inferLogCategories } from '../../constants/workoutPresets';
import { createDraftExercise, describeExercise, DraftExercise, exerciseKey, historyByExercise } from '../../utils/workoutDraft';
import WorkoutSheet from './WorkoutSheet';

type Tab = 'recent' | 'all' | WorkoutCategory;
interface Item { key: string; preset: PresetExercise; category: WorkoutCategory; }

export default function ExercisePicker({ existing, history, onAdd, onClose }: {
  existing: DraftExercise[]; history: WorkoutLog[]; onAdd: (exercises: DraftExercise[]) => void; onClose: () => void;
}) {
  const historyMap = useMemo(() => historyByExercise(history), [history]);
  const [tab, setTab] = useState<Tab>(historyMap.size ? 'recent' : 'all');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [customType, setCustomType] = useState<'strength' | 'cardio'>('strength');
  const slots = 10 - existing.length;
  const existingKeys = new Set(existing.map(exerciseKey));
  const items = useMemo(() => {
    const map = new Map<string, Item>();
    Object.entries(PRESET_EXERCISES_BY_CATEGORY).forEach(([category, presets]) => {
      presets.forEach(preset => map.set(exerciseKey(preset), { key: exerciseKey(preset), preset, category: category as WorkoutCategory }));
    });
    historyMap.forEach(({ exercise }, key) => {
      if (!map.has(key)) map.set(key, { key, preset: { name: exercise.name, type: exercise.type }, category: inferLogCategories('', [], [exercise])[0] || WorkoutCategory.Others });
    });
    return [...map.values()];
  }, [historyMap]);
  const search = query.trim().toLocaleLowerCase().replace(/\s/g, '');
  const filtered = items.filter(item => {
    if (search) return item.preset.name.toLocaleLowerCase().replace(/\s/g, '').includes(search);
    return tab === 'all' || (tab === 'recent' ? historyMap.has(item.key) : item.category === tab);
  });
  const toggle = (key: string) => setSelection(current => current.includes(key) ? current.filter(item => item !== key) : current.length < slots ? [...current, key] : current);
  const customName = query.trim();
  const duplicateCustom = existingKeys.has(exerciseKey({ name: customName, type: customType }));
  return (
    <WorkoutSheet title="添加训练动作" onClose={onClose} footer={
      <button type="button" className="btn-neon-lg w-full" disabled={!selection.length} onClick={() => {
        const selected = selection.map(key => items.find(item => item.key === key)!).filter(Boolean);
        onAdd(selected.map(item => createDraftExercise(item.preset)));
      }}>{selection.length ? `添加 ${selection.length} 个动作` : '请选择动作'} <Plus size={18} /></button>
    }>
      <div className="workout-picker-toolbar">
      <label className="workout-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索动作，如卧推、跑步" aria-label="搜索训练动作" maxLength={80} />
      </label>
      <div className="workout-filter-tabs" role="group" aria-label="动作分类">
        {(['recent', 'all', ...Object.values(WorkoutCategory)] as Tab[]).map(value => (
          <button type="button" key={value} aria-pressed={tab === value && !search} onClick={() => { setTab(value); setQuery(''); }}>
            {value === 'recent' ? '最近练过' : value === 'all' ? '动作库' : CATEGORY_META[value].zh}
          </button>
        ))}
      </div>
      </div>
      <p className="workout-helper" role="status">可多选 · 还能添加 {slots} 项{selection.length ? `，已选 ${selection.length} 项` : ''}</p>
      <div className="workout-picker-list">
        {filtered.map(item => {
          const added = existingKeys.has(item.key);
          const checked = selection.includes(item.key);
          const previous = historyMap.get(item.key);
          return (
            <button type="button" key={item.key} className="workout-picker-item" aria-pressed={checked || added}
              disabled={added || (!checked && selection.length >= slots)} onClick={() => toggle(item.key)}>
              <span className="workout-picker-icon">{item.preset.type === 'strength' ? <Dumbbell size={18} /> : <Timer size={18} />}</span>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block text-sm">{item.preset.name}</strong>
                <span className="block text-xs text-ink/60 mt-1">{previous ? `上次 ${describeExercise(previous.exercise)}` : `${CATEGORY_META[item.category].zh} · ${item.preset.type === 'strength' ? '添加后填写实际重量' : '添加后填写运动数据'}`}</span>
              </span>
              <span className="workout-picker-check">{added ? '已添加' : checked ? <Check size={18} /> : <Plus size={18} />}</span>
            </button>
          );
        })}
      </div>
      {!filtered.length && <p className="py-6 text-center text-sm text-ink/60">{search ? '没有找到匹配动作，可以在下方自定义。' : '还没有最近训练，试试「动作库」。'}</p>}
      <div className="workout-custom">
        <h3 className="text-sm font-black">没有找到？自定义一个</h3>
        <p className="workout-helper mt-1">在顶部输入动作名称，再选择类型。</p>
        <div className="workout-filter-tabs mt-2" role="group" aria-label="自定义动作类型">
          <button type="button" aria-pressed={customType === 'strength'} onClick={() => setCustomType('strength')}>力量</button>
          <button type="button" aria-pressed={customType === 'cardio'} onClick={() => setCustomType('cardio')}>有氧 / 球类</button>
        </div>
        <button type="button" className="btn-secondary w-full mt-3 text-sm" disabled={!customName || slots === 0 || duplicateCustom || selection.length > 0}
          onClick={() => onAdd([createDraftExercise({ name: customName, type: customType })])}>
          {duplicateCustom ? '此动作已在训练中' : selection.length ? '先添加或取消已选动作' : customName ? `添加「${customName}」` : '先输入动作名称'}
        </button>
      </div>
    </WorkoutSheet>
  );
}
