import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { supabase } from '../lib/supabase';
import { downloadWorkoutPhoto } from '../utils/workoutPhotos';

export default function WorkoutPhoto({ reference, ...props }: ImgHTMLAttributes<HTMLImageElement> & { reference: string }) {
  const [source, setSource] = useState<{ reference: string; url: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = '';
    const controller = new AbortController();
    setFailed(false); setSource(null);
    const { data: auth } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); setSource(null); setReload(value => value + 1); }
    });
    const online = () => setReload(value => value + 1);
    if (typeof window !== 'undefined') window.addEventListener('online', online);
    void downloadWorkoutPhoto(reference, controller.signal).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setSource({ reference, url: objectUrl });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); auth.subscription.unsubscribe(); if (typeof window !== 'undefined') window.removeEventListener('online', online); };
  }, [reference, reload]);
  if (failed) return <button type="button" data-workout-photo-status="failed" className="min-h-11 text-xs text-ink/60 p-2" onClick={() => setReload(value => value + 1)}>照片暂时无法读取，点按重试</button>;
  return source?.reference === reference ? <img {...props} src={source.url} /> : <div role="status" data-workout-photo-status="loading" aria-label="照片加载中" className="min-h-20 bg-paper border border-ink/20" />;
}
