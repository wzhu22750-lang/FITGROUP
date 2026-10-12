import { readRequest } from './request';
import { supabase } from '../lib/supabase';

/** Legacy public URLs are object references, never an authorization mechanism. */
export function workoutPhotoPath(reference: string): string | null {
  try {
    const url = new URL(reference);
    const base = new URL(supabase.storage.from('workouts').getPublicUrl('').data.publicUrl);
    if (url.origin !== base.origin) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|authenticated)\/workouts\/([^/]+\/[^/]+)$/);
    if (!match || !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(match[1]) || match[1].includes('..')) return null;
    return match[1];
  } catch { return null; }
}
export async function downloadWorkoutPhoto(reference: string, signal?: AbortSignal): Promise<Blob> {
  const path = workoutPhotoPath(reference);
  if (!path) throw new Error('训练照片地址无效');
  if (signal?.aborted) throw signal.reason;
  // Authenticated download checks current log visibility on every request;
  // no transferable signed URL is persisted or rendered.
  return readRequest('workout-photo', async deadline => {
    const { data, error } = await supabase.storage.from('workouts').download(path, {}, { signal: deadline, cache: 'no-store' });
    if (error) throw error;
    return data;
  }, { signal });
}
const queueKey = (uid: string) => `fitgroup:photo-cleanup:v1:${uid}`;
type PendingPhoto = { reference: string; after: number };
function readQueue(uid: string): PendingPhoto[] {
  try { const value = JSON.parse(localStorage.getItem(queueKey(uid)) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item?.reference === 'string' && Number.isFinite(item.after)) : []; } catch { return []; }
}
function saveQueue(uid: string, queue: PendingPhoto[]) {
  try { localStorage.setItem(queueKey(uid), JSON.stringify(queue)); } catch { /* Storage RLS still prevents public access. */ }
}
export function trackUploadedPhoto(uid: string, reference: string, discard = false) {
  if (!workoutPhotoPath(reference)?.startsWith(uid + '/')) return;
  saveQueue(uid, [...readQueue(uid).filter(item => item.reference !== reference), { reference, after: Date.now() + (discard ? 0 : 24 * 3600000) }]);
}
export function forgetUploadedPhoto(uid: string, reference: string) { saveQueue(uid, readQueue(uid).filter(item => item.reference !== reference)); }
const cleanupFlights = new Map<string, Promise<void>>();
export async function cleanupWorkoutPhotos(uid: string, preserve: string[] = []) {
  const existing = cleanupFlights.get(uid); if (existing) return existing;
  const task = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== uid) return;
    for (const item of readQueue(uid)) {
      const path = workoutPhotoPath(item.reference);
      if (!path?.startsWith(uid + '/') || item.after > Date.now() || preserve.includes(item.reference)) continue;
      const current = await supabase.auth.getSession();
      if (current.data.session?.user.id !== uid) return;
      // RLS refuses to delete an object still referenced by a saved workout.
      const { error } = await supabase.storage.from('workouts').remove([path]);
      if (!error) forgetUploadedPhoto(uid, item.reference);
    }
  })().finally(() => { if (cleanupFlights.get(uid) === task) cleanupFlights.delete(uid); });
  cleanupFlights.set(uid, task); return task;
}
