import { useState, useRef, FormEvent, ChangeEvent } from 'react';
import { createWorkoutLog, getCurrentUser, getUserProfile, updateUserProfileFn, uploadWorkoutPhoto } from '../firebase';
import { WorkoutCategory, Exercise } from '../types';
import { Plus, Trash2, Camera, Send, X, Dumbbell, Timer, Image as ImageIcon, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { isNative, pickFromCamera, pickFromGallery } from '../native';
import PhotoSourceSheet from './PhotoSourceSheet';

interface WorkoutLoggerProps {
  onSuccess: () => void;
}

export default function WorkoutLogger({ onSuccess }: WorkoutLoggerProps) {
  const [category, setCategory] = useState<WorkoutCategory>(WorkoutCategory.Chest);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500); };

  const addExercise = (type: 'strength' | 'cardio') => {
    setExercises([...exercises, {
      id: Math.random().toString(36).slice(2, 11),
      name: '',
      type,
      ...(type === 'strength' ? { weight: 0, sets: 0, reps: 0 } : { duration: 0, distance: 0, calories: 0 }),
    }]);
  };

  const handleRemoveExercise = (id: string) => {
    if (deleteConfirm === id) {
      setExercises(exercises.filter(e => e.id !== id));
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const updateExercise = (id: string, updates: Partial<Exercise>) => {
    setExercises(exercises.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const applyPhotoFile = (file: File) => {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => { setPhotoPreview(reader.result as string); setPhotoUrl(''); };
    reader.readAsDataURL(file);
  };

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    applyPhotoFile(file);
  };

  const openPhotoPicker = () => setPickerOpen(true);

  const handleNativeCamera = async () => {
    setPickerOpen(false);
    if (!isNative()) {
      captureInputRef.current?.click();
      return;
    }
    const file = await pickFromCamera();
    if (file) applyPhotoFile(file);
  };

  const handleNativeGallery = async () => {
    setPickerOpen(false);
    if (!isNative()) {
      fileInputRef.current?.click();
      return;
    }
    const file = await pickFromGallery();
    if (file) applyPhotoFile(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    if (exercises.length === 0) {
      showToast('请至少添加一个训练项目');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhotoUrl = photoUrl;

      if (photoFile) {
        setUploading(true);
        finalPhotoUrl = await uploadWorkoutPhoto(user.uid, photoFile);
        setUploading(false);
      }

      await createWorkoutLog({
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || '',
        category,
        exercises,
        note,
        photoUrl: finalPhotoUrl,
        likesCount: 0,
        commentsCount: 0,
      });

      const userProfile = await getUserProfile(user.uid).catch(() => null);
      if (userProfile) {
        const lastWorkout = userProfile.lastWorkoutDate ? new Date(userProfile.lastWorkoutDate) : null;
        const today = new Date();
        let newStreak = userProfile.streak || 0;

        if (lastWorkout) {
          const toDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          const diffDays = Math.floor((toDay(today) - toDay(lastWorkout)) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            newStreak += 1;
          } else if (diffDays > 1) {
            newStreak = 1;
          }
        } else {
          newStreak = 1;
        }

        const newPrs = { ...(userProfile.prs || {}) };
        let prBroken = false;
        exercises.forEach(ex => {
          if (ex.type === 'strength' && ex.weight && (!newPrs[ex.name] || ex.weight > newPrs[ex.name])) {
            newPrs[ex.name] = ex.weight;
            prBroken = true;
          }
        });

        await updateUserProfileFn(user.uid, {
          streak: newStreak,
          lastWorkoutDate: today.toISOString(),
          totalWorkouts: (userProfile.totalWorkouts || 0) + 1,
          prs: newPrs,
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

      onSuccess();
    } catch (error) {
      console.error('保存失败:', error);
      showToast((error as Error)?.message || '保存失败，请重试');
    } finally {
      setIsSubmitting(false);
      setUploading(false);
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

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">Target Muscle / 训练部位</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(WorkoutCategory).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer ${
                category === cat ? 'bg-ink text-neon' : 'bg-white text-ink hover:bg-neon'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-black text-ink uppercase tracking-widest px-2 underline decoration-4 decoration-neon underline-offset-4">Exercises / 训练内容</label>
        <AnimatePresence initial={false}>
          {exercises.map((ex) => (
            <motion.div
              key={ex.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className={`bg-white p-5 border-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative ${deleteConfirm === ex.id ? 'border-red-500 bg-red-50' : 'border-ink'}`}
            >
              <button
                type="button"
                onClick={() => handleRemoveExercise(ex.id)}
                className={`absolute top-2 right-2 p-1 border-2 border-ink transition-colors cursor-pointer ${deleteConfirm === ex.id ? 'bg-red-400 text-white' : 'bg-paper text-ink hover:bg-red-400'}`}
              >
                {deleteConfirm === ex.id ? <Check size={16} /> : <X size={16} />}
              </button>

              {deleteConfirm === ex.id && (
                <span className="absolute top-2 right-10 text-[10px] font-black text-red-600 uppercase">点击确认删除</span>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 border-2 border-ink ${ex.type === 'strength' ? 'bg-neon' : 'bg-white'}`}>
                  {ex.type === 'strength' ? <Dumbbell size={18} className="text-ink" /> : <Timer size={18} className="text-ink" />}
                </div>
                <input
                  type="text"
                  placeholder={ex.type === 'strength' ? "动作 (e.g. Bench Press)" : "项目 (e.g. Running)"}
                  value={ex.name}
                  onChange={(e) => updateExercise(ex.id, { name: e.target.value })}
                  className="flex-1 font-black text-ink border-b-4 border-ink focus:border-neon outline-none placeholder:opacity-30 uppercase placeholder:italic"
                  required
                />
              </div>

              {ex.type === 'strength' ? (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">KG</label>
                    <input type="number" min="0" step="0.5" value={ex.weight || ''} onChange={(e) => updateExercise(ex.id, { weight: Number(e.target.value) || 0 })} className="w-full bg-paper border-2 border-ink p-2 text-center font-black" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Sets</label>
                    <input type="number" min="0" value={ex.sets || ''} onChange={(e) => updateExercise(ex.id, { sets: Number(e.target.value) || 0 })} className="w-full bg-paper border-2 border-ink p-2 text-center font-black" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Reps</label>
                    <input type="number" min="0" value={ex.reps || ''} onChange={(e) => updateExercise(ex.id, { reps: Number(e.target.value) || 0 })} className="w-full bg-paper border-2 border-ink p-2 text-center font-black" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Min</label>
                    <input type="number" min="0" step="0.1" value={ex.duration || ''} onChange={(e) => updateExercise(ex.id, { duration: Number(e.target.value) || 0 })} className="w-full bg-paper border-2 border-ink p-2 text-center font-black" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Km</label>
                    <input type="number" min="0" step="0.1" value={ex.distance || ''} onChange={(e) => updateExercise(ex.id, { distance: Number(e.target.value) || 0 })} className="w-full bg-paper border-2 border-ink p-2 text-center font-black" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Kcal</label>
                    <input type="number" min="0" value={ex.calories || ''} onChange={(e) => updateExercise(ex.id, { calories: Number(e.target.value) || 0 })} className="w-full bg-paper border-2 border-ink p-2 text-center font-black" />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="flex gap-3">
          <button type="button" onClick={() => addExercise('strength')} className="flex-1 bg-white border-4 border-ink text-ink py-3 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
            <Plus size={18} /> Strength
          </button>
          <button type="button" onClick={() => addExercise('cardio')} className="flex-1 bg-white border-4 border-ink text-ink py-3 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-neon transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
            <Plus size={18} /> Cardio
          </button>
        </div>
      </div>

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">Notes & Photo</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="HOW DID IT FEEL?"
          className="w-full bg-paper border-4 border-ink p-4 font-black text-ink min-h-[100px] outline-none focus:bg-white transition-all mb-4 uppercase placeholder:opacity-30"
        />

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
        <input ref={captureInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />

        {photoPreview ? (
          <div className="mb-4">
            <div className="border-4 border-ink aspect-[4/3] overflow-hidden bg-paper mb-2">
              <img src={photoPreview} className="w-full h-full object-cover grayscale contrast-125" />
            </div>
            <button type="button" onClick={() => { setPhotoPreview(''); setPhotoFile(null); }} className="text-[10px] font-black text-ink uppercase underline cursor-pointer">移除照片</button>
          </div>
        ) : (
          <button type="button" onClick={openPhotoPicker} className="w-full flex items-center gap-2 bg-paper border-2 border-ink p-3 hover:bg-neon transition-colors cursor-pointer mb-4">
            <ImageIcon size={18} className="text-ink/40" />
            <span className="font-black text-ink uppercase text-xs">拍摄/选择照片</span>
          </button>
        )}

        <div className="border-t-2 border-ink/10 pt-4">
          <p className="text-[10px] font-black text-ink/30 uppercase mb-2">或粘贴图片链接</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-neon border-2 border-ink p-2 flex items-center gap-4">
              <Camera size={20} className="text-ink" />
              <input
                type="text"
                placeholder="PHOTO URL (OPTIONAL)"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-[10px] font-black uppercase placeholder:text-ink/30 flex-1 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full py-5 font-black uppercase text-xl border-4 border-ink shadow-[6px_6px_0px_0px_rgba(223,255,0,1)] flex items-center justify-center gap-4 transition-all active:translate-x-1 active:translate-y-1 active:shadow-none cursor-pointer ${
          isSubmitting ? 'bg-paper text-ink opacity-50' : 'bg-ink text-white'
        }`}
      >
        {uploading ? 'Uploading Photo...' : isSubmitting ? 'Saving...' : (<><Send size={24} /> Post to Feed</>)}
      </button>

      <PhotoSourceSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onCamera={handleNativeCamera}
        onGallery={handleNativeGallery}
      />
    </form>
  );
}
