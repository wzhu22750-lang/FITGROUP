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

import { motion, AnimatePresence } from 'motion/react';
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

  // Toggle category in multi-select (clean UI, no extra clutter)
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
    showToast(`已导入上次 ${imported.length} 个训练动作！`);
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
          showToast(`「${ex.name}」请填写有效的组数和次数（需大于 0）`);
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

    const sanitizedExercises: Exercise[] = exercises.map((ex) => {
      const isStrength = ex.type === 'strength';
      const cleanId = String(ex.id || Math.random().toString(36).slice(2, 11)).slice(0, 64);
      const cleanName = ex.name.trim().slice(0, 80) || (isStrength ? '力量训练' : '有氧运动');

      if (isStrength) {
        const weightVal = Math.max(-500, Math.min(2000, Number.isFinite(Number(ex.weight)) ? Number(ex.weight) : 0));
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
          caloriesSource: ex.caloriesSource ?? (caloriesVal > 0 ? 'reported' : undefined),
        };
      }
    });

    const finalCategories = inferLogCategories('', selectedCategories, sanitizedExercises);

    setIsSubmitting(true);
    try {
      await createWorkoutLog({
        id: mutationIdRef.current,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || '',
        category: finalCategories.join(', '),
        categories: finalCategories,
        exercises: sanitizedExercises,
        note,
        visibility,
        likesCount: 0,
        commentsCount: 0,
      });


      const userProfile = await getUserProfile(user.uid).catch(() => null);
      if (userProfile) {
        const currentPrs = userProfile.prs || {};
        let prBroken = false;
        sanitizedExercises.forEach((ex) => {
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
      showToast((error as Error)?.message || '保存失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const bannerKey = selectedCategories.sort().join('_');
  const availableLastLogsList = selectedCategories
    .map((c) => ({ category: c, log: lastLogs[c] }))
    .filter(({ log }) => Boolean(log && log.exercises && log.exercises.length > 0));

  const hasAnyLastLog = availableLastLogsList.length > 0;
  const currentPresets = PRESET_EXERCISES_BY_CATEGORY[activePresetCategory] || [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {toastMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed right-4 z-50 bg-ink text-neon border-4 border-ink px-6 py-3 font-black uppercase text-sm shadow-[4px_4px_0px_0px_rgba(223,255,0,0.5)]"
          style={{ top: 'calc(var(--safe-top) + 1rem)' }}
        >
          {toastMsg}
        </motion.div>
      )}

      {/* Target Muscle / Category Selector (Multi-Selectable) */}
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">
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
                className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  isSelected
                    ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]'
                    : 'bg-white text-ink hover:bg-neon'
                }`}
              >
                <span className="text-xs tracking-tight">{meta.en}</span>
                <span className="text-[10px] opacity-80">{meta.zh}</span>
              </button>
            );
          })}
        </div>
      </div>


      {/* Preset / Common Exercises Quick Selection with Category Tabs (Collapsible) */}
      <div className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
        <div
          onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
          className="p-5 flex items-center justify-between cursor-pointer select-none hover:bg-paper/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="bg-ink p-1">
              <Dumbbell size={14} className="text-neon" />
            </div>
            <label className="text-xs font-black text-ink uppercase tracking-widest cursor-pointer">
              常用动作快捷添加
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-ink/40">
              {isPresetsExpanded ? '点击折叠' : '点击展开'}
            </span>
            <div className="p-0.5 border border-ink bg-paper">
              {isPresetsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isPresetsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden px-5 pb-5 border-t-2 border-ink/10 pt-3"
            >
              {/* 部位选择组件 */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 border-b-2 border-ink/10">
                {Object.values(WorkoutCategory).map((cat) => {
                  const isTabActive = activePresetCategory === cat;
                  const isSelected = selectedCategories.includes(cat);
                  const meta = CATEGORY_META[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActivePresetCategory(cat)}
                      className={`px-2.5 py-1 border-2 border-ink text-xs font-black uppercase transition-all shrink-0 cursor-pointer ${
                        isTabActive
                          ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]'
                          : isSelected
                            ? 'bg-neon/30 text-ink hover:bg-neon'
                            : 'bg-paper text-ink hover:bg-neon'
                      }`}
                    >
                      {meta?.zh || cat}
                    </button>
                  );
                })}
              </div>

              {/* 对应部位常用动作列表 */}
              <div className="flex flex-wrap gap-2">
                {currentPresets.map((preset) => {
                  const isAlreadyAdded = exercises.some((e) => e.name.trim() === preset.name);
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleAddPresetExercise(preset)}
                      className={`py-1.5 px-2.5 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 ${
                        isAlreadyAdded
                          ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]'
                          : 'bg-paper text-ink hover:bg-neon hover:border-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none'
                      }`}
                      title={`点击添加: ${preset.name}`}
                    >
                      {isAlreadyAdded ? <Check size={13} className="stroke-[3]" /> : <Plus size={13} />}
                      <span>{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Exercise List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <label className="block text-sm font-black text-ink uppercase tracking-widest underline decoration-4 decoration-neon underline-offset-4">
            Exercises / 训练内容
          </label>

          {hasAnyLastLog && (
            <button
              type="button"
              onClick={() => handleImportData()}
              className={`text-[10px] font-black uppercase px-2.5 py-1 border-2 border-ink transition-all cursor-pointer flex items-center gap-1.5 ${
                confirmReimport
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-paper text-ink hover:bg-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
              }`}
            >
              {confirmReimport ? (
                <>
                  <RotateCcw size={12} />
                  <span>点击确认覆盖现有内容</span>
                </>
              ) : (
                <>
                  <History size={12} />
                  <span>导入上次数据</span>
                </>
              )}
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {exercises.map((ex, index) => (
            <motion.div
              key={ex.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className={`bg-white p-5 border-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative ${
                deleteConfirm === ex.id ? 'border-red-500 bg-red-50' : 'border-ink'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase bg-ink text-white px-2 py-0.5 italic">
                  #{index + 1} {ex.type === 'strength' ? '力量训练' : '有氧运动'}
                </span>

                <div className="flex items-center gap-2">
                  {deleteConfirm === ex.id && (
                    <span className="text-[10px] font-black text-red-600 uppercase">
                      点击确认删除
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveExercise(ex.id)}
                    className={`p-1 border-2 border-ink transition-colors cursor-pointer ${
                      deleteConfirm === ex.id
                        ? 'bg-red-400 text-white'
                        : 'bg-paper text-ink hover:bg-red-400 hover:text-white'
                    }`}
                    title="删除该项目"
                  >
                    {deleteConfirm === ex.id ? <Check size={14} /> : <X size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`p-2 border-2 border-ink cursor-pointer select-none ${
                    ex.type === 'strength' ? 'bg-neon' : 'bg-white'
                  }`}
                  onClick={() => handleToggleType(ex.id)}
                  title="点击切换力量/有氧类型"
                >
                  {ex.type === 'strength' ? (
                    <Dumbbell size={18} className="text-ink" />
                  ) : (
                    <Timer size={18} className="text-ink" />
                  )}
                </div>
                <input
                  type="text"
                  placeholder={
                    ex.type === 'strength'
                      ? '动作名称 (如 杠铃卧推)'
                      : '项目名称 (如 羽毛球、跑步机跑步)'
                  }
                  value={ex.name}
                  onChange={(e) => handleNameChange(ex.id, e.target.value)}
                  className="flex-1 font-black text-ink border-b-4 border-ink focus:border-neon outline-none placeholder:opacity-30 uppercase placeholder:italic text-base"
                  required
                />
              </div>

              {ex.type === 'strength' ? (
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1 gap-1">
                      <label className="text-[10px] font-black text-ink uppercase whitespace-nowrap">
                        KG (重量)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const currentWeight = typeof ex.weight === 'number' ? ex.weight : (parseFloat(String(ex.weight)) || 0);
                          updateExercise(ex.id, { weight: currentWeight === 0 ? -10 : -currentWeight });
                        }}
                        className={`text-[9px] font-black px-1 py-0.2 border border-ink transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          typeof ex.weight === 'number' && ex.weight < 0
                            ? 'bg-ink text-neon shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                            : 'bg-paper text-ink/70 hover:bg-neon'
                        }`}
                        title="切换辅助负重 (如引体向上/双杠减重)"
                      >
                        {typeof ex.weight === 'number' && ex.weight < 0 ? '辅助 (-)' : '负重 (+)'}
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
                    <label className="text-[10px] font-black text-ink uppercase block mb-1 whitespace-nowrap">
                      Sets (组数)
                    </label>
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
                    <label className="text-[10px] font-black text-ink uppercase block mb-1 whitespace-nowrap">
                      Reps (次数)
                    </label>
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
                <div>
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="text-[10px] font-black text-ink uppercase block mb-1 whitespace-nowrap">
                        Min (分钟)
                      </label>
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
                      <label className="text-[10px] font-black text-ink uppercase block mb-1 whitespace-nowrap truncate" title={isCardioDistanceOptional(ex.name) ? 'Km (选填)' : 'Km (公里)'}>
                        Km ({isCardioDistanceOptional(ex.name) ? '选填' : '公里'})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={ex.distance || ''}
                        onChange={(e) =>
                          updateExercise(ex.id, { distance: Number(e.target.value) || 0 })
                        }
                        placeholder={isCardioDistanceOptional(ex.name) ? '无' : '0'}
                        className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1 gap-1">
                        <label className="text-[10px] font-black text-ink uppercase whitespace-nowrap">
                          Kcal (大卡)
                        </label>
                        <span className="text-[8px] font-black bg-neon text-ink px-1 border border-ink/40 whitespace-nowrap shrink-0" title="按时长和运动类型自动估算">
                          自动
                        </span>
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
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => addExercise('strength')}
            className="flex-1 bg-white border-4 border-ink text-ink py-3 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus size={18} /> 自定义力量
          </button>
          <button
            type="button"
            onClick={() => addExercise('cardio')}
            className="flex-1 bg-white border-4 border-ink text-ink py-3 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus size={18} /> 自定义有氧
          </button>
        </div>
      </div>

      {/* Notes / Feelings */}
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">
          Notes / 训练心得
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="今天状态如何？泵感怎样？记录下来吧..."
          className="w-full bg-paper border-4 border-ink p-4 font-black text-ink min-h-[100px] outline-none focus:bg-white transition-all uppercase placeholder:opacity-30 text-sm"
        />
      </div>

      {/* Visibility / 可见范围 */}
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-3">
          Visibility / 可见范围
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setVisibility('public')}
            className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
              visibility === 'public'
                ? 'bg-neon text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-paper text-ink/70 hover:bg-white'
            }`}
          >
            <Globe size={16} />
            <span>全员公开</span>
            <span className="text-[9px] opacity-75 font-normal">广场可见</span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility('friends')}
            className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
              visibility === 'friends'
                ? 'bg-sky-300 text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-paper text-ink/70 hover:bg-white'
            }`}
          >
            <Users size={16} />
            <span>好友小队</span>
            <span className="text-[9px] opacity-75 font-normal">小队可见</span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility('private')}
            className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
              visibility === 'private'
                ? 'bg-ink text-white shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]'
                : 'bg-paper text-ink/70 hover:bg-white'
            }`}
          >
            <Lock size={16} />
            <span>仅自己</span>
            <span className="text-[9px] opacity-75 font-normal">个人历史</span>
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full py-5 font-black uppercase text-xl border-4 border-ink shadow-[6px_6px_0px_0px_rgba(223,255,0,1)] flex items-center justify-center gap-4 transition-all active:translate-x-1 active:translate-y-1 active:shadow-none cursor-pointer ${
          isSubmitting ? 'bg-paper text-ink opacity-50' : 'bg-ink text-white'
        }`}
      >
        {isSubmitting ? (
          'Saving...'
        ) : (
          <>
            <Send size={24} /> 发布打卡
          </>
        )}
      </button>

    </form>
  );
}
