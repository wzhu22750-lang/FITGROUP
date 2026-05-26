import { useState, ReactNode, FormEvent } from 'react';
import { supabase } from '../supabase';
import { WorkoutCategory, Exercise } from '../types';
import { Plus, Trash2, Camera, Send, X, Dumbbell, Timer, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

interface WorkoutLoggerProps {
  onSuccess: () => void;
}

export default function WorkoutLogger({ onSuccess }: WorkoutLoggerProps) {
  const [category, setCategory] = useState<WorkoutCategory>(WorkoutCategory.Chest);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addExercise = (type: 'strength' | 'cardio') => {
    const newExercise: Exercise = {
      id: Math.random().toString(36).slice(2, 11),
      name: '',
      type,
      ...(type === 'strength' ? { weight: 0, sets: 0, reps: 0 } : { duration: 0, distance: 0, calories: 0 })
    };
    setExercises([...exercises, newExercise]);
  };

  const removeExercise = (id: string) => {
    setExercises(exercises.filter(e => e.id !== id));
  };

  const updateExercise = (id: string, updates: Partial<Exercise>) => {
    setExercises(exercises.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (exercises.length === 0) {
      alert("请至少添加一个训练项目");
      return;
    }

    setIsSubmitting(true);
    try {
      const logData = {
        userId: user.id,
        userName: user.user_metadata?.displayName || 'Anonymous',
        userPhoto: user.user_metadata?.photoURL || '',
        timestamp: new Date().toISOString(),
        category,
        exercises,
        note,
        photoUrl,
        likesCount: 0,
        commentsCount: 0
      };

      await supabase.from('workoutLogs').insert([logData]);

      // Update user stats
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('uid', user.id)
        .single();
      
      const lastWorkout = userData?.lastWorkoutDate ? new Date(userData.lastWorkoutDate) : null;
      const today = new Date();
      let newStreak = userData?.streak || 0;

      if (lastWorkout) {
        const diffDays = Math.floor((today.getTime() - lastWorkout.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          newStreak += 1;
        } else if (diffDays > 1) {
          newStreak = 1;
        }
      } else {
        newStreak = 1;
      }

      // Check PRs
      const newPrs = { ...(userData?.prs || {}) };
      let prBroken = false;
      exercises.forEach(ex => {
        if (ex.type === 'strength' && ex.weight && (!newPrs[ex.name] || ex.weight > newPrs[ex.name])) {
          newPrs[ex.name] = ex.weight;
          prBroken = true;
        }
      });

      await supabase
        .from('users')
        .update({
          streak: newStreak,
          lastWorkoutDate: today.toISOString(),
          totalWorkouts: (userData?.totalWorkouts || 0) + 1,
          prs: newPrs
        })
        .eq('uid', user.id);

      if (prBroken) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#DFFF00', '#000000', '#F4F4F4']
        });
      }

      onSuccess();
    } catch (error) {
      console.error("Failed to save workout", error);
      alert("保存失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">Target Muscle / 训练部位</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(WorkoutCategory).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`py-3 px-2 border-2 border-ink text-xs font-black uppercase transition-all cursor-pointer ${
                category === cat 
                ? 'bg-ink text-neon' 
                : 'bg-white text-ink hover:bg-neon'
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
              className="bg-white p-5 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative"
            >
              <button 
                type="button"
                onClick={() => removeExercise(ex.id)}
                className="absolute top-2 right-2 bg-paper text-ink p-1 border-2 border-ink hover:bg-red-400 transition-colors"
              >
                <X size={16} />
              </button>

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
                    <input
                      type="number"
                      value={ex.weight || ''}
                      onChange={(e) => updateExercise(ex.id, { weight: parseFloat(e.target.value) })}
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Sets</label>
                    <input
                      type="number"
                      value={ex.sets || ''}
                      onChange={(e) => updateExercise(ex.id, { sets: parseInt(e.target.value) })}
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Reps</label>
                    <input
                      type="number"
                      value={ex.reps || ''}
                      onChange={(e) => updateExercise(ex.id, { reps: parseInt(e.target.value) })}
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Min</label>
                    <input
                      type="number"
                      value={ex.duration || ''}
                      onChange={(e) => updateExercise(ex.id, { duration: parseFloat(e.target.value) })}
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Km</label>
                    <input
                      type="number"
                      value={ex.distance || ''}
                      onChange={(e) => updateExercise(ex.id, { distance: parseFloat(e.target.value) })}
                      className="w-full bg-paper border-2 border-ink p-2 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-ink uppercase block mb-1">Kcal</label>
                    <input
                      type="number"
                      value={ex.calories || ''}
                      onChange={(e) => updateExercise(ex.id, { calories: parseFloat(e.target.value) })}
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

      <div className="bg-white p-6 border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <label className="block text-sm font-black text-ink uppercase tracking-widest mb-4">Notes & Photo</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="HOW DID IT FEEL?"
          className="w-full bg-paper border-4 border-ink p-4 font-black text-ink min-h-[100px] outline-none focus:bg-white transition-all mb-4 uppercase placeholder:opacity-30"
        />
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

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full py-5 font-black uppercase text-xl border-4 border-ink shadow-[6px_6px_0px_0px_rgba(223,255,0,1)] flex items-center justify-center gap-4 transition-all active:translate-x-1 active:translate-y-1 active:shadow-none cursor-pointer ${
          isSubmitting ? 'bg-paper text-ink opacity-50' : 'bg-ink text-white'
        }`}
      >
        {isSubmitting ? 'Saving...' : (
          <>
            <Send size={24} /> Post to Feed
          </>
        )}
      </button>
    </form>
  );
}
