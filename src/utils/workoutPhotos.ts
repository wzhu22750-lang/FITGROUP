import { readRequest } from './request';
import { supabase } from '../lib/supabase';
import { readDraftPhoto } from './workoutDraftStorage';

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
let photoReadSequence = 0;
export async function downloadWorkoutPhoto(reference: string, signal?: AbortSignal): Promise<Blob> {
  const path = workoutPhotoPath(reference);
  if (!path) throw new Error('训练照片地址无效');
  if (signal?.aborted) throw signal.reason;
  // Authenticated download checks current log visibility on every request;
  // no transferable signed URL is persisted or rendered.
  return readRequest('workout-photo', async deadline => {
    // A fixed authenticated URL can retain old bytes beyond object deletion.
    const cacheNonce = `${Date.now().toString(36)}-${++photoReadSequence}`;
    const { data, error } = await supabase.storage.from('workouts').download(path, { cacheNonce }, { signal: deadline, cache: 'no-store' });
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
const activeDraftPhotos = new Map<string, Set<() => string>>();
/** Editing and storage-denied drafts stay protected for the mounted session. */
export function retainDraftPhoto(uid: string, reference: () => string) {
  let references = activeDraftPhotos.get(uid);
  if (!references) { references = new Set(); activeDraftPhotos.set(uid, references); }
  references.add(reference);
  return () => {
    references.delete(reference);
    if (!references.size && activeDraftPhotos.get(uid) === references) activeDraftPhotos.delete(uid);
  };
}
function isDraftPhotoProtected(uid: string, reference: string) {
  try {
    for (const current of activeDraftPhotos.get(uid) ?? []) if (current() === reference) return true;
    const current = readDraftPhoto(uid);
    // Unknown/corrupt state cannot establish that this upload was abandoned.
    return current === null || current === reference;
  } catch { return true; }
}
const cleanupFlights = new Map<string, { task: Promise<void>; preserve: Set<string> }>();
export async function cleanupWorkoutPhotos(uid: string, preserve: string[] = []) {
  const existing = cleanupFlights.get(uid);
  if (existing) { preserve.forEach(reference => existing.preserve.add(reference)); return existing.task; }
  const protectedReferences = new Set(preserve);
  const task = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== uid) return;
    for (const item of readQueue(uid)) {
      const path = workoutPhotoPath(item.reference);
      if (!path?.startsWith(uid + '/') || item.after > Date.now() || protectedReferences.has(item.reference) || isDraftPhotoProtected(uid, item.reference)) continue;
      const current = await supabase.auth.getSession();
      if (current.data.session?.user.id !== uid) return;
      // Joining callers and queue changes during auth checks can restore a draft.
      const latest = readQueue(uid).find(candidate => candidate.reference === item.reference);
      if (!latest || latest.after > Date.now() || protectedReferences.has(item.reference) || isDraftPhotoProtected(uid, item.reference)) continue;
      // RLS refuses to delete an object still referenced by a saved workout.
      const { data: removed, error } = await supabase.storage.from('workouts').remove([path]);
      if (!error && removed?.some(object => object.name === path)) forgetUploadedPhoto(uid, item.reference);
    }
  })().finally(() => { if (cleanupFlights.get(uid)?.task === task) cleanupFlights.delete(uid); });
  cleanupFlights.set(uid, { task, preserve: protectedReferences }); return task;
}
