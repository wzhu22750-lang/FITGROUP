import { useState, useEffect, FormEvent } from 'react';
import { updateWorkoutLog, getCurrentUser, getUserProfile } from '../api';
import { WorkoutCategory, Exercise, WorkoutLog, WorkoutVisibility } from '../types';
import {
  CATEGORY_META,
  PRESET_EXERCISES_BY_CATEGORY,
  PresetExercise,
  estimateCardioCalories,
  isCardioDistanceOptional,
  inferLogCategories,
  parseCategories,
} from '../constants/workoutPresets';
import {
  Plus,
  Trash2,
  X,
  Dumbbell,
  Timer,
  Check,
  Globe,
  Users,
  Lock,
  Save,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pushBackHandler } from '../backStack';

interface EditWorkoutModalProps {
  log: WorkoutLog;
  onClose: () => void;
  onSuccess: (updatedLog: Partial<WorkoutLog>) => void;
}

export default function EditWorkoutModal({ log, onClose, onSuccess }: EditWorkoutModalProps) {
  // Pre-fill categories
  const initialCategories = inferLogCategories(
    typeof log.category === 'string' ? log.category : '',
    log.categories,
    log.exercises
  );
  const [selectedCategories, setSelectedCategories] = useState<WorkoutCategory[]>(
    initialCategories.length > 0 ? initialCategories : [WorkoutCategory.Chest]
  );
  const [activePresetCategory, setActivePresetCategory] = useState<WorkoutCategory>(
    selectedCategories[0] || WorkoutCategory.Chest
  );
  const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);

  // Pre-fill exercises
  const [exercises, setExercises] = useState<Exercise[]>(() => {
    return (log.exercises || []).map((ex) => ({
      id: ex.id || Math.random().toString(36).slice(2, 11),
      name: ex.name,
      type: ex.type || 'strength',
      weight: ex.weight ?? 0,
      sets: ex.sets ?? 0,
      reps: ex.reps ?? 0,
      duration: ex.duration ?? 0,
      distance: ex.distance ?? 0,
      calories: ex.calories ?? 0,
    }));
  });

  const [note, setNote] = useState(log.note || '');
  const [visibility, setVisibility] = useState<WorkoutVisibility>(
    log.visibility === 'friends' || log.visibility === 'private' ? log.visibility : 'public'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [userWeight, setUserWeight] = useState<number>(65);

  useEffect(() => {
    return pushBackHandler(() => {
      onClose();
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) return;
    getUserProfile(user.uid)
      .then((p) => {
        if (p && typeof p.bodyweightKg === 'number' && p.bodyweightKg > 0) {
          setUserWeight(p.bodyweightKg);
        }
      })
      .catch(() => undefined);
  }, []);

  const handleToggleCategory = (cat: WorkoutCategory) => {
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length === 1) return;
      const next = selectedCategories.filter((c) => c !== cat);
      setSelectedCategories(next);
      if (activePresetCategory === cat) {
        setActivePresetCategory(next[0]);
      }
    } else {
      setSelectedCategories([...selectedCategories, cat]);
      setActivePresetCategory(cat);
    }
  };

  const addExercise = (type: 'strength' | 'cardio') => {
    if (exercises.length >= 10) {
      setErrorMsg('每次打卡最多添加 10 个动作');
      return;
    }
    setErrorMsg('');
    const defaultDuration = 30;
    const defaultCal = type === 'cardio' ? estimateCardioCalories('', defaultDuration, userWeight) : 0;
    setExercises([
      ...exercises,
      {
        id: Math.random().toString(36).slice(2, 11),
        name: '',
        type,
        ...(type === 'strength'
          ? { weight: 0, sets: 4, reps: 10 }
          : { duration: defaultDuration, distance: 0, calories: defaultCal }),
      },
    ]);
  };

  const handleAddPresetExercise = (preset: PresetExercise) => {
    if (exercises.length >= 10) {
      setErrorMsg('每次打卡最多添加 10 个动作');
      return;
    }
    setErrorMsg('');
    const duration = preset.defaultDuration ?? 30;
    const calculatedCalories =
      preset.type === 'cardio'
        ? estimateCardioCalories(preset.name, duration, userWeight)
        : 0;

    const newEx: Exercise = {
      id: Math.random().toString(36).slice(2, 11),
      name: preset.name,
      type: preset.type,
      ...(preset.type === 'strength'
        ? {
            weight: preset.defaultWeight ?? 0,
            sets: preset.defaultSets ?? 4,
            reps: preset.defaultReps ?? 10,
          }
        : {
            duration,
            distance: preset.defaultDistance ?? 0,
            calories: calculatedCalories || preset.defaultCalories || 0,
          }),
    };

    if (exercises.length === 1 && !exercises[0].name.trim()) {
      setExercises([newEx]);
    } else {
      setExercises([...exercises, newEx]);
    }

    const newlyInferred = inferLogCategories('', selectedCategories, [newEx]);
    if (newlyInferred.length > selectedCategories.length) {
      setSelectedCategories(newlyInferred);
    }
  };

  const handleToggleType = (id: string) => {
    const target = exercises.find((e) => e.id === id);
    if (!target) return;
    const nextType = target.type === 'strength' ? 'cardio' : 'strength';
    if (nextType === 'cardio') {
      const dur = target.duration && target.duration > 0 ? target.duration : 30;
      updateExercise(id, {
        type: 'cardio',
        duration: dur,
        distance: 0,
        calories: estimateCardioCalories(target.name, dur, userWeight),
      });
    } else {
      updateExercise(id, {
        type: 'strength',
        weight: 0,
        sets: 4,
        reps: 10,
      });
    }
  };

  const handleNameChange = (id: string, name: string) => {
    const target = exercises.find((e) => e.id === id);
    if (!target) return;
    if (target.type === 'cardio' && target.duration && target.duration > 0) {
      const newCalories = estimateCardioCalories(name, target.duration, userWeight);
      updateExercise(id, { name, calories: newCalories });
    } else {
      updateExercise(id, { name });
    }

    if (name.trim().length >= 2) {
      const newlyInferred = inferLogCategories('', selectedCategories, [{ name, type: target.type }]);
      if (newlyInferred.length > selectedCategories.length) {
        setSelectedCategories(newlyInferred);
      }
    }
  };

  const handleCardioDurationChange = (id: string, durationNum: number) => {
    const target = exercises.find((e) => e.id === id);
    if (!target) return;
    const newCalories = durationNum > 0 ? estimateCardioCalories(target.name, durationNum, userWeight) : 0;
    updateExercise(id, { duration: durationNum, calories: newCalories });
  };

  const handleRemoveExercise = (id: string) => {
    if (deleteConfirm === id) {
      setExercises(exercises.filter((e) => e.id !== id));
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const updateExercise = (id: string, updates: Partial<Exercise>) => {
    setExercises(exercises.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (selectedCategories.length === 0) {
      setErrorMsg('请至少选择一个训练部位');
      return;
    }

    if (exercises.length === 0) {
      setErrorMsg('请至少保留一个训练项目');
      return;
    }

    if (exercises.length > 10) {
      setErrorMsg('每次打卡最多支持 10 个项目');
      return;
    }

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.name.trim()) {
        setErrorMsg(`请填写第 ${i + 1} 个动作名称`);
        return;
      }
      if (ex.type === 'strength') {
        if (!ex.sets || ex.sets <= 0 || !ex.reps || ex.reps <= 0) {
          setErrorMsg(`「${ex.name}」请填写有效的组数和次数（需大于 0）`);
          return;
        }
      } else if (ex.type === 'cardio') {
        if (
          (!ex.duration || ex.duration <= 0) &&
          (!ex.distance || ex.distance <= 0) &&
          (!ex.calories || ex.calories <= 0)
        ) {
          setErrorMsg(`「${ex.name}」请至少填写时长、距离或卡路里之一`);
          return;
        }
      }
    }

    const sanitizedExercises: Exercise[] = exercises.map((ex) => {
      const isStrength = ex.type === 'strength';
      const cleanId = String(ex.id || Math.random().toString(36).slice(2, 11)).slice(0, 64);
      const cleanName = ex.name.trim().slice(0, 80) || (isStrength ? '力量训练' : '有氧运动');

      if (isStrength) {
        const weightVal = Math.max(0, Math.min(2000, Number.isFinite(Number(ex.weight)) ? Number(ex.weight) : 0));
        const setsVal = Math.max(1, Math.min(100, Math.round(Number(ex.sets)) || 4));
        const repsVal = Math.max(1, Math.min(1000, Math.round(Number(ex.reps)) || 10));
        return {
          id: cleanId,
          name: cleanName,
          type: 'strength',
          weight: weightVal,
          sets: setsVal,
          reps: repsVal,
        };
      } else {
        const durationVal = Math.max(0, Math.min(1440, Math.round(Number(ex.duration)) || 0));
        const distanceVal = Math.max(0, Math.min(1000, Number.isFinite(Number(ex.distance)) ? Number(ex.distance) : 0));
        const caloriesVal = Math.max(0, Math.min(20000, Math.round(Number(ex.calories)) || 0));
        return {
          id: cleanId,
          name: cleanName,
          type: 'cardio',
          duration: durationVal,
          distance: distanceVal,
          calories: caloriesVal,
        };
      }
    });

    const finalCategories = inferLogCategories('', selectedCategories, sanitizedExercises);

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const updatedLog = await updateWorkoutLog(log.id, {
        category: finalCategories.join(', '),
        categories: finalCategories,
        exercises: sanitizedExercises,
        note,
        visibility,
      });

      onSuccess(updatedLog || {
        category: finalCategories.join(', '),
        categories: finalCategories,
        exercises: sanitizedExercises,
        note,
        visibility,
      });
      onClose();
    } catch (err) {
      console.error('Update workout log failed:', err);
      setErrorMsg((err as Error)?.message || '保存修改失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentPresets = PRESET_EXERCISES_BY_CATEGORY[activePresetCategory] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-paper border-4 border-ink shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[90vh] flex flex-col my-auto"
      >
        {/* Header */}
        <div className="bg-neon border-b-4 border-ink p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-ink p-1">
              <Dumbbell size={18} className="text-neon" />
            </div>
            <h2 className="font-black text-ink uppercase tracking-tight text-lg italic">
              编辑打卡记录 / EDIT
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 border-2 border-ink bg-white hover:bg-ink hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="bg-red-500 text-white border-2 border-ink p-3 font-black text-xs uppercase">
              {errorMsg}
            </div>
          )}

          {/* Category Selector */}
          <div className="bg-white p-4 border-2 border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <label className="block text-xs font-black text-ink uppercase tracking-wider mb-2">
              训练部位 / Target Muscles
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.values(WorkoutCategory).map((cat) => {
                const meta = CATEGORY_META[cat];
                const isSelected = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleToggleCategory(cat)}
                    className={`py-2 px-1 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]'
                        : 'bg-white text-ink hover:bg-neon'
                    }`}
                  >
                    <span>{meta.en}</span>
                    <span className="text-[9px] opacity-75">{meta.zh}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Presets (Collapsible) */}
          <div className="bg-white border-2 border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <div
              onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
              className="p-3 flex items-center justify-between cursor-pointer select-none hover:bg-paper/50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Dumbbell size={13} className="text-ink" />
                <span className="text-xs font-black text-ink uppercase tracking-wider">常用动作快捷添加</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-black text-ink/40">
                  {isPresetsExpanded ? '收起' : '展开'}
                </span>
                {isPresetsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {isPresetsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-3 pb-3 border-t-2 border-ink/10 pt-2"
                >
                  <div className="flex gap-1 overflow-x-auto pb-1.5 mb-2 border-b border-ink/10">
                    {Object.values(WorkoutCategory).map((cat) => {
                      const isTabActive = activePresetCategory === cat;
                      const meta = CATEGORY_META[cat];
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActivePresetCategory(cat)}
                          className={`px-2 py-0.5 border border-ink text-[11px] font-black uppercase transition-all shrink-0 cursor-pointer ${
                            isTabActive ? 'bg-ink text-neon' : 'bg-paper text-ink'
                          }`}
                        >
                          {meta?.zh || cat}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {currentPresets.map((preset) => {
                      const isAlreadyAdded = exercises.some((e) => e.name.trim() === preset.name);
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleAddPresetExercise(preset)}
                          className={`py-1 px-2 border border-ink text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1 ${
                            isAlreadyAdded
                              ? 'bg-ink text-neon'
                              : 'bg-paper text-ink hover:bg-neon'
                          }`}
                        >
                          {isAlreadyAdded ? <Check size={11} className="stroke-[3]" /> : <Plus size={11} />}
                          <span>{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Exercise Items List */}
          <div className="space-y-3">
            <label className="block text-xs font-black text-ink uppercase tracking-wider px-1">
              动作明细 / Exercises ({exercises.length}/10)
            </label>

            {exercises.map((ex, index) => (
              <div
                key={ex.id}
                className={`bg-white p-3.5 border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                  deleteConfirm === ex.id ? 'border-red-500 bg-red-50' : 'border-ink'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase bg-ink text-white px-1.5 py-0.5 italic">
                    #{index + 1} {ex.type === 'strength' ? '力量' : '有氧'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {deleteConfirm === ex.id && (
                      <span className="text-[9px] font-black text-red-600 uppercase">确认删除?</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveExercise(ex.id)}
                      className="p-0.5 border border-ink bg-paper text-ink hover:bg-red-400 hover:text-white transition-colors cursor-pointer"
                      title="删除该动作"
                    >
                      {deleteConfirm === ex.id ? <Check size={13} /> : <X size={13} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={`p-1.5 border-2 border-ink cursor-pointer select-none ${
                      ex.type === 'strength' ? 'bg-neon' : 'bg-white'
                    }`}
                    onClick={() => handleToggleType(ex.id)}
                    title="点击切换力量/有氧"
                  >
                    {ex.type === 'strength' ? <Dumbbell size={16} /> : <Timer size={16} />}
                  </div>
                  <input
                    type="text"
                    placeholder="动作名称"
                    value={ex.name}
                    onChange={(e) => handleNameChange(ex.id, e.target.value)}
                    className="flex-1 font-black text-ink border-b-2 border-ink focus:border-neon outline-none text-sm uppercase"
                    required
                  />
                </div>

                {ex.type === 'strength' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[9px] font-black text-ink uppercase">KG(重量)</label>
                        <button
                          type="button"
                          onClick={() => {
                            const currentWeight = typeof ex.weight === 'number' ? ex.weight : (parseFloat(String(ex.weight)) || 0);
                            updateExercise(ex.id, { weight: currentWeight === 0 ? -10 : -currentWeight });
                          }}
                          className={`text-[8px] font-black px-1 border border-ink ${
                            typeof ex.weight === 'number' && ex.weight < 0 ? 'bg-ink text-neon' : 'bg-paper text-ink/70'
                          }`}
                        >
                          {typeof ex.weight === 'number' && ex.weight < 0 ? '减重' : '负重'}
                        </button>
                      </div>
                      <input
                        type="number"
                        step="0.5"
                        value={ex.weight === undefined || ex.weight === null ? '' : ex.weight}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === '-') {
                            updateExercise(ex.id, { weight: val as any });
                          } else {
                            const num = parseFloat(val);
                            updateExercise(ex.id, { weight: isNaN(num) ? 0 : num });
                          }
                        }}
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-1.5 text-center font-black text-sm focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-ink uppercase block mb-0.5">Sets(组数)</label>
                      <input
                        type="number"
                        min="0"
                        value={ex.sets || ''}
                        onChange={(e) => updateExercise(ex.id, { sets: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-1.5 text-center font-black text-sm focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-ink uppercase block mb-0.5">Reps(次数)</label>
                      <input
                        type="number"
                        min="0"
                        value={ex.reps || ''}
                        onChange={(e) => updateExercise(ex.id, { reps: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-1.5 text-center font-black text-sm focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-black text-ink uppercase block mb-0.5">Min(分钟)</label>
                      <input
                        type="number"
                        min="0"
                        value={ex.duration || ''}
                        onChange={(e) => handleCardioDurationChange(ex.id, Number(e.target.value) || 0)}
                        placeholder="30"
                        className="w-full bg-paper border-2 border-ink p-1.5 text-center font-black text-sm focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-ink uppercase block mb-0.5">Km(公里)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={ex.distance || ''}
                        onChange={(e) => updateExercise(ex.id, { distance: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-1.5 text-center font-black text-sm focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-ink uppercase block mb-0.5">Kcal(大卡)</label>
                      <input
                        type="number"
                        min="0"
                        value={ex.calories || ''}
                        onChange={(e) => updateExercise(ex.id, { calories: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-1.5 text-center font-black text-sm focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => addExercise('strength')}
                className="flex-1 bg-white border-2 border-ink py-2 font-black uppercase text-xs flex items-center justify-center gap-1.5 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <Plus size={14} /> 力量动作
              </button>
              <button
                type="button"
                onClick={() => addExercise('cardio')}
                className="flex-1 bg-white border-2 border-ink py-2 font-black uppercase text-xs flex items-center justify-center gap-1.5 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <Plus size={14} /> 有氧项目
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white p-4 border-2 border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <label className="block text-xs font-black text-ink uppercase tracking-wider mb-2">
              Notes / 训练心得
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="今天状态如何？记录下来吧..."
              className="w-full bg-paper border-2 border-ink p-2.5 font-black text-ink min-h-[70px] outline-none focus:bg-white text-xs"
            />
          </div>

          {/* Visibility */}
          <div className="bg-white p-4 border-2 border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <label className="block text-xs font-black text-ink uppercase tracking-wider mb-2">
              Visibility / 可见范围
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`py-2 px-1 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  visibility === 'public'
                    ? 'bg-neon text-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-paper text-ink/70 hover:bg-white'
                }`}
              >
                <Globe size={14} />
                <span>全员公开</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('friends')}
                className={`py-2 px-1 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  visibility === 'friends'
                    ? 'bg-sky-300 text-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-paper text-ink/70 hover:bg-white'
                }`}
              >
                <Users size={14} />
                <span>好友小队</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`py-2 px-1 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  visibility === 'private'
                    ? 'bg-ink text-white shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]'
                    : 'bg-paper text-ink/70 hover:bg-white'
                }`}
              >
                <Lock size={14} />
                <span>仅自己</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white text-ink border-2 border-ink py-3 font-black uppercase text-xs hover:bg-paper cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-2 py-3 font-black uppercase text-sm border-2 border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-2 transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer ${
                isSubmitting ? 'bg-paper text-ink opacity-50' : 'bg-ink text-neon'
              }`}
            >
              <Save size={16} />
              {isSubmitting ? '保存中...' : '保存修改'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
