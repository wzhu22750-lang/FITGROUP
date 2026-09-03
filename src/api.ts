import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { WorkoutLog, WorkoutVisibility, Team, TeamMember, TeamDashboardData, AppNotification, FeedbackType, UserFeedback } from './types';
import { executeWorkoutLogUpdate, sanitizeExercisesForDb } from './utils/workoutLogUpdate';
export { sanitizeExercisesForDb } from './utils/workoutLogUpdate';
import { DEFAULT_MAX_TEAM_MEMBERS } from './constants/teamConfig';


export type AppUser = {
  id: string;
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  streak?: number;
  totalWorkouts?: number;
  lastWorkoutDate?: string;
  prs?: Record<string, number>;
  sex?: 'male' | 'female' | null;
  bodyweightKg?: number | null;
  heightCm?: number | null;
  bodyMetricsUpdatedAt?: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  photo_url: string;
  streak?: number;
  total_workouts?: number;
  last_workout_date?: string | null;
  prs?: Record<string, number> | null;
  sex?: string | null;
  bodyweight_kg?: number | string | null;
  height_cm?: number | string | null;
  body_metrics_updated_at?: string | null;
};

type WorkoutLogRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_photo: string;
  created_at: string;
  category: string;
  exercises: unknown;
  note: string;
  photo_url: string;
  likes_count: number;
  comments_count: number;
  visibility?: string;
};

type TeamRow = {
  id: string;
  name: string;
  code: string;
  created_by: string;
  max_members: number;
  created_at: string;
};

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

type CommentRow = {
  id: string;
  log_id: string;
  user_id: string;
  user_name: string;
  user_photo: string;
  content: string;
  created_at: string;
};


const CACHED_USER_STORAGE_KEY = 'fitgroup_cached_user_profile';

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Window localStorage blocked or sandbox restricted
  }
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any)?.localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {
    // globalThis localStorage blocked
  }
  return null;
}

function loadCachedUserFromStorage(): AppUser | null {
  try {
    const storage = getSafeLocalStorage();
    if (!storage) return null;
    const raw = storage.getItem(CACHED_USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.id || parsed.uid)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load cached user from storage:', e);
  }
  return null;
}

function persistCachedUser(user: AppUser | null): void {
  try {
    const storage = getSafeLocalStorage();
    if (!storage) return;
    if (user) {
      storage.setItem(CACHED_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      storage.removeItem(CACHED_USER_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to persist cached user to storage:', e);
  }
}

let cachedUser: AppUser | null = loadCachedUserFromStorage();

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function newId(prefix = 'id'): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand}`.slice(0, 128);
}

function profileFromRow(row: ProfileRow, authUser?: User | null): AppUser {
  const rawSex = row.sex === 'male' || row.sex === 'female' ? row.sex : null;
  const rawWeight = row.bodyweight_kg !== undefined && row.bodyweight_kg !== null && row.bodyweight_kg !== ''
    ? Number(row.bodyweight_kg)
    : null;
  const rawHeight = row.height_cm !== undefined && row.height_cm !== null && row.height_cm !== ''
    ? Number(row.height_cm)
    : null;

  return {
    id: row.id,
    uid: row.id,
    email: authUser?.email || undefined,
    displayName: row.display_name || authUser?.user_metadata?.display_name || authUser?.email?.split('@')[0] || 'FitGroup',
    photoURL: row.photo_url || '',
    phone: '',
    streak: Number(row.streak || 0),
    totalWorkouts: Number(row.total_workouts || 0),
    lastWorkoutDate: toIso(row.last_workout_date),
    prs: row.prs && typeof row.prs === 'object' ? row.prs : {},
    sex: rawSex,
    bodyweightKg: rawWeight !== null && !isNaN(rawWeight) ? rawWeight : null,
    heightCm: rawHeight !== null && !isNaN(rawHeight) ? rawHeight : null,
    bodyMetricsUpdatedAt: toIso(row.body_metrics_updated_at) || null,
  };
}

function authOnlyUser(user: User): AppUser {
  return {
    id: user.id,
    uid: user.id,
    email: user.email || undefined,
    displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'FitGroup',
    photoURL: user.user_metadata?.photo_url || '',
    phone: '',
    streak: 0,
    totalWorkouts: 0,
    prs: {},
    sex: null,
    bodyweightKg: null,
    heightCm: null,
    bodyMetricsUpdatedAt: null,
  };
}

async function currentAuthUser(): Promise<User | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) {
    return sessionData.session.user;
  }
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

function createRefreshScheduler<T>(
  fetcher: () => Promise<T>,
  onData: (value: T) => void,
  onError: ((error: Error) => void) | undefined,
  fallbackMessage: string,
  debounceMs = 120,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let version = 0;
  let disposed = false;

  const execute = () => {
    const requestedVersion = ++version;
    void fetcher()
      .then((value) => {
        if (!disposed && requestedVersion === version) onData(value);
      })
      .catch((error) => {
        if (!disposed && requestedVersion === version) {
          onError?.(error instanceof Error ? error : new Error(fallbackMessage));
        }
      });
  };

  const pull = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      execute();
    }, debounceMs);
  };

  const dispose = () => {
    disposed = true;
    version += 1;
    if (timer) clearTimeout(timer);
  };

  execute();
  return { pull, dispose };
}

async function getMyProfileRow(): Promise<ProfileRow | null> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) throw error;
  return (data || null) as ProfileRow | null;
}

export async function ensureUserProfile(user: User, extras: Partial<AppUser> = {}): Promise<AppUser> {
  const existing = await getMyProfileRow();
  if (existing) {
    const profile = profileFromRow(existing, user);
    cachedUser = profile;
    persistCachedUser(profile);
    return profile;
  }

  const displayName = (extras.displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'FitGroup')
    .toString()
    .slice(0, 50);
  const photoURL = extras.photoURL || user.user_metadata?.photo_url || '';

  const { error: insertError } = await supabase.from('profiles').insert({
    id: user.id,
    display_name: displayName,
    photo_url: photoURL,
  });

  if (insertError && insertError.code !== '23505') throw insertError;

  const created = await getMyProfileRow();
  if (!created) throw new Error('用户资料创建后无法读取');

  const profile = profileFromRow(created, user);
  cachedUser = profile;
  persistCachedUser(profile);
  return profile;
}

function mapAuthError(error: unknown): Error {
  const err = error as { code?: string; message?: string; status?: number };
  const code = (err?.code || '').toLowerCase();
  const message = (err?.message || '').toLowerCase();
  const table: Record<string, string> = {
    email_exists: '该邮箱已注册，请直接登录',
    user_already_exists: '该邮箱已注册，请直接登录',
    invalid_credentials: '邮箱或密码错误',
    invalid_grant: '邮箱或密码错误',
    invalid_email: '邮箱格式不正确',
    validation_failed: '邮箱格式不正确',
    weak_password: '密码至少需要 6 位',
    over_request_rate_limit: '尝试次数过多，请稍后再试',
    over_email_send_rate_limit: '尝试次数过多，请稍后再试',
    email_not_confirmed: '请先到邮箱确认后再登录',
  };
  if (table[code]) return new Error(table[code]);
  if (message.includes('already registered') || message.includes('already been registered')) {
    return new Error('该邮箱已注册，请直接登录');
  }
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return new Error('邮箱或密码错误');
  }
  if (message.includes('network')) {
    return new Error('网络异常，请检查网络后重试');
  }
  return new Error(err?.message || '登录失败，请重试');
}

export const registerWithEmail = async (email: string, password: string, displayName: string) => {
  try {
    const name = displayName.trim().slice(0, 50) || email.split('@')[0];
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name } },
    });
    if (error) throw error;
    if (!data.user) throw new Error('注册失败，请重试');
    if (!data.session) {
      throw new Error('注册成功，请查收确认邮件后再登录');
    }
    return ensureUserProfile(data.user, { displayName: name });
  } catch (e) {
    throw mapAuthError(e);
  }
};

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    if (!data.user) throw new Error('登录失败，请重试');
    return ensureUserProfile(data.user);
  } catch (e) {
    throw mapAuthError(e);
  }
};

export const logout = async () => {
  cachedUser = null;
  persistCachedUser(null);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return null;
};

export const getCurrentUser = () => cachedUser;

export const onAuthStateChangedFn = (callback: (user: AppUser | null) => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    if (!user) {
      cachedUser = null;
      persistCachedUser(null);
      callback(null);
      return;
    }
    void ensureUserProfile(user)
      .then(callback)
      .catch((e) => {
        console.error('Load profile failed:', e);
        cachedUser = authOnlyUser(user);
        persistCachedUser(cachedUser);
        callback(cachedUser);
      });
  });
  return () => data.subscription.unsubscribe();
};

export const getUserProfile = async (userId: string) => {
  const authUser = await currentAuthUser();
  if (authUser?.id === userId) {
    const data = await getMyProfileRow();
    if (!data) throw new Error('User not found');
    return profileFromRow(data, authUser);
  }

  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, display_name, photo_url, streak, total_workouts, last_workout_date')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('User not found');
  return profileFromRow(data as ProfileRow, null);
};

export const updateUserProfileFn = async (userId: string, updates: Record<string, unknown>) => {
  const user = await currentAuthUser();
  if (!user || user.id !== userId) throw new Error('未登录');

  const payload: Record<string, unknown> = {};
  if (typeof updates.displayName === 'string') payload.display_name = updates.displayName.trim().slice(0, 50);
  if (typeof updates.photoURL === 'string') payload.photo_url = updates.photoURL;

  let hasMetricsUpdate = false;
  if ('sex' in updates) {
    const s = updates.sex;
    payload.sex = s === 'male' || s === 'female' ? s : null;
    hasMetricsUpdate = true;
  }

  if ('bodyweightKg' in updates) {
    const bw = updates.bodyweightKg;
    if (bw === null || bw === '' || bw === undefined) {
      payload.bodyweight_kg = null;
    } else {
      const num = Number(bw);
      payload.bodyweight_kg = !isNaN(num) && num > 0 ? Number(num.toFixed(1)) : null;
    }
    hasMetricsUpdate = true;
  }

  if ('heightCm' in updates) {
    const h = updates.heightCm;
    if (h === null || h === '' || h === undefined) {
      payload.height_cm = null;
    } else {
      const num = Number(h);
      payload.height_cm = !isNaN(num) && num > 0 ? Math.round(num) : null;
    }
    hasMetricsUpdate = true;
  }

  if (hasMetricsUpdate) {
    payload.body_metrics_updated_at = new Date().toISOString();
  }

  if (Object.keys(payload).length === 0) {
    return getUserProfile(userId);
  }

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;

  if (payload.display_name || payload.photo_url) {
    await supabase.auth.updateUser({
      data: {
        ...(typeof payload.display_name === 'string' ? { display_name: payload.display_name } : {}),
        ...(typeof payload.photo_url === 'string' ? { photo_url: payload.photo_url } : {}),
      },
    });
  }

  if (cachedUser && cachedUser.uid === userId) {
    cachedUser = {
      ...cachedUser,
      displayName: typeof payload.display_name === 'string' ? payload.display_name : cachedUser.displayName,
      photoURL: typeof payload.photo_url === 'string' ? payload.photo_url : cachedUser.photoURL,
      sex: 'sex' in payload ? (payload.sex as 'male' | 'female' | null) : cachedUser.sex,
      bodyweightKg: 'bodyweight_kg' in payload ? (payload.bodyweight_kg as number | null) : cachedUser.bodyweightKg,
      heightCm: 'height_cm' in payload ? (payload.height_cm as number | null) : cachedUser.heightCm,
      bodyMetricsUpdatedAt: 'body_metrics_updated_at' in payload ? (payload.body_metrics_updated_at as string) : cachedUser.bodyMetricsUpdatedAt,
    };
    persistCachedUser(cachedUser);
  }
};

export const syncUserStatsFromLogs = async (userId: string): Promise<AppUser> => {
  return getUserProfile(userId);
};

export const createWorkoutLog = async (logData: Record<string, unknown>) => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const logId = typeof logData.id === 'string' && logData.id ? logData.id : newId('log');
  const exercises = sanitizeExercisesForDb(logData.exercises);
  const profile = cachedUser || await ensureUserProfile(user);

  const categoriesList = Array.isArray(logData.categories) && logData.categories.length > 0
    ? (logData.categories as string[])
    : (typeof logData.category === 'string' ? [logData.category] : ['Others']);

  const categoryStr = categoriesList.join(', ');
  const visibility: WorkoutVisibility = (
    logData.visibility === 'friends' || logData.visibility === 'private' ? logData.visibility : 'public'
  ) as WorkoutVisibility;

  const { error } = await supabase.from('workout_logs').insert({
    id: logId,
    user_id: user.id,
    user_name: String(logData.userName || profile.displayName || 'FitGroup').slice(0, 50),
    user_photo: String(logData.userPhoto || profile.photoURL || ''),
    category: categoryStr,
    exercises,
    note: String(logData.note || '').slice(0, 500),
    photo_url: String(logData.photoUrl || ''),
    visibility,
  });

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('workout_logs')
        .select('id, user_id')
        .eq('id', logId)
        .maybeSingle();
      if (existing && existing.user_id === user.id) {
        return { id: logId };
      }
    }
    throw error;
  }

  return { id: logId };
};

export const updateWorkoutLog = async (workoutLogId: string, updates: Record<string, unknown>) => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  return executeWorkoutLogUpdate({
    client: supabase,
    user,
    workoutLogId,
    updates,
  });
};


export const deleteWorkoutLog = async (workoutLogId: string) => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const { data, error: readError } = await supabase
    .from('workout_logs')
    .select('id, user_id')
    .eq('id', workoutLogId)
    .maybeSingle();
  if (readError) throw readError;
  if (!data) return;
  if (data.user_id !== user.id) {
    throw new Error('只能删除自己的打卡记录');
  }

  const { error } = await supabase.from('workout_logs').delete().eq('id', workoutLogId);
  if (error) throw error;
};

function normalizeLog(row: WorkoutLogRow): WorkoutLog {
  const rawVis = (row.visibility || '').toLowerCase();
  const visibility: WorkoutVisibility = (
    rawVis === 'friends' || rawVis === 'private' ? rawVis : 'public'
  );

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.user_photo,
    timestamp: toIso(row.created_at) || new Date().toISOString(),
    category: row.category,
    exercises: Array.isArray(row.exercises) ? row.exercises as any : [],
    note: row.note || '',
    photoUrl: row.photo_url || '',
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    visibility,
  };
}

async function attachCurrentUserLikeState(logs: WorkoutLog[]): Promise<WorkoutLog[]> {
  if (logs.length === 0) return logs;
  const userId = cachedUser?.uid || cachedUser?.id || (await currentAuthUser())?.id;
  if (!userId) return logs;

  const { data, error } = await supabase
    .from('workout_likes')
    .select('log_id')
    .eq('user_id', userId)
    .in('log_id', logs.map((log) => log.id));
  if (error) {
    // Like state is auxiliary; keep the feed usable and let LogCard perform a
    // single-item fallback check only when the batch request was unavailable.
    console.warn('Batch like state load failed:', error);
    return logs;
  }

  const likedIds = new Set((data || []).map((row: { log_id: string }) => row.log_id));
  return logs.map((log) => ({ ...log, isLiked: likedIds.has(log.id) }));
}

export async function fetchPublicWorkoutLogs(maxCount = 30): Promise<WorkoutLog[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(maxCount);

  if (error) throw error;
  return attachCurrentUserLikeState((data as WorkoutLogRow[]).map(normalizeLog));
}

export async function fetchTeamWorkoutLogs(teamId: string, maxCount = 30): Promise<WorkoutLog[]> {
  if (!teamId) return [];

  // 1. Get member user IDs of this squad
  const { data: members, error: mErr } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId);
  if (mErr) throw mErr;
  if (!members || members.length === 0) return [];

  const memberIds = members.map((m: any) => m.user_id);

  // 2. Fetch public and friends workouts from those squad members (never private!)
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .in('user_id', memberIds)
    .in('visibility', ['public', 'friends'])
    .order('created_at', { ascending: false })
    .limit(maxCount);

  if (error) throw error;
  return attachCurrentUserLikeState((data as WorkoutLogRow[]).map(normalizeLog));
}

export async function fetchMyWorkoutLogs(userId: string, maxCount = 100): Promise<WorkoutLog[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(maxCount);
  if (error) throw error;
  return attachCurrentUserLikeState((data as WorkoutLogRow[]).map(normalizeLog));
}

export const subscribeToPublicWorkoutLogs = (
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 30,
) => {
  const refresh = createRefreshScheduler(
    () => fetchPublicWorkoutLogs(maxCount),
    callback,
    onError,
    '全员广场动态加载失败',
  );
  const channel = supabase
    .channel(`public_feed_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, refresh.pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, refresh.pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, refresh.pull)
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

export const subscribeToTeamWorkoutLogs = (
  teamId: string,
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 30,
) => {
  if (!teamId) {
    callback([]);
    return () => {};
  }

  const refresh = createRefreshScheduler(
    () => fetchTeamWorkoutLogs(teamId, maxCount),
    callback,
    onError,
    '小队动态加载失败',
  );
  const channel = supabase
    .channel(`team_feed_${teamId}_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, refresh.pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, refresh.pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, refresh.pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, refresh.pull)
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

export const subscribeToMyWorkoutLogs = (
  userId: string,
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 100,
) => {
  const refresh = createRefreshScheduler(
    () => fetchMyWorkoutLogs(userId, maxCount),
    callback,
    onError,
    '个人打卡记录加载失败',
  );
  const channel = supabase
    .channel(`my_feed_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_logs', filter: `user_id=eq.${userId}` },
      refresh.pull
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, refresh.pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, refresh.pull)
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

// Backward-compatible alias
export const subscribeToWorkoutLogs = subscribeToPublicWorkoutLogs;


export const checkUserLike = async (workoutLogId: string, userId: string) => {
  const { data, error } = await supabase
    .from('workout_likes')
    .select('user_id')
    .eq('log_id', workoutLogId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

export const toggleLike = async (workoutLogId: string, userId: string, hasLiked: boolean) => {
  const user = await currentAuthUser();
  if (!user || user.id !== userId) throw new Error('未登录');

  const { data: log, error: logError } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('id', workoutLogId)
    .maybeSingle();
  if (logError) throw logError;
  if (!log) throw new Error('Log not found');

  if (hasLiked) {
    const { error } = await supabase
      .from('workout_likes')
      .delete()
      .eq('log_id', workoutLogId)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('workout_likes').insert({
    log_id: workoutLogId,
    user_id: userId,
  });
  if (error && error.code !== '23505') throw error;
};

export const subscribeToComments = (
  workoutLogId: string,
  callback: (comments: unknown[]) => void,
  onError?: (error: Error) => void,
) => {
  const refresh = createRefreshScheduler(
    () => Promise.resolve(
      supabase
        .from('workout_comments')
        .select('*')
        .eq('log_id', workoutLogId)
        .order('created_at', { ascending: true })
    ),
    ({ data, error }) => {
      if (error) {
        onError?.(error);
        return;
      }
      callback((data as CommentRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        userPhoto: row.user_photo,
        content: row.content,
        timestamp: toIso(row.created_at) || row.created_at,
      })));
    },
    onError,
    '评论加载失败',
  );

  const channel = supabase
    .channel(`comments_${workoutLogId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_comments', filter: `log_id=eq.${workoutLogId}` },
      refresh.pull,
    )
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

export const addComment = async (
  workoutLogId: string,
  userId: string,
  userName: string,
  userPhoto: string,
  content: string,
) => {
  const user = await currentAuthUser();
  if (!user || user.id !== userId) throw new Error('未登录');

  const { data: log, error: logError } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('id', workoutLogId)
    .maybeSingle();
  if (logError) throw logError;
  if (!log) throw new Error('Log not found');

  const { error } = await supabase.from('workout_comments').insert({
    id: newId('c'),
    log_id: workoutLogId,
    user_id: userId,
    user_name: userName.slice(0, 50),
    user_photo: userPhoto || '',
    content: content.slice(0, 300),
  });
  if (error) throw error;
};

export const getLeaderboard = async (maxCount = 10) => {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, display_name, photo_url, streak, total_workouts, last_workout_date')
    .order('streak', { ascending: false })
    .limit(maxCount);
  if (error) throw error;
  return (data as ProfileRow[]).map((row) => profileFromRow(row));
};

export const subscribeToUserProfile = (userId: string, callback: (profile: AppUser) => void) => {
  const pull = () => {
    void getUserProfile(userId)
      .then((profile) => {
        if (cachedUser && cachedUser.uid === userId) {
          cachedUser = { ...cachedUser, ...profile };
          persistCachedUser(cachedUser);
        }
        callback(profile);
      })
      .catch(() => undefined);
  };

  pull();
  const channel = supabase
    .channel(`profile_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      pull,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};

export const subscribeToLeaderboard = (
  callback: (users: AppUser[]) => void,
  maxCount = 10,
  onError?: (error: Error) => void,
) => {
  const refresh = createRefreshScheduler(
    () => getLeaderboard(maxCount),
    callback,
    onError,
    '排行榜加载失败',
  );
  const channel = supabase
    .channel(`leaderboard_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh.pull)
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

export const getLastWorkoutByCategory = async (userId: string, category: string): Promise<any | null> => {
  try {
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .ilike('category', `%${category}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return normalizeLog(data as WorkoutLogRow);
  } catch (err) {
    console.warn('Failed to get last workout for category:', err);
    return null;
  }
};

export const getUserWorkoutLogs = async (userId: string, maxCount = 100): Promise<WorkoutLog[]> => {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(maxCount);
  if (error) throw error;
  return (data as WorkoutLogRow[]).map(normalizeLog);
};

export const subscribeToUserWorkoutLogs = (
  userId: string,
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 100,
) => {
  const refresh = createRefreshScheduler(
    () => getUserWorkoutLogs(userId, maxCount),
    callback,
    onError,
    '个人训练记录加载失败',
  );
  const channel = supabase
    .channel(`user_workout_logs_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_logs', filter: `user_id=eq.${userId}` },
      refresh.pull
    )
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

export const getLastWorkoutsByCategories = async (
  userId: string,
  categories: string[]
): Promise<Record<string, any>> => {
  const result: Record<string, any> = {};
  await Promise.all(
    categories.map(async (cat) => {
      const log = await getLastWorkoutByCategory(userId, cat);
      if (log) {
        result[cat] = log;
      }
    })
  );
  return result;
};

// ---------------------------------------------------------------------------
// Squads & Teams (好友小队)
// ---------------------------------------------------------------------------

function toLocalDateKey(isoOrDate: string | Date): string {
  const d = new Date(isoOrDate);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const getUserTeams = async (userId: string): Promise<Team[]> => {
  const { data: memberships, error: mErr } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId);
  if (mErr) throw mErr;
  if (!memberships || memberships.length === 0) return [];

  const teamIds = memberships.map((m: { team_id: string }) => m.team_id);
  const { data: teams, error: tErr } = await supabase
    .from('teams')
    .select('id, name, code, created_by, max_members, created_at')
    .in('id', teamIds)
    .order('created_at', { ascending: false });
  if (tErr) throw tErr;

  const { data: allMembers, error: membersError } = await supabase
    .from('team_members')
    .select('team_id')
    .in('team_id', teamIds);
  if (membersError) throw membersError;

  const countsMap = new Map<string, number>();
  (allMembers || []).forEach((m: { team_id: string }) => {
    countsMap.set(m.team_id, (countsMap.get(m.team_id) || 0) + 1);
  });

  return (teams as TeamRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    createdBy: t.created_by,
    maxMembers: Number(t.max_members || DEFAULT_MAX_TEAM_MEMBERS),
    createdAt: toIso(t.created_at) || t.created_at,
    memberCount: countsMap.get(t.id) || 1,
  }));
};

export const subscribeToUserTeams = (
  userId: string,
  callback: (teams: Team[]) => void,
  onError?: (error: Error) => void,
) => {
  const refresh = createRefreshScheduler(
    () => getUserTeams(userId),
    callback,
    onError,
    '小队列表加载失败',
  );
  const channel = supabase
    .channel(`user_teams_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_members', filter: `user_id=eq.${userId}` },
      refresh.pull
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, refresh.pull)
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

export const createTeam = async (name: string, maxMembers = DEFAULT_MAX_TEAM_MEMBERS): Promise<Team> => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const cleanName = name.trim().slice(0, 50);
  if (!cleanName) throw new Error('小队名称不能为空');

  const { data, error } = await supabase.rpc('create_new_team', {
    p_name: cleanName,
    p_max_members: maxMembers,
  });
  if (error) throw error;
  if (!data) throw new Error('创建小队失败：服务器未返回结果');

  return {
    id: data.id,
    name: data.name,
    code: data.code,
    createdBy: data.created_by,
    maxMembers: Number(data.max_members || maxMembers),
    createdAt: toIso(data.created_at) || new Date().toISOString(),
    memberCount: 1,
  };
};

export const joinTeamByCode = async (code: string): Promise<Team> => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) throw new Error('请输入小队口令');

  const { data, error } = await supabase.rpc('join_team_by_code', {
    p_code: cleanCode,
  });
  if (error) throw error;
  if (!data) throw new Error('加入小队失败：服务器未返回结果');

  return {
    id: data.id,
    name: data.name,
    code: data.code,
    createdBy: data.created_by,
    maxMembers: Number(data.max_members || DEFAULT_MAX_TEAM_MEMBERS),
    createdAt: toIso(data.created_at) || new Date().toISOString(),
  };
};

export const leaveTeam = async (teamId: string): Promise<void> => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');
  if (!teamId) throw new Error('小队不存在');

  const { error } = await supabase.rpc('leave_team_by_id', { p_team_id: teamId });
  if (error) throw error;
};

export const getTeamDashboard = async (teamId: string): Promise<TeamDashboardData> => {
  const { data: teamRow, error: tErr } = await supabase
    .from('teams')
    .select('id, name, code, created_by, max_members, created_at')
    .eq('id', teamId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!teamRow) throw new Error('小队不存在');

  const { data: memberRows, error: mErr } = await supabase
    .from('team_members')
    .select('id, team_id, user_id, role, joined_at')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true });
  if (mErr) throw mErr;

  const memberUserIds = (memberRows || []).map((m: any) => m.user_id);
  const { data: profileRows, error: profileError } = memberUserIds.length > 0
    ? await supabase
        .from('public_profiles')
        .select('id, display_name, photo_url, streak, total_workouts, last_workout_date')
        .in('id', memberUserIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profilesMap = new Map((profileRows || []).map((p: any) => [p.id, p]));

  // Today check-in status calculation (last 36 hours query to cover local day boundaries)
  const todayStr = toLocalDateKey(new Date());
  const thirtySixHoursAgo = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data: recentLogs, error: recentLogsError } = memberUserIds.length > 0
    ? await supabase
        .from('workout_logs')
        .select('id, user_id, created_at')
        .in('user_id', memberUserIds)
        .gte('created_at', thirtySixHoursAgo)
    : { data: [], error: null };
  if (recentLogsError) throw recentLogsError;

  const todayLogsByUser = new Map<string, number>();
  (recentLogs || []).forEach((l: any) => {
    if (toLocalDateKey(l.created_at) === todayStr) {
      todayLogsByUser.set(l.user_id, (todayLogsByUser.get(l.user_id) || 0) + 1);
    }
  });

  let checkedInCount = 0;
  const members: TeamMember[] = (memberRows || []).map((mr: any) => {
    const prof = profilesMap.get(mr.user_id);
    const count = todayLogsByUser.get(mr.user_id) || 0;
    const hasCheckedIn = count > 0;
    if (hasCheckedIn) checkedInCount++;

    return {
      id: mr.id,
      teamId: mr.team_id,
      userId: mr.user_id,
      role: mr.role as 'owner' | 'member',
      joinedAt: toIso(mr.joined_at) || mr.joined_at,
      profile: prof
        ? {
            displayName: prof.display_name,
            photoURL: prof.photo_url,
            streak: Number(prof.streak || 0),
            totalWorkouts: Number(prof.total_workouts || 0),
            lastWorkoutDate: toIso(prof.last_workout_date),
          }
        : undefined,
      hasCheckedInToday: hasCheckedIn,
      todayWorkoutCount: count,
    };
  });

  const totalMembers = members.length;
  const attendanceRate = totalMembers > 0 ? Math.round((checkedInCount / totalMembers) * 100) : 0;

  const team: Team = {
    id: teamRow.id,
    name: teamRow.name,
    code: teamRow.code,
    createdBy: teamRow.created_by,
    maxMembers: Number(teamRow.max_members || DEFAULT_MAX_TEAM_MEMBERS),
    createdAt: toIso(teamRow.created_at) || teamRow.created_at,
    memberCount: totalMembers,
  };

  return {
    team,
    members,
    todayCheckinCount: checkedInCount,
    totalMembers,
    attendanceRate,
  };
};

export const subscribeToTeamDashboard = (
  teamId: string,
  callback: (data: TeamDashboardData) => void,
  onError?: (err: Error) => void
) => {
  if (!teamId) return () => {};

  const pull = () => {
    void getTeamDashboard(teamId)
      .then(callback)
      .catch((err) => {
        console.warn('Dashboard fetch error:', err);
        onError?.(err instanceof Error ? err : new Error('小队数据加载失败'));
      });
  };

  pull();
  const channel = supabase
    .channel(`team_dashboard_${teamId}_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: `team_id=eq.${teamId}` }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, pull)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};


export const waitForAuthReady = (timeoutMs = 3000) => new Promise<AppUser | null>((resolve) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      console.warn(`waitForAuthReady timed out after ${timeoutMs}ms`);
      resolve(cachedUser);
    }
  }, timeoutMs);

  supabase.auth.getSession()
    .then(({ data }) => {
      if (settled) return;
      const user = data?.session?.user;
      if (!user) {
        settled = true;
        clearTimeout(timer);
        cachedUser = null;
        persistCachedUser(null);
        resolve(null);
        return;
      }

      // Fast path: if cachedUser matches current session user, resolve immediately without blocking startup
      if (cachedUser && (cachedUser.id === user.id || cachedUser.uid === user.id)) {
        settled = true;
        clearTimeout(timer);
        resolve(cachedUser);
        void ensureUserProfile(user).catch(() => undefined);
        return;
      }

      ensureUserProfile(user)
        .then((p) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(p);
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          cachedUser = authOnlyUser(user);
          persistCachedUser(cachedUser);
          resolve(cachedUser);
        });
    })
    .catch((err) => {
      console.warn('waitForAuthReady getSession error:', err);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(cachedUser);
      }
    });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------


export const fetchNotifications = async (userId: string, limit = 50): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorPhoto: row.actor_photo,
    type: row.type,
    logId: row.log_id,
    content: row.content,
    logCategory: row.log_category,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  }));
};

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  limit = 50,
  onError?: (error: Error) => void,
) => {
  const refresh = createRefreshScheduler(
    () => fetchNotifications(userId, limit),
    callback,
    onError,
    '通知加载失败',
  );

  const channel = supabase
    .channel(`notifications_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      refresh.pull
    )
    .subscribe();

  return () => {
    refresh.dispose();
    void supabase.removeChannel(channel);
  };
};

export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    if (error) throw error;
  } catch (err) {
    console.warn('markNotificationAsRead error:', err);
  }
};

export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
  } catch (err) {
    console.warn('markAllNotificationsAsRead error:', err);
  }
};

export const deleteNotification = async (notificationId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);
    if (error) throw error;
  } catch (err) {
    console.warn('deleteNotification error:', err);
  }
};

export const submitFeedbackFn = async (feedback: {
  type: FeedbackType;
  content: string;
  contact?: string;
}): Promise<UserFeedback> => {
  const user = await currentAuthUser();
  if (!user) throw new Error('请先登录后再提交反馈');

  const content = feedback.content.trim();
  if (content.length < 2 || content.length > 2000) {
    throw new Error('反馈内容长度必须为 2 到 2000 个字符');
  }
  const contact = (feedback.contact || '').trim().slice(0, 200);
  const id = newId('fb');

  const { data, error } = await supabase
    .from('feedbacks')
    .insert({
      id,
      type: feedback.type,
      content,
      contact,
    })
    .select('id, user_id, user_name, user_email, type, content, contact, status, created_at')
    .single();
  if (error) throw error;
  if (!data) throw new Error('反馈提交失败：服务器未返回结果');

  return {
    id: data.id,
    userId: data.user_id,
    userName: data.user_name,
    userEmail: data.user_email,
    type: data.type as FeedbackType,
    content: data.content,
    contact: data.contact,
    status: data.status,
    createdAt: data.created_at,
  };
};

export const fetchUserFeedbacksFn = async (userId?: string): Promise<UserFeedback[]> => {
  const user = await currentAuthUser();
  if (!user || !userId || user.id !== userId) return [];

  const { data, error } = await supabase
    .from('feedbacks')
    .select('id, user_id, user_name, user_email, type, content, contact, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  return (data || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    type: r.type as FeedbackType,
    content: r.content,
    contact: r.contact,
    status: r.status,
    createdAt: r.created_at,
  }));
};

export default supabase;


