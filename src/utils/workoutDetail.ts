import { normalizeLog } from '../api';
import { supabase } from '../lib/supabase';
import type { WorkoutLog } from '../types';
import { readRequest } from './request';

/** Read the raw table with the signed-in client's RLS; never use a privileged view/RPC. */
export async function getWorkoutLogDetail(
  logId: string,
  options?: { signal?: AbortSignal },
): Promise<WorkoutLog | null> {
  if (!logId.trim()) return null;
  const { data, error } = await readRequest('workoutDetail', signal =>
    supabase.from('workout_logs').select('*').eq('id', logId).abortSignal(signal).maybeSingle(),
  options);
  // An absent, deleted or RLS-hidden row has exactly the same presentation.
  if (error) {
    if (error.code === '42501' || error.code === 'PGRST116') return null;
    throw error;
  }
  return data ? normalizeLog(data) : null;
}
