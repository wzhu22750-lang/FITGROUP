import { useState, useEffect, useRef, FormEvent } from 'react';
import {
  createWorkoutLog,
  getCurrentUser,
  getUserProfile,
  getLastWorkoutsByCategories,
} from '../firebase';
import { WorkoutCategory, Exercise, WorkoutLog } from '../types';
import {
  PRESET_EXERCISES_BY_CATEGORY,
  PresetExercise,
} from '../constants/workoutPresets';
import {
  Plus,
  Trash2,
  Send,
  X,
  Dumbbell,
  Timer,
  Check,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

interface WorkoutLoggerProps {
  onSuccess: () => void;
}

export default function WorkoutLogger({ onSuccess }: WorkoutLoggerProps) {
  const [selectedCategories, setSelectedCategories] = useState<WorkoutCategory[]>([
    WorkoutCategory.Chest,
  ]);
  const [activePresetTab, setActivePresetTab] = useState<WorkoutCategory>(WorkoutCategory.Chest);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const mutationIdRef = useRef<string>(
    Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
  );

  const [lastLogs, setLastLogs] = useState<Record<string, WorkoutLog>>({});
  const [dismissedBannerKeys, setDismissedBannerKeys] = useState<string[]>([]);
  const [confirmReimport, setConfirmReimport] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const handleToggleCategory = (cat: WorkoutCategory) => {
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length === 1) {
        showToast('请至少选择一个训练部位');
        return;
      }
      const next = selectedCategories.filter((c) => c !== cat);
      setSelectedCategories(next);
      if (activePresetTab === cat) {
        setActivePresetTab(next[0]);
      }
    } else {
      const next = [...selectedCategories, cat];
      setSelectedCategories(next);
      setActivePresetTab(cat);
    }
  };

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

  useEffect(() => {
    if (!selectedCategories.includes(activePresetTab)) {
      setActivePresetTab(selectedCategories[0] || WorkoutCategory.Chest);
    }
  }, [selectedCategories, activePresetTab]);

  const addExercise = (type: 'strength' | 'cardio') => {
    if (exercises.length >= 10) {
      showToast('每次打卡最多添加 10 个动作');
      return;
    }
    setExercises([
      ...exercises,
      {
        id: Math.random().toString(36).slice(2, 11),
        name: '',
        type,
        ...(type === 'strength'
          ? { weight: 0, sets: 0, reps: 0 }
          : { duration: 0, distance: 0, calories: 0 }),
      },
    ]);
  };

  const handleAddPresetExercise = (preset: PresetExercise) => {
    if (exercises.length >= 10) {
      showToast('每次打卡最多添加 10 个动作');
      return;
    }

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
            duration: preset.defaultDuration ?? 30,
            distance: preset.defaultDistance ?? 0,
            calories: preset.defaultCalories ?? 0,
          }),
    };

    if (exercises.length === 1 && !exercises[0].name.trim()) {
      setExercises([newEx]);
    } else {
      setExercises([...exercises, newEx]);
    }

    showToast(`已添加「${preset.name}」`);
  };

  const handleImportCategoryData = (force = false) => {
    const all: Exercise[] = [];
    const seenNames = new Set<string>();

    selectedCategories.forEach((c) => {
      const log = lastLogs[c];
      if (log && log.exercises) {
        log.exercises.forEach((ex) => {
          if (!seenNames.has(ex.name.trim())) {
            seenNames.add(ex.name.trim());
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
    }));

    setExercises(imported);
    setConfirmReimport(false);

    const bannerKey = selectedCategories.sort().join('_');
    if (!dismissedBannerKeys.includes(bannerKey)) {
      setDismissedBannerKeys([...dismissedBannerKeys, bannerKey]);
    }

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

    setIsSubmitting(true);
    try {
      await createWorkoutLog({
        id: mutationIdRef.current,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || '',
        category: selectedCategories.join(', '),
        categories: selectedCategories,
        exercises,
        note,
        likesCount: 0,
        commentsCount: 0,
      });

      const userProfile = await getUserProfile(user.uid).catch(() => null);
      if (userProfile) {
        const currentPrs = userProfile.prs || {};
        let prBroken = false;
        exercises.forEach((ex) => {
          if (
            ex.type === 'strength' &&
            ex.weight &&
            (!currentPrs[ex.name] || ex.weight > currentPrs[ex.name])
          ) {
            prBroken = true;
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
  const showPromptBanner = hasAnyLastLog && !dismissedBannerKeys.includes(bannerKey);
  const currentTabPresets = PRESET_EXERCISES_BY_CATEGORY[activePresetTab] || [];

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

      {/* Target Muscle Selection (Supports Multi-Selection with clean UI) */}
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">
          Target Muscle / 训练部位
        </label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(WorkoutCategory).map((cat) => {
            const isSelected = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleToggleCategory(cat)}
                className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer ${
                  isSelected ? 'bg-ink text-neon' : 'bg-white text-ink hover:bg-neon'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Smart Import Banner for History Data */}
      <AnimatePresence>
        {showPromptBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            className="bg-neon border-4 border-ink p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-black text-xs text-ink uppercase tracking-tight truncate">
                发现上次训练记录 ({availableLastLogsList.map((item) => item.category).join(' + ')})
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleImportCategoryData(true)}
                className="bg-ink text-neon border-2 border-ink px-3 py-1.5 text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                导入上次数据
              </button>
              <button
                type="button"
                onClick={() => setDismissedBannerKeys([...dismissedBannerKeys, bannerKey])}
                className="p-1 border-2 border-ink bg-white text-ink hover:bg-paper cursor-pointer"
                title="关闭提示"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preset Exercises Section */}
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-black text-ink uppercase tracking-widest">
            Quick Add / 常用动作
          </label>
          {selectedCategories.length > 1 && (
            <div className="flex gap-1">
              {selectedCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActivePresetTab(cat)}
                  className={`px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase cursor-pointer transition-all ${
                    activePresetTab === cat ? 'bg-ink text-neon' : 'bg-paper text-ink hover:bg-neon'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {currentTabPresets.map((preset) => {
            const isAdded = exercises.some((e) => e.name.trim() === preset.name);
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleAddPresetExercise(preset)}
                className={`py-2 px-3 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                  isAdded ? 'bg-ink text-neon' : 'bg-white text-ink hover:bg-neon'
                }`}
              >
                <Plus size={12} />
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
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
              onClick={() => handleImportCategoryData()}
              className={`text-[10px] font-black uppercase px-2.5 py-1 border-2 border-ink transition-all cursor-pointer flex items-center gap-1.5 ${
                confirmReimport
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-paper text-ink hover:bg-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
              }`}
            >
              {confirmReimport ? <RotateCcw size={12} /> : null}
              <span>{confirmReimport ? '确认覆盖' : '导入上次数据'}</span>
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {exercises.map((ex) => (
            <motion.div
              key={ex.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className={`bg-white p-5 border-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative ${
                deleteConfirm === ex.id ? 'border-red-500 bg-red-50' : 'border-ink'
              }`}
            >
              <button
                type="button"
                onClick={() => handleRemoveExercise(ex.id)}
                className={`absolute top-2 right-2 p-1 border-2 border-ink transition-colors cursor-pointer ${
                  deleteConfirm === ex.id
                    ? 'bg-red-400 text-white'
                    : 'bg-paper text-ink hover:bg-red-400 hover:text-white'
                }`}
              >
                {deleteConfirm === ex.id ? <Check size={16} /> : <X size={16} />}
              </button>

              {deleteConfirm === ex.id && (
                <span className="absolute top-2 right-10 text-[10px] font-black text-red-600 uppercase">
                  点击确认删除
                </span>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`p-2 border-2 border-ink cursor-pointer select-none ${
                    ex.type === 'strength' ? 'bg-neon' : 'bg-white'
                  }`}
                  onClick={() =>
                    updateExercise(ex.id, {
                      type: ex.type === 'strength' ? 'cardio' : 'strength',
                    })
                  }
                  title="点击切换 力量 / 有氧"
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
                      ? '动作 (e.g. Bench Press)'
                      : '项目 (e.g. Running)'
                  }
                  value={ex.name}
                  onChange={(e) => updateExercise(ex.id, { name: e.target.value })}
                  className="flex-1 font-black text-ink border-b-4 border-ink focus:border-neon outline-none placeholder:opacity-30 uppercase placeholder:italic"
                  required
                />
              </div>

              {ex.type === 'strength' ? (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">
                      KG
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={ex.weight || ''}
                      onChange={(e) =>
                        updateExercise(ex.id, { weight: Number(e.target.value) || 0 })
                      }
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">
                      Sets
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={ex.sets || ''}
                      onChange={(e) =>
                        updateExercise(ex.id, { sets: Number(e.target.value) || 0 })
                      }
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">
                      Reps
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={ex.reps || ''}
                      onChange={(e) =>
                        updateExercise(ex.id, { reps: Number(e.target.value) || 0 })
                      }
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">
                      Min
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ex.duration || ''}
                      onChange={(e) =>
                        updateExercise(ex.id, { duration: Number(e.target.value) || 0 })
                      }
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">
                      Km
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={ex.distance || ''}
                      onChange={(e) =>
                        updateExercise(ex.id, { distance: Number(e.target.value) || 0 })
                      }
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">
                      Kcal
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={ex.calories || ''}
                      onChange={(e) =>
                        updateExercise(ex.id, { calories: Number(e.target.value) || 0 })
                      }
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
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
            <Plus size={18} /> Strength
          </button>
          <button
            type="button"
            onClick={() => addExercise('cardio')}
            className="flex-1 bg-white border-4 border-ink text-ink py-3 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus size={18} /> Cardio
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">
          Notes
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="HOW DID IT FEEL?"
          className="w-full bg-paper border-4 border-ink p-4 font-black text-ink min-h-[100px] outline-none focus:bg-white transition-all uppercase placeholder:opacity-30"
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full py-5 font-black uppercase text-xl border-4 border-ink shadow-[6px_6px_0px_0px_rgba(223,255,0,1)] flex items-center justify-center gap-4 transition-all active:translate-x-1 active:translate-y-1 active:shadow-none cursor-pointer ${
          isSubmitting ? 'bg-paper text-ink opacity-50' : 'bg-ink text-white'
        }`}
      >
        {isSubmitting ? 'Saving...' : (<><Send size={24} /> Post to Feed</>)}
      </button>
    </form>
  );
}
