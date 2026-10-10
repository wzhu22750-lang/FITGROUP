import { isLocalWorkoutTime } from './workoutTime';
import { Exercise, WorkoutCategory, WorkoutLog, WorkoutVisibility } from '../types';
import { estimateCardioCalories, inferLogCategories, PresetExercise } from '../constants/workoutPresets';

export const MAX_WORKOUT_EXERCISES = 10;
export type WeightMode = 'load' | 'bodyweight' | 'assisted';
export type NumericField = 'weight' | 'sets' | 'reps' | 'duration' | 'distance' | 'calories';
export interface DraftExercise {
  id: string;
  name: string;
  type: Exercise['type'];
  weightMode: WeightMode;
  weight: string;
  sets: string;
  reps: string;
  duration: string;
  distance: string;
  calories: string;
  caloriesSource: 'reported' | 'estimated';
}
export interface WorkoutDraft {
  version: 1;
  owner: string;
  id: string;
  exercises: DraftExercise[];
  categories: WorkoutCategory[];
  note: string;
  visibility: WorkoutVisibility;
  /** null means use submission time; a local minute value means a manual check-in time. */
  workoutTime: string | null;
  updatedAt: number;
  /** Freeze the submitted payload after an uncertain response; retries reuse its ID. */
  pending: boolean;
}
export type ExerciseErrors = Partial<Record<NumericField | 'name', string>>;
export const newDraftId = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID() : `fg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const draftStorageKey = (owner: string) => `fitgroup:workout-draft:v1:${owner}`;
export const exerciseKey = (ex: { name: string; type: string }) => `${ex.type}:${ex.name.trim().toLocaleLowerCase()}`;

export function createDraft(owner: string): WorkoutDraft {
  return { version: 1, owner, id: newDraftId(), exercises: [], categories: [], note: '', visibility: 'public', workoutTime: null, updatedAt: Date.now(), pending: false };
}

export function createDraftExercise(preset: Pick<PresetExercise, 'name' | 'type'> & Partial<PresetExercise>): DraftExercise {
  const bodyweight = /^(俯卧撑|引体向上|双杠臂屈伸)$/.test(preset.name);
  return {
    id: newDraftId(), name: preset.name, type: preset.type,
    weightMode: bodyweight ? 'bodyweight' : 'load', weight: '',
    sets: String(preset.defaultSets ?? 4), reps: String(preset.defaultReps ?? 10),
    duration: '', distance: '', calories: '', caloriesSource: 'estimated',
  };
}

export function fromRecordedExercise(ex: Exercise): DraftExercise {
  const numberText = (n?: number) => typeof n === 'number' && Number.isFinite(n) ? String(n) : '';
  return {
    ...createDraftExercise(ex), id: newDraftId(),
    weightMode: ex.weight === 0 ? 'bodyweight' : (ex.weight ?? 0) < 0 ? 'assisted' : 'load',
    weight: typeof ex.weight === 'number' ? numberText(Math.abs(ex.weight)) : '',
    sets: numberText(ex.sets), reps: numberText(ex.reps),
    duration: numberText(ex.duration), distance: numberText(ex.distance), calories: numberText(ex.calories),
    // Legacy calories of unknown provenance are preserved rather than silently recalculated.
    caloriesSource: ex.caloriesSource === 'estimated' ? 'estimated' : 'reported',
  };
}

export function patchDraftExercise(ex: DraftExercise, patch: Partial<DraftExercise>, bodyweight: number): DraftExercise {
  const next = { ...ex, ...patch, id: ex.id };
  if (next.type === 'cardio' && next.caloriesSource === 'estimated') {
    const duration = Number(next.duration);
    next.calories = Number.isFinite(duration) && duration > 0
      ? String(estimateCardioCalories(next.name, duration, bodyweight)) : '';
  }
  return next;
}

export function validateDraftExercise(ex: DraftExercise): ExerciseErrors {
  const errors: ExerciseErrors = {};
  if (!ex.name.trim()) errors.name = '请填写动作名称';
  else if (ex.name.trim().length > 80) errors.name = '名称最多 80 个字';
  const check = (field: NumericField, label: string, min: number, max: number, required: boolean, integer = false) => {
    const raw = ex[field].trim();
    if (!raw && !required) return;
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      errors[field] = `${label}需为 ${min}–${max}${integer ? ' 的整数' : ''}`;
    }
  };
  if (ex.type === 'strength') {
    if (ex.weightMode !== 'bodyweight') {
      check('weight', ex.weightMode === 'assisted' ? '辅助重量' : '重量', 0.1, ex.weightMode === 'assisted' ? 500 : 2000, true);
      if (!errors.weight && Math.abs(Number(ex.weight) * 10 - Math.round(Number(ex.weight) * 10)) > 1e-7) errors.weight = '重量最多保留 1 位小数';
    }
    check('sets', '组数', 1, 100, true, true);
    check('reps', '次数', 1, 1000, true, true);
  } else {
    check('duration', '分钟', 0, 1440, false, true);
    check('distance', '公里', 0, 1000, false);
    if (!errors.distance && Math.abs(Number(ex.distance) * 100 - Math.round(Number(ex.distance) * 100)) > 1e-7) errors.distance = '距离最多保留 2 位小数';
    check('calories', '大卡', 0, 20000, false, true);
    if (![ex.duration, ex.distance, ex.calories].some(value => Number.isFinite(Number(value)) && Number(value) > 0)) {
      errors.duration = '时长、距离、大卡至少填写一项';
    }
  }
  return errors;
}

export function toRecordedExercise(ex: DraftExercise): Exercise {
  if (Object.keys(validateDraftExercise(ex)).length) throw new Error(`「${ex.name || '未命名动作'}」还有未填写的项目`);
  const base = { id: ex.id, name: ex.name.trim(), type: ex.type };
  return ex.type === 'strength' ? {
    ...base, weight: ex.weightMode === 'bodyweight' ? 0 : Number(ex.weight) * (ex.weightMode === 'assisted' ? -1 : 1),
    sets: Number(ex.sets), reps: Number(ex.reps),
  } : {
    ...base, duration: Number(ex.duration), distance: Number(ex.distance), calories: Number(ex.calories), caloriesSource: ex.caloriesSource,
  };
}

export function draftCategories(draft: WorkoutDraft): WorkoutCategory[] {
  return inferLogCategories('', draft.categories, draft.exercises.map(ex => ({ name: ex.name, type: ex.type })));
}

export function historyByExercise(logs: WorkoutLog[]) {
  const history = new Map<string, { exercise: Exercise; timestamp: string }>();
  [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).forEach(log => {
    (log.exercises || []).forEach(exercise => {
      if (!exercise.name.trim()) return;
      const key = exerciseKey(exercise);
      if (!history.has(key)) history.set(key, { exercise, timestamp: log.timestamp });
    });
  });
  return history;
}

export function describeExercise(ex: Exercise): string {
  if (ex.type === 'strength') {
    const weight = ex.weight === 0 ? '自重' : `${(ex.weight ?? 0) < 0 ? '辅助 ' : ''}${Math.abs(ex.weight ?? 0)} kg`;
    return `${weight} · ${ex.sets ?? 0} 组 × ${ex.reps ?? 0} 次`;
  }
  return [ex.duration ? `${ex.duration} 分钟` : '', ex.distance ? `${ex.distance} km` : '', ex.calories ? `${ex.calories} 大卡` : ''].filter(Boolean).join(' · ') || '有氧运动';
}

/** Local storage is untrusted input; reject incompatible/corrupt drafts, never another account's. */
export function decodeDraft(raw: string | null, owner: string): WorkoutDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || value.owner !== owner || typeof value.id !== 'string' || !value.id || value.id.length > 64) return null;
    if (!Array.isArray(value.exercises) || value.exercises.length > MAX_WORKOUT_EXERCISES || !Array.isArray(value.categories)) return null;
    if (!['public', 'private', 'friends'].includes(value.visibility) || typeof value.note !== 'string' || value.note.length > 500 || typeof value.pending !== 'boolean') return null;
    if (!Number.isFinite(value.updatedAt)) return null;
    // Existing v1 drafts predate the optional training time selector.
    if (value.workoutTime === undefined) value.workoutTime = null;
    if (value.workoutTime !== null && (typeof value.workoutTime !== 'string' || !isLocalWorkoutTime(value.workoutTime))) return null;
    const ids = new Set<string>();
    for (const ex of value.exercises) {
      if (!ex || typeof ex.id !== 'string' || !ex.id || ex.id.length > 64 || ids.has(ex.id)) return null;
      ids.add(ex.id);
      if (typeof ex.name !== 'string' || ex.name.length > 80 || !['strength', 'cardio'].includes(ex.type) || !['load', 'bodyweight', 'assisted'].includes(ex.weightMode)) return null;
      if (!['reported', 'estimated'].includes(ex.caloriesSource)) return null;
      if (!['weight', 'sets', 'reps', 'duration', 'distance', 'calories'].every(key => typeof ex[key] === 'string' && ex[key].length <= 20)) return null;
    }
    if (!value.categories.every((cat: WorkoutCategory) => Object.values(WorkoutCategory).includes(cat))) return null;
    if (value.pending && (!value.exercises.length || value.exercises.some((ex: DraftExercise) => Object.keys(validateDraftExercise(ex)).length))) return null;
    return value as WorkoutDraft;
  } catch { return null; }
}
