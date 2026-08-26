import { useState, useEffect, useRef, FormEvent } from 'react';
import {
  createWorkoutLog,
  getCurrentUser,
  getUserProfile,
  getLastWorkoutsByCategories,
} from '../firebase';
import { WorkoutCategory, Exercise, WorkoutLog } from '../types';
import {
  CATEGORY_META,
  PRESET_EXERCISES_BY_CATEGORY,
  PresetExercise,
  formatCategoriesZh,
} from '../constants/workoutPresets';
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
  Sparkles,
  Zap,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { formatDistanceToNow, format } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';

interface WorkoutLoggerProps {
  onSuccess: () => void;
}

export default function WorkoutLogger({ onSuccess }: WorkoutLoggerProps) {
  // Multi-category selection
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

  // Last workout logs per category
  const [lastLogs, setLastLogs] = useState<Record<string, WorkoutLog>>({});
  const [loadingLastLogs, setLoadingLastLogs] = useState(false);
  const [dismissedBannerKeys, setDismissedBannerKeys] = useState<string[]>([]);
  const [confirmReimport, setConfirmReimport] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  // Toggle category in multi-select
  const handleToggleCategory = (cat: WorkoutCategory) => {
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length === 1) {
        showToast('请至少保留一个训练部位');
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
      setActivePresetTab(cat); // Automatically switch preset tab to newly selected category
      showToast(`已添加【${CATEGORY_META[cat].zh}】部位`);
    }
  };

  // Query last workouts whenever selected categories change
  useEffect(() => {
    const user = getCurrentUser();
    if (!user || selectedCategories.length === 0) return;

    let isMounted = true;
    setLoadingLastLogs(true);

    getLastWorkoutsByCategories(user.uid, selectedCategories)
      .then((logsMap) => {
        if (!isMounted) return;
        setLastLogs(logsMap as Record<string, WorkoutLog>);
      })
      .catch((err) => {
        console.warn('Failed to load last workouts for categories:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingLastLogs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCategories]);

  // Make sure activePresetTab is always within selectedCategories
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

    // If current exercise list has only 1 blank/unnamed item, replace it
    if (exercises.length === 1 && !exercises[0].name.trim()) {
      setExercises([newEx]);
    } else {
      setExercises([...exercises, newEx]);
    }

    showToast(`已添加「${preset.name}」`);
  };

  // Import last workout for a single category or merge all selected categories
  const handleImportCategoryData = (cat?: WorkoutCategory, force = false) => {
    let sourceExercises: Exercise[] = [];

    if (cat) {
      const log = lastLogs[cat];
      if (!log || !log.exercises || log.exercises.length === 0) {
        showToast(`未找到上次【${CATEGORY_META[cat].zh}】训练数据`);
        return;
      }
      sourceExercises = log.exercises;
    } else {
      // Merge all available logs from selected categories
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
        showToast('未找到所选部位的历史训练数据');
        return;
      }
      sourceExercises = all.slice(0, 10);
    }

    if (!force && exercises.length > 0 && exercises.some((e) => e.name.trim())) {
      if (!confirmReimport) {
        setConfirmReimport(true);
        setTimeout(() => setConfirmReimport(false), 3500);
        return;
      }
    }

    const imported: Exercise[] = sourceExercises.map((ex) => ({
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

    // Dismiss banner
    const bannerKey = selectedCategories.sort().join('_');
    if (!dismissedBannerKeys.includes(bannerKey)) {
      setDismissedBannerKeys([...dismissedBannerKeys, bannerKey]);
    }

    showToast(
      cat
        ? `已导入上次「${CATEGORY_META[cat].zh}」的 ${imported.length} 个动作！`
        : `已合并导入 ${imported.length} 个历史训练动作！`
    );
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

    // Comprehensive validation for every exercise item
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

  const formatLogDate = (timestampStr: string) => {
    try {
      const date = new Date(timestampStr);
      return `${format(date, 'M月d日')} (${formatDistanceToNow(date, { addSuffix: true, locale: zhCN })})`;
    } catch {
      return '上次记录';
    }
  };

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

      {/* Target Muscle Selection (Supports Multi-Selection) */}
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-black text-ink uppercase tracking-widest flex items-center gap-1.5">
            <span>Target Muscles / 训练部位</span>
            <span className="text-[10px] bg-neon text-ink px-1.5 py-0.5 border border-ink font-black">
              支持多选
            </span>
          </label>
          <span className="text-[10px] font-black text-ink/50 uppercase">
            已选 {selectedCategories.length} 个部位
          </span>
        </div>

        {/* Selected Category Tags summary */}
        <div className="mb-3 text-xs font-black text-ink flex items-center gap-1.5 flex-wrap">
          <span className="text-ink/40 text-[10px] uppercase">当前训练:</span>
          {selectedCategories.map((c) => (
            <span
              key={c}
              className="bg-ink text-neon px-2 py-0.5 border border-ink text-xs uppercase shadow-[1px_1px_0px_0px_rgba(223,255,0,1)]"
            >
              {CATEGORY_META[c].zh} ({CATEGORY_META[c].en})
            </span>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {Object.values(WorkoutCategory).map((cat) => {
            const meta = CATEGORY_META[cat];
            const isSelected = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleToggleCategory(cat)}
                className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 relative ${
                  isSelected
                    ? 'bg-ink text-neon shadow-[3px_3px_0px_0px_rgba(223,255,0,1)] -translate-x-0.5 -translate-y-0.5'
                    : 'bg-white text-ink hover:bg-neon'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1 right-1 bg-neon text-ink rounded-full p-0.5">
                    <Check size={10} className="stroke-[4]" />
                  </div>
                )}
                <span className="text-xs tracking-tight">{meta.en}</span>
                <span className="text-[10px] opacity-80">{meta.zh}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Smart Import Banner for Multi-Category History */}
      <AnimatePresence>
        {showPromptBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            className="bg-neon border-4 border-ink p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative"
          >
            <button
              type="button"
              onClick={() => setDismissedBannerKeys([...dismissedBannerKeys, bannerKey])}
              className="absolute top-2 right-2 p-1 text-ink/60 hover:text-ink hover:bg-black/10 transition-colors cursor-pointer"
              title="暂不导入"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3 mb-3 pr-6">
              <div className="bg-ink text-neon p-2 border-2 border-ink shrink-0 mt-0.5">
                <Sparkles size={18} />
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <h4 className="font-black text-ink text-sm uppercase tracking-tight flex items-center gap-1.5 flex-wrap">
                  <span>发现上次训练数据</span>
                  <span className="bg-ink text-neon text-[10px] font-black px-1.5 py-0.5 uppercase">
                    {availableLastLogsList.map((item) => CATEGORY_META[item.category].zh).join(' + ')}
                  </span>
                </h4>

                {availableLastLogsList.map(({ category: c, log }) => (
                  <p key={c} className="text-xs font-black text-ink/80 leading-tight">
                    <span className="bg-ink/10 px-1 py-0.2 mr-1">【{CATEGORY_META[c].zh}】</span>
                    <span className="opacity-60 text-[10px] mr-1">{formatLogDate(log.timestamp)}:</span>
                    {log.exercises
                      .slice(0, 3)
                      .map((ex) =>
                        ex.type === 'strength'
                          ? `${ex.name}(${ex.weight || 0}kg×${ex.sets || 0}组)`
                          : `${ex.name}(${ex.duration || 0}分)`
                      )
                      .join('、')}
                    {log.exercises.length > 3 ? '等' : ''}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {availableLastLogsList.length > 1 ? (
                <button
                  type="button"
                  onClick={() => handleImportCategoryData(undefined, true)}
                  className="flex-1 bg-ink text-neon border-2 border-ink py-2.5 px-4 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-black/80 transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <Zap size={15} />
                  一键合并导入已选部位数据
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleImportCategoryData(availableLastLogsList[0]?.category, true)}
                  className="flex-1 bg-ink text-neon border-2 border-ink py-2.5 px-4 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-black/80 transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <Zap size={15} />
                  一键导入上次【{CATEGORY_META[availableLastLogsList[0]?.category].zh}】数据
                </button>
              )}

              {availableLastLogsList.length > 1 &&
                availableLastLogsList.map(({ category: c }) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleImportCategoryData(c, true)}
                    className="bg-white text-ink border-2 border-ink py-2.5 px-2.5 font-black uppercase text-[10px] hover:bg-paper transition-all cursor-pointer"
                  >
                    仅导入{CATEGORY_META[c].zh}
                  </button>
                ))}

              <button
                type="button"
                onClick={() => setDismissedBannerKeys([...dismissedBannerKeys, bannerKey])}
                className="bg-white text-ink border-2 border-ink py-2.5 px-3 font-black uppercase text-xs hover:bg-paper transition-all cursor-pointer"
              >
                暂不导入
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preset Exercises Section with Category Tabs */}
      <div className="bg-white p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-ink p-1">
              <Dumbbell size={14} className="text-neon" />
            </div>
            <label className="text-xs font-black text-ink uppercase tracking-widest">
              常用动作快捷添加
            </label>
          </div>
          <span className="text-[10px] font-black text-ink/40">点击直接加入</span>
        </div>

        {/* Category Tabs for Presets if multiple categories selected */}
        {selectedCategories.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 border-b-2 border-ink/10">
            {selectedCategories.map((cat) => {
              const isTabActive = activePresetTab === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActivePresetTab(cat)}
                  className={`px-3 py-1.5 border-2 border-ink text-xs font-black uppercase transition-all shrink-0 cursor-pointer ${
                    isTabActive
                      ? 'bg-ink text-neon shadow-[2px_2px_0px_0px_rgba(223,255,0,1)]'
                      : 'bg-paper text-ink hover:bg-neon'
                  }`}
                >
                  {CATEGORY_META[cat].zh} ({CATEGORY_META[cat].en})
                </button>
              );
            })}
          </div>
        )}

        {/* Preset Chips for the activePresetTab */}
        <div className="flex flex-wrap gap-2">
          {currentTabPresets.map((preset) => {
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
                title={`点击添加: ${preset.name} (${preset.type === 'strength' ? `${preset.defaultWeight}kg` : '有氧'})`}
              >
                {isAlreadyAdded ? <Check size={13} className="stroke-[3]" /> : <Plus size={13} />}
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Exercises List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <label className="text-sm font-black text-ink uppercase tracking-widest underline decoration-4 decoration-neon underline-offset-4 flex items-center gap-2">
            <span>Exercises / 训练内容</span>
            <span className="text-xs text-ink/40 no-underline font-black">
              ({exercises.length}/10)
            </span>
          </label>

          {/* Quick manual import button if history exists for any selected category */}
          {hasAnyLastLog && (
            <button
              type="button"
              onClick={() => handleImportCategoryData(undefined)}
              className={`text-[10px] font-black uppercase px-2.5 py-1 border-2 border-ink transition-all cursor-pointer flex items-center gap-1.5 ${
                confirmReimport
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-paper text-ink hover:bg-neon shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
              }`}
              title="导入上次已选部位的训练数据"
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
          {exercises.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white p-8 border-4 border-dashed border-ink/20 text-center space-y-3"
            >
              <div className="bg-paper p-3 inline-block border-2 border-ink/10">
                <Dumbbell size={28} className="text-ink/30" />
              </div>
              <p className="font-black text-ink/40 text-xs uppercase tracking-wider">
                尚未添加动作，点击上方常用动作快捷添加，或导入上次数据
              </p>
              {hasAnyLastLog && (
                <button
                  type="button"
                  onClick={() => handleImportCategoryData(undefined, true)}
                  className="bg-neon text-ink border-2 border-ink px-4 py-2 text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-ink hover:text-neon transition-all cursor-pointer"
                >
                  ⚡ 一键导入上次【{formatCategoriesZh(selectedCategories)}】数据
                </button>
              )}
            </motion.div>
          ) : (
            exercises.map((ex, index) => (
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
                    onClick={() =>
                      updateExercise(ex.id, {
                        type: ex.type === 'strength' ? 'cardio' : 'strength',
                      })
                    }
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
                        : '项目名称 (如 跑步机跑步)'
                    }
                    value={ex.name}
                    onChange={(e) => updateExercise(ex.id, { name: e.target.value })}
                    className="flex-1 font-black text-ink border-b-4 border-ink focus:border-neon outline-none placeholder:opacity-30 uppercase placeholder:italic text-base"
                    required
                  />
                </div>

                {/* Quick preset suggestions if name is empty */}
                {!ex.name && currentTabPresets.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] font-black text-ink/40 uppercase mr-1">推荐:</span>
                    {currentTabPresets.slice(0, 4).map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() =>
                          updateExercise(ex.id, {
                            name: p.name,
                            type: p.type,
                            ...(p.type === 'strength'
                              ? {
                                  weight: p.defaultWeight ?? 0,
                                  sets: p.defaultSets ?? 4,
                                  reps: p.defaultReps ?? 10,
                                }
                              : {
                                  duration: p.defaultDuration ?? 30,
                                  distance: p.defaultDistance ?? 0,
                                  calories: p.defaultCalories ?? 0,
                                }),
                          })
                        }
                        className="text-[10px] font-black bg-paper border border-ink px-1.5 py-0.5 hover:bg-neon transition-colors cursor-pointer"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                {ex.type === 'strength' ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-ink uppercase block mb-1">
                        KG (重量)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={ex.weight || ''}
                        onChange={(e) =>
                          updateExercise(ex.id, { weight: Number(e.target.value) || 0 })
                        }
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-ink uppercase block mb-1">
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
                      <label className="text-[10px] font-black text-ink uppercase block mb-1">
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
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-ink uppercase block mb-1">
                        Min (分钟)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={ex.duration || ''}
                        onChange={(e) =>
                          updateExercise(ex.id, { duration: Number(e.target.value) || 0 })
                        }
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-ink uppercase block mb-1">
                        Km (公里)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={ex.distance || ''}
                        onChange={(e) =>
                          updateExercise(ex.id, { distance: Number(e.target.value) || 0 })
                        }
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-ink uppercase block mb-1">
                        Kcal (大卡)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={ex.calories || ''}
                        onChange={(e) =>
                          updateExercise(ex.id, { calories: Number(e.target.value) || 0 })
                        }
                        placeholder="0"
                        className="w-full bg-paper border-2 border-ink p-2 text-center font-black text-base focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => addExercise('strength')}
            className="flex-1 bg-white border-4 border-ink text-ink py-3 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus size={18} /> + 自定义力量
          </button>
          <button
            type="button"
            onClick={() => addExercise('cardio')}
            className="flex-1 bg-white border-4 border-ink text-ink py-3 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus size={18} /> + 自定义有氧
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
            <Send size={24} /> 发布打卡 ({selectedCategories.map((c) => CATEGORY_META[c].zh).join('+')})
          </>
        )}
      </button>
    </form>
  );
}
