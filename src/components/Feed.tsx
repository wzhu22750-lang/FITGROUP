import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  increment, 
  setDoc, 
  deleteDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { WorkoutLog, WorkoutCategory } from '../types';
import { Heart, MessageCircle, Share2, MoreHorizontal, MapPin, Clock, Dumbbell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export default function Feed() {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'workoutLogs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WorkoutLog[];
      setLogs(logsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white h-64 rounded-3xl animate-pulse border border-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {logs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 italic text-slate-400">
          还没有人打卡，快来做第一个“卷王”吧！
        </div>
      ) : (
        logs.map((log) => <LogCard key={log.id} log={log} />)
      )}
    </div>
  );
}

function LogCard({ log }: { log: WorkoutLog; key?: string }) {
  const [hasLiked, setHasLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    if (!auth.currentUser || !log.id) return;
    const checkLike = async () => {
      const likeSnap = await getDocs(collection(db, 'workoutLogs', log.id!, 'likes'));
      const liked = likeSnap.docs.some(doc => doc.id === auth.currentUser?.uid);
      setHasLiked(liked);
    };
    checkLike();
  }, [log.id]);

  const toggleLike = async () => {
    if (!auth.currentUser || !log.id) return;
    const likeRef = doc(db, 'workoutLogs', log.id, 'likes', auth.currentUser.uid);
    const logRef = doc(db, 'workoutLogs', log.id);

    if (hasLiked) {
      setHasLiked(false);
      await deleteDoc(likeRef);
      await updateDoc(logRef, { likesCount: increment(-1) });
    } else {
      setHasLiked(true);
      await setDoc(likeRef, { userId: auth.currentUser.uid, timestamp: serverTimestamp() });
      await updateDoc(logRef, { likesCount: increment(1) });
    }
  };

  const getCategoryColor = (cat: WorkoutCategory) => {
    switch (cat) {
      case WorkoutCategory.Chest: return 'bg-red-500 text-white';
      case WorkoutCategory.Back: return 'bg-blue-500 text-white';
      case WorkoutCategory.Legs: return 'bg-emerald-500 text-white';
      case WorkoutCategory.Shoulders: return 'bg-purple-500 text-white';
      case WorkoutCategory.Cardio: return 'bg-orange-500 text-white';
      default: return 'bg-ink text-white';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className="bg-white border-4 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6"
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="border-2 border-ink p-0.5 bg-paper">
              <img src={log.userPhoto || 'https://via.placeholder.com/40'} className="w-10 h-10 object-cover" />
            </div>
            <div>
              <h3 className="font-black text-ink leading-none mb-1 uppercase tracking-tighter">{log.userName}</h3>
              <p className="text-[10px] font-black text-ink/40 uppercase tracking-widest flex items-center gap-1">
                <Clock size={10} />
                {log.timestamp ? formatDistanceToNow(log.timestamp.toDate(), { addSuffix: true, locale: zhCN }) : '刚刚'}
              </p>
            </div>
          </div>
          <div className={`px-2 py-0.5 border-2 border-ink text-[10px] font-black uppercase tracking-tighter shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${getCategoryColor(log.category)}`}>
            {log.category}
          </div>
        </div>

        {log.note && (
          <p className="text-ink text-lg leading-none mb-4 font-black uppercase tracking-tighter">“{log.note}”</p>
        )}

        <div className="space-y-2 mb-4">
          {log.exercises.map((ex) => (
            <div key={ex.id} className="bg-paper border-2 border-ink p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-ink p-1">
                  <Dumbbell size={14} className="text-neon" />
                </div>
                <span className="font-black text-ink text-xs uppercase tracking-tighter">{ex.name}</span>
              </div>
              <div className="text-[10px] font-black text-ink uppercase space-x-2">
                {ex.type === 'strength' ? (
                  <>
                    <span className="bg-neon px-1">{ex.weight}KG</span>
                    <span>x</span>
                    <span>{ex.sets}S</span>
                    <span>x</span>
                    <span>{ex.reps}R</span>
                  </>
                ) : (
                  <>
                    <span className="bg-neon px-1">{ex.duration}M</span>
                    <span>/</span>
                    <span>{ex.distance}K</span>
                    <span>/</span>
                    <span>{ex.calories}C</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {log.photoUrl && (
          <div className="border-4 border-ink mb-4 aspect-[4/3] bg-paper overflow-hidden">
            <img src={log.photoUrl} className="w-full h-full object-cover grayscale contrast-125" />
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t-2 border-ink/10">
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleLike}
              className={`flex items-center gap-2 text-xs font-black px-3 py-1 border-2 border-ink transition-all cursor-pointer ${hasLiked ? 'bg-ink text-neon' : 'bg-white text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'}`}
            >
              <Heart size={16} fill={hasLiked ? 'currentColor' : 'none'} />
              <span>{log.likesCount || 0}</span>
            </button>
            <button 
               onClick={() => setShowComments(!showComments)}
               className="flex items-center gap-2 text-xs font-black px-3 py-1 border-2 border-ink bg-white text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              <MessageCircle size={16} />
              <span>{log.commentsCount || 0}</span>
            </button>
          </div>
          <button className="bg-paper p-1 border-2 border-ink hover:bg-neon transition-colors cursor-pointer">
            <Share2 size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
