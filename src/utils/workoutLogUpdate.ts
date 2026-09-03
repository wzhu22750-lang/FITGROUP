import type { Exercise, WorkoutLog, WorkoutVisibility } from '../types';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type WorkoutLogClient = {
  // Keep the Supabase client boundary shallow: PostgREST builders are thenables,
  // but their generic types are intentionally too deep to expose here.
  from: (table: string) => any;
};

type AuthUserLike = { id: string };

export type WorkoutLogUpdateError = Error & SupabaseErrorLike & {
  phase?: 'read' | 'update' | 'validation';
};

function newExerciseId(index: number): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `ex-${index + 1}-${rand.slice(0, 8)}`;
}

function makeWorkoutLogError(
  message: string,
  metadata: SupabaseErrorLike & { phase?: WorkoutLogUpdateError['phase'] } = {},
): WorkoutLogUpdateError {
  const error = new Error(message) as WorkoutLogUpdateError;
  Object.assign(error, metadata);
  return error;
}

function preserveSupabaseError(
  error: unknown,
  phase: WorkoutLogUpdateError['phase'],
): WorkoutLogUpdateError {
  const raw = error as SupabaseErrorLike | null;
  const isNetworkError = error instanceof TypeError || (error instanceof Error && /fetch|network|networkerror/i.test(error.message));
  const code = raw?.code || (isNetworkError ? 'NETWORK_ERROR' : 'SUPABASE_ERROR');
  const message = raw?.message || (error instanceof Error ? error.message : 'Supabase 请求失败');
  return makeWorkoutLogError(message, {
    code,
    details: raw?.details,
    hint: raw?.hint,
    phase,
  });
}

/**
 * Normalize the only exercise shape accepted by the workout_logs JSON check.
 * This is the single API/database boundary used by both create and update flows.
 */
export const sanitizeExercisesForDb = (rawList: unknown): Exercise[] => {
  const list = Array.isArray(rawList) ? rawList.slice(0, 10) : [];
  const source = list.length > 0 ? list : [{ type: 'strength', name: '训练' }];

  return source.map((item, index) => {
    const raw = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
    const type: Exercise['type'] = raw.type === 'cardio' ? 'cardio' : 'strength';
    const id = typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim().slice(0, 64)
      : newExerciseId(index);
    const name = typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 80)
      : type === 'strength' ? '力量训练' : '有氧运动';

    if (type === 'strength') {
      const weight = typeof raw.weight === 'number' ? raw.weight : parseFloat(String(raw.weight ?? 0));
      const sets = typeof raw.sets === 'number' ? raw.sets : parseInt(String(raw.sets ?? 4), 10);
      const reps = typeof raw.reps === 'number' ? raw.reps : parseInt(String(raw.reps ?? 10), 10);
      return {
        id,
        name,
        type,
        weight: Number.isFinite(weight) ? Math.max(-500, Math.min(2000, Number(weight.toFixed(1)))) : 0,
        sets: Number.isFinite(sets) ? Math.max(1, Math.min(100, Math.round(sets))) : 4,
        reps: Number.isFinite(reps) ? Math.max(1, Math.min(1000, Math.round(reps))) : 10,
      };
    }

    const duration = typeof raw.duration === 'number' ? raw.duration : parseInt(String(raw.duration ?? 30), 10);
    const distance = typeof raw.distance === 'number' ? raw.distance : parseFloat(String(raw.distance ?? 0));
    const calories = typeof raw.calories === 'number' ? raw.calories : parseInt(String(raw.calories ?? 0), 10);
    const caloriesSource = raw.caloriesSource === 'estimated' || raw.caloriesSource === 'reported'
      ? raw.caloriesSource
      : undefined;
    return {
      id,
      name,
      type,
      duration: Number.isFinite(duration) ? Math.max(0, Math.min(1440, Math.round(duration))) : 0,
      distance: Number.isFinite(distance) ? Math.max(0, Math.min(1000, Number(distance.toFixed(2)))) : 0,
      calories: Number.isFinite(calories) ? Math.max(0, Math.min(20000, Math.round(calories))) : 0,
      ...(caloriesSource ? { caloriesSource } : {}),
    };
  });
};

function normalizeCategories(updates: Record<string, unknown>): string | undefined {
  if (!('categories' in updates) && !('category' in updates)) return undefined;
  const categories = Array.isArray(updates.categories) && updates.categories.length > 0
    ? updates.categories.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof updates.category === 'string' ? [updates.category] : ['Others'];
  return (categories.length > 0 ? categories : ['Others']).join(', ');
}

export const buildWorkoutLogUpdatePayload = (updates: Record<string, unknown>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if ('exercises' in updates) {
    payload.exercises = sanitizeExercisesForDb(updates.exercises);
  }

  const category = normalizeCategories(updates);
  if (category !== undefined) payload.category = category;

  if ('note' in updates && typeof updates.note === 'string') {
    payload.note = updates.note.slice(0, 500);
  }

  if ('photoUrl' in updates && typeof updates.photoUrl === 'string') {
    payload.photo_url = updates.photoUrl;
  }

  if ('visibility' in updates && typeof updates.visibility === 'string') {
    const visibility = updates.visibility;
    if (['public', 'friends', 'private'].includes(visibility)) {
      payload.visibility = visibility;
    }
  }

  if (Object.keys(payload).length === 0) {
    throw makeWorkoutLogError('没有可保存的修改', {
      code: 'WORKOUT_LOG_EMPTY_UPDATE',
      phase: 'validation',
    });
  }

  return payload;
};

function normalizeUpdatedLog(row: Record<string, unknown>): WorkoutLog {
  const rawVisibility = typeof row.visibility === 'string' ? row.visibility.toLowerCase() : '';
  const visibility: WorkoutVisibility = rawVisibility === 'friends' || rawVisibility === 'private'
    ? rawVisibility
    : 'public';

  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: String(row.user_name || ''),
    userPhoto: String(row.user_photo || ''),
    timestamp: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    category: String(row.category || ''),
    exercises: Array.isArray(row.exercises) ? row.exercises as Exercise[] : [],
    note: String(row.note || ''),
    photoUrl: String(row.photo_url || ''),
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    visibility,
  };
}

export async function executeWorkoutLogUpdate({
  client,
  user,
  workoutLogId,
  updates,
}: {
  client: WorkoutLogClient;
  user: AuthUserLike;
  workoutLogId: string;
  updates: Record<string, unknown>;
}): Promise<WorkoutLog> {
  if (!workoutLogId || typeof workoutLogId !== 'string') {
    throw makeWorkoutLogError('打卡记录 ID 无效，无法保存', {
      code: 'WORKOUT_LOG_INVALID_ID',
      phase: 'validation',
    });
  }

  let existing: { id: string; user_id: string } | null = null;
  let readError: unknown = null;
  try {
    const result = await client
      .from('workout_logs')
      .select('id, user_id')
      .eq('id', workoutLogId)
      .maybeSingle();
    existing = result.data;
    readError = result.error;
  } catch (error) {
    readError = error;
  }

  if (readError) {
    const preserved = preserveSupabaseError(readError, 'read');
    console.error('[updateWorkoutLog] ownership lookup failed', {
      id: workoutLogId,
      code: preserved.code,
      message: preserved.message,
      details: preserved.details,
      hint: preserved.hint,
    });
    throw preserved;
  }

  if (!existing) {
    const notFound = makeWorkoutLogError('打卡记录不存在，或当前账号无权访问该记录（可能是 RLS 限制）', {
      code: 'WORKOUT_LOG_NOT_FOUND_OR_RLS',
      phase: 'read',
      details: `No visible workout_logs row matched id=${workoutLogId}`,
      hint: '确认 workoutLogId 是数据库 id，并检查 workout_logs 的 SELECT/UPDATE RLS policy。',
    });
    console.error('[updateWorkoutLog] no visible workout log matched id', {
      id: workoutLogId,
      code: notFound.code,
      message: notFound.message,
      details: notFound.details,
      hint: notFound.hint,
    });
    throw notFound;
  }

  if (existing.user_id !== user.id) {
    const forbidden = makeWorkoutLogError('无权编辑他人的打卡记录（RLS）', {
      code: 'WORKOUT_LOG_RLS_FORBIDDEN',
      phase: 'read',
      details: `Record owner is ${existing.user_id}; current user is ${user.id}`,
      hint: 'workout_logs_update policy requires user_id = auth.uid()。',
    });
    console.error('[updateWorkoutLog] RLS ownership check failed', {
      id: workoutLogId,
      code: forbidden.code,
      message: forbidden.message,
      details: forbidden.details,
      hint: forbidden.hint,
    });
    throw forbidden;
  }

  const payload = buildWorkoutLogUpdatePayload(updates);
  let updatedRows: unknown[] | null = null;
  let updateError: unknown = null;
  try {
    const result = await client
      .from('workout_logs')
      .update(payload)
      .eq('id', workoutLogId)
      .select();
    updatedRows = result.data;
    updateError = result.error;
  } catch (error) {
    updateError = error;
  }

  if (updateError) {
    const preserved = preserveSupabaseError(updateError, 'update');
    console.error('[updateWorkoutLog] UPDATE failed', {
      id: workoutLogId,
      payload,
      code: preserved.code,
      message: preserved.message,
      details: preserved.details,
      hint: preserved.hint,
    });
    throw preserved;
  }

  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    const noRows = makeWorkoutLogError(
      '保存失败：UPDATE 没有返回任何记录，可能是记录已被删除、ID 不匹配或被 RLS 拦截',
      {
        code: 'PGRST_NO_ROWS',
        phase: 'update',
        details: `UPDATE workout_logs matched 0 rows for id=${workoutLogId}`,
        hint: '检查 workoutLogId、当前登录用户以及 workout_logs_update policy。',
      },
    );
    console.error('[updateWorkoutLog] UPDATE returned zero rows', {
      id: workoutLogId,
      payload,
      code: noRows.code,
      message: noRows.message,
      details: noRows.details,
      hint: noRows.hint,
    });
    throw noRows;
  }

  return normalizeUpdatedLog(updatedRows[0] as Record<string, unknown>);
};

export function classifyWorkoutLogError(error: unknown): string {
  const value = error as SupabaseErrorLike | null;
  const code = value?.code;
  if (code === 'NETWORK_ERROR' || error instanceof TypeError || (error instanceof Error && /fetch|network|networkerror/i.test(error.message))) return '网络错误';
  if (code === 'WORKOUT_LOG_RLS_FORBIDDEN' || code === '42501') return 'RLS 权限错误';
  if (code === 'WORKOUT_LOG_NOT_FOUND_OR_RLS' || code === 'PGRST_NO_ROWS') return '记录不存在或 UPDATE 匹配不到记录';
  if (code === '23514') return '数据库 CHECK constraint 失败';
  if (code === '42703' || code === 'PGRST204') return '数据库列不存在，schema 尚未同步';
  if (code === '22P02' || code === '22023') return '数据格式错误';
  if (code === 'NETWORK_ERROR') return '网络错误';
  return 'Supabase API 错误';
}

export const formatWorkoutLogError = (error: unknown): string => {
  const value = error as SupabaseErrorLike | null;
  if (!value) return '保存修改失败，请重试';
  const parts = [`${classifyWorkoutLogError(error)}：${value.message || '保存修改失败'}`];
  if (value.code) parts.push(`错误码 ${value.code}`);
  if (value.details) parts.push(value.details);
  if (value.hint) parts.push(`提示：${value.hint}`);
  return parts.join('；');
};

export type { WorkoutLogClient };
