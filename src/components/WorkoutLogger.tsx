import { useState, useEffect, useRef, FormEvent } from 'react';
import {
  createWorkoutLog,
  getCurrentUser,
  getUserProfile,
  getLastWorkoutsByCategories,
} from '../api';
import { WorkoutCategory, Exercise, WorkoutLog, WorkoutVisibility } from '../types';
import {
  CATEGORY_META,
  PRESET_EXERCISES_BY_CATEGORY,
  PresetExercise,
  CARDIO_REFERENCE_BODYWEIGHT_KG,
  estimateCardioCalories,
  isCardioDistanceOptional,
  inferLogCategories,
} from '../constants/workoutPresets';
import { resolveEffectiveExerciseWeight } from '../utils/workoutAnalytics';
import { formatWorkoutLogError } from '../utils/workoutLogUpdate';
import {
  Plus,
  Trash2,
  Send,
  X,
  Dumbbell,
  Timer,
  Check,
  History,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Globe,
  Users,
  Lock,
} from 'lucide-react';

import { AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

interface WorkoutLoggerProps {
  onSuccess: () => void;
}


export default function WorkoutLogger({ onSuccess }: WorkoutLoggerProps) {
  // Multi-category selection
  const [selectedCategories, setSelectedCategories] = useState<WorkoutCategory[]>([
    WorkoutCategory.Chest,
  ]);
  // Active category tab for preset exercise selection
  const [activePresetCategory, setActivePresetCategory] = useState<WorkoutCategory>(
    WorkoutCategory.Chest
  );
  // Collapsible state for preset exercises section (default collapsed)
  const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<WorkoutVisibility>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [userWeight, setUserWeight] = useState<number>(CARDIO_REFERENCE_BODYWEIGHT_KG);
  const mutationIdRef = useRef<string>(
    Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
  );


  // History logs for selected categories
  const [lastLogs, setLastLogs] = useState<Record<string, WorkoutLog>>({});
  const [confirmReimport, setConfirmReimport] = useState(false);


  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  // Toggle category in multi-select
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

  // Load user bodyweight for accurate calorie estimations
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

  // Query last workouts for selected categories
  useEffect(() => {
    const user = getCurrentUser();
    if (!user || selectedCategories.length === 0) return;

    let isMounted = true;
    getLastWorkoutsByCategories(user.uid, selectedCategories)
      .then((logsMap) => {
        if (!isMounted) return;
        setLastLogs(logsMap as Record<string, WorkoutLog>);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [selectedCategories]);

  const addExercise = (type: 'strength' | 'cardio') => {
    if (exercises.length >= 10) {
      showToast('每次打卡最多添加 10 个动作');
      return;
    }
    const defaultDuration = 30;
    const defaultCal = type === 'cardio' ? estimateCardioCalories('', defaultDuration, userWeight) : 0;
    setExercises([
      ...exercises,
      {
        id: Math.random().toString(36).slice(2, 11),
        name: '',
        type,
        ...(type === 'strength'
          ? { weight: 0, sets: 0, reps: 0 }
          : { duration: defaultDuration, distance: 0, calories: defaultCal, caloriesSource: 'estimated' }),
      },
    ]);
  };

  const handleAddPresetExercise = (preset: PresetExercise) => {
    if (exercises.length >= 10) {
      showToast('每次打卡最多添加 10 个动作');
      return;
    }

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
            caloriesSource: 'estimated',
          }),
    };

    if (exercises.length === 1 && !exercises[0].name.trim()) {
      setExercises([newEx]);
    } else {
      setExercises([...exercises, newEx]);
    }

    // Auto-detect and sync category if newly added preset stimulates extra groups
    const newlyInferred = inferLogCategories('', selectedCategories, [newEx]);
    if (newlyInferred.length > selectedCategories.length) {
      setSelectedCategories(newlyInferred);
    }

    showToast(`已添加「${preset.name}」`);
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
        caloriesSource: 'estimated',
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
      updateExercise(id, { name, calories: newCalories, caloriesSource: 'estimated' });
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
    updateExercise(id, { duration: durationNum, calories: newCalories, caloriesSource: 'estimated' });
  };

  const handleImportData = (force = false) => {
    const all: Exercise[] = [];
    const seen = new Set<string>();

    selectedCategories.forEach((c) => {
      const log = lastLogs[c];
      if (log && log.exercises) {
        log.exercises.forEach((ex) => {
          if (!seen.has(ex.name.trim())) {
            seen.add(ex.name.trim());
            all.push(ex);
          }
        });
      }
    });

    if (all.length === 0) {
      showToast('未找到历史训练数据');
      return;
    }

    if (!force && exercises.length > 0 && exercises.some((e) => e.name.trim())) {
      if (!confirmReimport) {
        setConfirmReimport(true);
        setTimeout(() => setConfirmReimport(false), 3500);
        return;
      }
    }

    const imported: Exercise[] = all.slice(0, 10).map((ex) => ({
      id: Math.random().toString(36).slice(2, 11),
      name: ex.name,
      type: ex.type || 'strength',
      weight: ex.weight ?? 0,
      sets: ex.sets ?? 0,
      reps: ex.reps ?? 0,
      duration: ex.duration ?? 0,
      distance: ex.distance ?? 0,
      calories: ex.calories ?? 0,
      caloriesSource: ex.caloriesSource,
    }));

    setExercises(imported);
    setConfirmReimport(false);
    showToast(`已导入上次 ${imported.length} 个动作`);
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

    const user = getCurrentUser();
    if (!user) {
      showToast('请先登录');
      return;
    }

    if (selectedCategories.length === 0) {
      showToast('请至少选择一个训练部位');
      return;
    }

    if (exercises.length === 0) {
      showToast('请至少添加一个训练项目');
      return;
    }

    if (exercises.length > 10) {
      showToast('每次打卡最多支持 10 个项目');
      return;
    }

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.name.trim()) {
        showToast(`请填写第 ${i + 1} 个项目的动作名称`);
        return;
      }
      if (ex.type === 'strength') {
        if (!ex.sets || ex.sets <= 0 || !ex.reps || ex.reps <= 0) {
          showToast(`「${ex.name}」请填写有效的组数和次数`);
          return;
        }
      } else if (ex.type === 'cardio') {
        if (
          (!ex.duration || ex.duration <= 0) &&
          (!ex.distance || ex.distance <= 0) &&
          (!ex.calories || ex.calories <= 0)
        ) {
          showToast(`「${ex.name}」请至少填写时长、距离或卡路里之一`);
          return;
        }
      }
    }


    const finalCategories = inferLogCategories('', selectedCategories, exercises);

    setIsSubmitting(true);
    try {
      await createWorkoutLog({
        id: mutationIdRef.current,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || '',
        category: finalCategories.join(', '),
        categories: finalCategories,
        exercises,
        note,
        visibility,
        likesCount: 0,
        commentsCount: 0,
      });


      const userProfile = await getUserProfile(user.uid).catch(() => null);
      if (userProfile) {
        const currentPrs = userProfile.prs || {};
        let prBroken = false;
        exercises.forEach((ex) => {
          if (ex.type === 'strength' && typeof ex.weight === 'number') {
            const effectiveW = resolveEffectiveExerciseWeight(ex.name, ex.weight, userWeight);
            if (currentPrs[ex.name] === undefined || effectiveW > currentPrs[ex.name]) {
              prBroken = true;
            }
          }
        });

        if (prBroken) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#DFFF00', '#000000', '#F4F4F4'],
          });
        }
      }

      mutationIdRef.current = Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      onSuccess();
    } catch (error) {
      console.error('保存失败:', error);
      showToast(formatWorkoutLogError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableLastLogsList = selectedCategories
    .map((c) => ({ category: c, log: lastLogs[c] }))
    .filter(({ log }) => Boolean(log && log.exercises && log.exercises.length > 0));

  const hasAnyLastLog = availableLastLogsList.length > 0;
  const currentPresets = PRESET_EXERCISES_BY_CATEGORY[activePresetCategory] || [];

  // Visibility label for status bar
  const visLabel = visibility === 'public' ? '公开' : visibility === 'friends' ? '小队可见' : '仅自己';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {toastMsg && (
        <div
          className="fixed left-4 right-4 z-50 bg-ink text-white px-4 py-3 text-sm font-medium shadow-lg"
          style={{ top: 'calc(var(--safe-top) + 0.75rem)', borderRadius: 'var(--radius-md)', maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto' }}
        >
          {toastMsg}
        </div>
      )}

      {/* ── Page title ── */}
      <h1 className="text-2xl font-black text-ink uppercase tracking-tight">记录训练</h1>

      {/* ── Import from last workout ── */}
      {hasAnyLastLog && (
        <button
          type="button"
          onClick={() => handleImportData()}
          className={`w-full text-xs font-black uppercase py-2.5 px-4 flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
            confirmReimport
              ? 'bg-red-500 text-white border-red-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-paper text-ink border-ink hover:bg-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
          }`}
        >
          {confirmReimport ? (
            <><RotateCcw size={14} /> 将覆盖现有内容，点击确认</>
          ) : (
            <><History size={14} /> 沿用上次训练数据</>
          )}
        </button>
      )}

      {/* ── Category selector ── */}
      <div className="card p-4 sm:p-5">
        <label className="block text-xs font-black text-ink uppercase tracking-wider mb-2.5">
          Target Muscle / 训练部位
        </label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(WorkoutCategory).map((cat) => {
            const meta = CATEGORY_META[cat];
            const isSelected = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleToggleCategory(cat)}
                className={`py-2.5 px-1 border-2 border-ink text-xs transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  isSelected
                    ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(223,255,0,1)] font-black'
                    : 'bg-white text-ink hover:bg-neon font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                }`}
              >
                <span className="text-xs font-black uppercase tracking-tight">{meta.zh}</span>
                <span className="text-[10px] opacity-70 font-semibold">{meta.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Exercise list (page body) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <label className="text-sm font-black text-ink uppercase tracking-tight">
            Exercises / 训练内容
          </label>
          <span className="text-xs font-black text-ink/70 bg-paper px-2 py-0.5 border-2 border-ink shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
            {exercises.length}/10
          </span>
        </div>

        {exercises.map((ex, index) => (
          <div
            key={ex.id}
            className={`card p-4 sm:p-5 relative ${
              deleteConfirm === ex.id ? 'border-red-500 bg-red-50/50' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase bg-ink text-white px-2 py-0.5 italic">
                #{index + 1} {ex.type === 'strength' ? '力量训练' : '有氧运动'}
              </span>
              <div className="flex items-center gap-1.5">
                {deleteConfirm === ex.id && (
                  <span className="text-[10px] font-black text-red-600 uppercase">确认删除？</span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveExercise(ex.id)}
                  className={`p-1.5 border-2 border-ink transition-colors cursor-pointer ${
                    deleteConfirm === ex.id
                      ? 'bg-red-500 text-white'
                      : 'bg-paper text-ink hover:bg-red-500 hover:text-white'
                  }`}
                  title="删除"
                  style={{ minWidth: 32, minHeight: 32 }}
                >
                  {deleteConfirm === ex.id ? <Check size={14} /> : <X size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5 mb-3.5">
              <button
                type="button"
                className={`p-2 border-2 border-ink cursor-pointer select-none transition-all ${
                  ex.type === 'strength'
                    ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                }`}
                onClick={() => handleToggleType(ex.id)}
                title="切换力量/有氧"
                style={{ minWidth: 40, minHeight: 40 }}
              >
                {ex.type === 'strength' ? <Dumbbell size={18} /> : <Timer size={18} />}
              </button>
              <input
                type="text"
                placeholder={ex.type === 'strength' ? '动作名称（如 杠铃卧推）' : '项目名称（如 跑步机跑步）'}
                value={ex.name}
                onChange={(e) => handleNameChange(ex.id, e.target.value)}
                className="flex-1 text-base font-black text-ink border-b-2 border-ink focus:border-neon outline-none py-1.5 bg-transparent placeholder:text-ink/30 uppercase"
                required
              />
            </div>

            {ex.type === 'strength' ? (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-ink uppercase">重量 (kg)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const currentWeight = typeof ex.weight === 'number' ? ex.weight : (parseFloat(String(ex.weight)) || 0);
                        updateExercise(ex.id, { weight: currentWeight === 0 ? -10 : -currentWeight });
                      }}
                      className={`text-[9px] font-black px-1 py-0.2 border border-ink transition-colors cursor-pointer ${
                        typeof ex.weight === 'number' && ex.weight < 0 ? 'bg-ink text-neon' : 'bg-paper text-ink/70 hover:bg-neon'
                      }`}
                      title="切换辅助负重"
                    >
                      {typeof ex.weight === 'number' && ex.weight < 0 ? '辅助' : '负重'}
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
                    className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-ink uppercase block mb-1">组数</label>
                  <input
                    type="number"
                    min="0"
                    value={ex.sets || ''}
                    onChange={(e) =>
                      updateExercise(ex.id, { sets: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-ink uppercase block mb-1">次数</label>
                  <input
                    type="number"
                    min="0"
                    value={ex.reps || ''}
                    onChange={(e) =>
                      updateExercise(ex.id, { reps: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div>
                  <label className="text-[10px] font-black text-ink uppercase block mb-1">分钟</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={ex.duration || ''}
                    onChange={(e) =>
                      handleCardioDurationChange(ex.id, Number(e.target.value) || 0)
                    }
                    placeholder="30"
                    className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-ink uppercase block mb-1 truncate">
                    公里 {isCardioDistanceOptional(ex.name) && <span className="opacity-50">(选填)</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={ex.distance || ''}
                    onChange={(e) =>
                      updateExercise(ex.id, { distance: Number(e.target.value) || 0 })
                    }
                    placeholder={isCardioDistanceOptional(ex.name) ? '—' : '0'}
                    className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-ink uppercase">大卡</label>
                    <span className="text-[8px] font-black bg-neon text-ink px-1 border border-ink/40" title="按时长自动估算">自动</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={ex.calories || ''}
                    onChange={(e) =>
                      updateExercise(ex.id, { calories: Number(e.target.value) || 0, caloriesSource: 'reported' })
                    }
                    placeholder="0"
                    className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add exercise buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addExercise('strength')}
            className="flex-1 btn-secondary py-3 text-xs font-black uppercase flex items-center justify-center gap-1.5"
          >
            <Plus size={16} /> 自定义力量
          </button>
          <button
            type="button"
            onClick={() => addExercise('cardio')}
            className="flex-1 btn-secondary py-3 text-xs font-black uppercase flex items-center justify-center gap-1.5"
          >
            <Plus size={16} /> 自定义有氧
          </button>
        </div>
      </div>

      {/* ── Preset exercises (collapsible) ── */}
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
          className="w-full p-4 flex items-center justify-between cursor-pointer hover:bg-paper transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="bg-ink p-1">
              <Dumbbell size={14} className="text-neon" />
            </div>
            <span className="text-xs font-black text-ink uppercase tracking-wider">常用动作快捷添加</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-ink/50">
              {isPresetsExpanded ? '点击折叠' : '点击展开'}
            </span>
            <div className="p-0.5 border-2 border-ink bg-paper">
              {isPresetsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>
        </button>

        {isPresetsExpanded && (
          <div className="px-4 pb-4 border-t-2 border-ink/10 pt-3 space-y-3">
            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1.5 border-b border-ink/10">
              {Object.values(WorkoutCategory).map((cat) => {
                const isTabActive = activePresetCategory === cat;
                const meta = CATEGORY_META[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActivePresetCategory(cat)}
                    className={`px-2.5 py-1 text-xs font-black uppercase shrink-0 border-2 border-ink cursor-pointer transition-all ${
                      isTabActive
                        ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]'
                        : 'bg-paper text-ink/70 hover:bg-neon'
                    }`}
                  >
                    {meta?.zh || cat}
                  </button>
                );
              })}
            </div>

            {/* Preset buttons */}
            <div className="flex flex-wrap gap-2">
              {currentPresets.map((preset) => {
                const isAlreadyAdded = exercises.some((e) => e.name.trim() === preset.name);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleAddPresetExercise(preset)}
                    className={`py-1.5 px-2.5 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 active:translate-x-[1px] active:translate-y-[1px] ${
                      isAlreadyAdded
                        ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]'
                        : 'bg-paper text-ink hover:bg-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none'
                    }`}
                    title={`添加: ${preset.name}`}
                  >
                    {isAlreadyAdded ? <Check size={13} className="stroke-[3]" /> : <Plus size={13} />}
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Note (optional) ── */}
      <div className="card p-4 sm:p-5">
        <label className="block text-xs font-black text-ink uppercase tracking-wider mb-2.5">
          Notes / 训练心得 <span className="font-normal opacity-60">(选填)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="今天状态如何？记录下来吧…"
          className="w-full bg-paper border-2 border-ink p-3 font-bold text-ink min-h-[90px] outline-none focus:bg-white text-sm"
        />
      </div>

      {/* ── Visibility ── */}
      <div className="card p-4 sm:p-5">
        <label className="block text-xs font-black text-ink uppercase tracking-wider mb-2.5">
          Visibility / 可见范围
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setVisibility('public')}
            className={`py-2.5 text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center gap-1 border-2 border-ink ${
              visibility === 'public'
                ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-paper text-ink/70 hover:bg-white'
            }`}
          >
            <Globe size={16} />
            <span>全员公开</span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility('friends')}
            className={`py-2.5 text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center gap-1 border-2 border-ink ${
              visibility === 'friends'
                ? 'bg-sky-200 text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-paper text-ink/70 hover:bg-white'
            }`}
          >
            <Users size={16} />
            <span>好友小队</span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility('private')}
            className={`py-2.5 text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center gap-1 border-2 border-ink ${
              visibility === 'private'
                ? 'bg-ink text-white shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]'
                : 'bg-paper text-ink/70 hover:bg-white'
            }`}
          >
            <Lock size={16} />
            <span>仅自己</span>
          </button>
        </div>
      </div>

      {/* ── Submit (A-Level CTA) ── */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full btn-neon-lg ${
          isSubmitting ? 'opacity-50' : ''
        }`}
      >
        {isSubmitting ? (
          '正在保存…'
        ) : (
          <><Send size={20} /> 发布打卡 · {visLabel}</>
        )}
      </button>
    </form>
  );
}
