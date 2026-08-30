import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { WorkoutLog, WorkoutVisibility, Team, TeamMember, TeamDashboardData, AppNotification, FeedbackType, UserFeedback } from './types';
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
  streak: number;
  total_workouts: number;
  last_workout_date: string | null;
  prs: Record<string, number> | null;
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


let cachedUser: AppUser | null = null;

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
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function ensureUserProfile(user: User, extras: Partial<AppUser> = {}): Promise<AppUser> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    const profile = profileFromRow(data as ProfileRow, user);
    cachedUser = profile;
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

  const { data: created, error: reloadError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (reloadError) throw reloadError;

  const profile = profileFromRow(created as ProfileRow, user);
  cachedUser = profile;
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
      callback(null);
      return;
    }
    void ensureUserProfile(user)
      .then(callback)
      .catch((e) => {
        console.error('Load profile failed:', e);
        cachedUser = authOnlyUser(user);
        callback(cachedUser);
      });
  });
  return () => data.subscription.unsubscribe();
};

export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('User not found');
  const authUser = await currentAuthUser();
  return profileFromRow(data as ProfileRow, authUser?.id === userId ? authUser : null);
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
  }
};

export const syncUserStatsFromLogs = async (userId: string): Promise<AppUser> => {
  return getUserProfile(userId);
};

export const createWorkoutLog = async (logData: Record<string, unknown>) => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const logId = typeof logData.id === 'string' && logData.id ? logData.id : newId('log');
  const exercises = Array.isArray(logData.exercises) ? logData.exercises : [];
  const profile = cachedUser || await ensureUserProfile(user);

  const categoriesList = Array.isArray(logData.categories) && logData.categories.length > 0
    ? (logData.categories as string[])
    : (typeof logData.category === 'string' ? [logData.category] : ['Others']);

  const categoryStr = categoriesList.join(', ');
  const fallbackPrimaryCategory = categoriesList[0] || 'Others';
  const visibility: WorkoutVisibility = (
    logData.visibility === 'friends' || logData.visibility === 'private' ? logData.visibility : 'public'
  ) as WorkoutVisibility;

  let { error } = await supabase.from('workout_logs').insert({
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

  // Fallback retry if DB has strict check constraint on single category enum value
  if (error && error.code === '23514' && categoryStr !== fallbackPrimaryCategory) {
    const retryRes = await supabase.from('workout_logs').insert({
      id: logId,
      user_id: user.id,
      user_name: String(logData.userName || profile.displayName || 'FitGroup').slice(0, 50),
      user_photo: String(logData.userPhoto || profile.photoURL || ''),
      category: fallbackPrimaryCategory,
      exercises,
      note: String(logData.note || '').slice(0, 500),
      photo_url: String(logData.photoUrl || ''),
      visibility,
    });
    error = retryRes.error;
  }

  // Fallback retry without visibility column if database hasn't migrated yet
  if (error && error.code === '42703') {
    const retryWithoutVis = await supabase.from('workout_logs').insert({
      id: logId,
      user_id: user.id,
      user_name: String(logData.userName || profile.displayName || 'FitGroup').slice(0, 50),
      user_photo: String(logData.userPhoto || profile.photoURL || ''),
      category: categoryStr,
      exercises,
      note: String(logData.note || '').slice(0, 500),
      photo_url: String(logData.photoUrl || ''),
    });
    error = retryWithoutVis.error;
  }

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

  const { data: existing, error: readError } = await supabase
    .from('workout_logs')
    .select('id, user_id')
    .eq('id', workoutLogId)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new Error('打卡记录不存在');
  if (existing.user_id !== user.id) {
    throw new Error('只能编辑自己的打卡记录');
  }

  const payload: Record<string, unknown> = {};

  if ('exercises' in updates && Array.isArray(updates.exercises)) {
    payload.exercises = updates.exercises;
  }

  if ('categories' in updates || 'category' in updates) {
    const categoriesList = Array.isArray(updates.categories) && updates.categories.length > 0
      ? (updates.categories as string[])
      : (typeof updates.category === 'string' ? [updates.category] : ['Others']);
    payload.category = categoriesList.join(', ');
  }

  if ('note' in updates && typeof updates.note === 'string') {
    payload.note = updates.note.slice(0, 500);
  }

  if ('photoUrl' in updates && typeof updates.photoUrl === 'string') {
    payload.photo_url = updates.photoUrl;
  }

  if ('visibility' in updates && typeof updates.visibility === 'string') {
    const vis = updates.visibility;
    if (['public', 'friends', 'private'].includes(vis)) {
      payload.visibility = vis;
    }
  }

  let { error } = await supabase
    .from('workout_logs')
    .update(payload)
    .eq('id', workoutLogId);

  // Fallback retry if DB has strict check constraint on single category enum value
  if (error && error.code === '23514' && typeof payload.category === 'string' && payload.category.includes(',')) {
    const fallbackCategory = payload.category.split(',')[0].trim() || 'Others';
    const retryRes = await supabase
      .from('workout_logs')
      .update({ ...payload, category: fallbackCategory })
      .eq('id', workoutLogId);
    error = retryRes.error;
  }

  // Fallback if visibility column does not exist in legacy table
  if (error && error.code === '42703' && 'visibility' in payload) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.visibility;
    const retryRes = await supabase
      .from('workout_logs')
      .update(fallbackPayload)
      .eq('id', workoutLogId);
    error = retryRes.error;
  }

  if (error) throw error;
  return { id: workoutLogId };
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

export async function fetchPublicWorkoutLogs(maxCount = 30): Promise<WorkoutLog[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(maxCount);

  if (error) {
    if (error.code === '42703') {
      // Legacy table fallback without visibility column
      return fetchAllWorkoutLogsLegacy(maxCount);
    }
    throw error;
  }
  return (data as WorkoutLogRow[]).map(normalizeLog);
}

async function fetchAllWorkoutLogsLegacy(maxCount: number): Promise<WorkoutLog[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(maxCount);
  if (error) throw error;
  return (data as WorkoutLogRow[]).map(normalizeLog);
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

  if (error) {
    if (error.code === '42703') {
      const { data: legacyData, error: fbError } = await supabase
        .from('workout_logs')
        .select('*')
        .in('user_id', memberIds)
        .order('created_at', { ascending: false })
        .limit(maxCount);
      if (fbError) throw fbError;
      return (legacyData as WorkoutLogRow[]).map(normalizeLog);
    }
    throw error;
  }
  return (data as WorkoutLogRow[]).map(normalizeLog);
}

export async function fetchMyWorkoutLogs(userId: string, maxCount = 100): Promise<WorkoutLog[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(maxCount);
  if (error) throw error;
  return (data as WorkoutLogRow[]).map(normalizeLog);
}

export const subscribeToPublicWorkoutLogs = (
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 30,
) => {
  const pull = () => {
    void fetchPublicWorkoutLogs(maxCount)
      .then(callback)
      .catch((e) => {
        console.error('Public workout logs listen error:', e);
        onError?.(e instanceof Error ? e : new Error('全员广场动态加载失败'));
        callback([]);
      });
  };

  pull();
  const channel = supabase
    .channel(`public_feed_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, pull)
    .subscribe();

  return () => {
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

  const pull = () => {
    void fetchTeamWorkoutLogs(teamId, maxCount)
      .then(callback)
      .catch((e) => {
        console.error('Team workout logs listen error:', e);
        onError?.(e instanceof Error ? e : new Error('小队动态加载失败'));
        callback([]);
      });
  };

  pull();
  const channel = supabase
    .channel(`team_feed_${teamId}_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, pull)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};

export const subscribeToMyWorkoutLogs = (
  userId: string,
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 100,
) => {
  const pull = () => {
    void fetchMyWorkoutLogs(userId, maxCount)
      .then(callback)
      .catch((e) => {
        console.error('My workout logs listen error:', e);
        onError?.(e instanceof Error ? e : new Error('个人打卡记录加载失败'));
        callback([]);
      });
  };

  pull();
  const channel = supabase
    .channel(`my_feed_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_logs', filter: `user_id=eq.${userId}` },
      pull
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, pull)
    .subscribe();

  return () => {
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

export const subscribeToComments = (workoutLogId: string, callback: (comments: unknown[]) => void) => {
  const pull = () => {
    void supabase
      .from('workout_comments')
      .select('*')
      .eq('log_id', workoutLogId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          callback([]);
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
      });
  };

  pull();
  const channel = supabase
    .channel(`comments_${workoutLogId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_comments', filter: `log_id=eq.${workoutLogId}` },
      pull,
    )
    .subscribe();

  return () => {
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
    .from('profiles')
    .select('*')
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

export const subscribeToLeaderboard = (callback: (users: AppUser[]) => void, maxCount = 10) => {
  const pull = () => {
    void getLeaderboard(maxCount).then(callback).catch(() => callback([]));
  };

  pull();
  const channel = supabase
    .channel(`leaderboard_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, pull)
    .subscribe();

  return () => {
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

export const getUserWorkoutLogs = async (userId: string, maxCount = 100): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(maxCount);
    if (error) throw error;
    return (data as WorkoutLogRow[]).map(normalizeLog);
  } catch (err) {
    console.warn('Failed to get user workout logs:', err);
    return [];
  }
};

export const subscribeToUserWorkoutLogs = (
  userId: string,
  callback: (logs: any[]) => void,
  maxCount = 100
) => {
  const pull = () => {
    void getUserWorkoutLogs(userId, maxCount).then(callback).catch(() => callback([]));
  };

  pull();
  const channel = supabase
    .channel(`user_workout_logs_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_logs', filter: `user_id=eq.${userId}` },
      pull
    )
    .subscribe();

  return () => {
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
  try {
    const { data: memberships, error: mErr } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId);
    if (mErr) {
      if (mErr.code === '42P01') return []; // Table doesn't exist yet
      throw mErr;
    }
    if (!memberships || memberships.length === 0) return [];

    const teamIds = memberships.map((m: any) => m.team_id);
    const { data: teams, error: tErr } = await supabase
      .from('teams')
      .select('*')
      .in('id', teamIds)
      .order('created_at', { ascending: false });
    if (tErr) throw tErr;

    // Get member counts for each team
    const { data: allMembers } = await supabase
      .from('team_members')
      .select('team_id')
      .in('team_id', teamIds);
    const countsMap = new Map<string, number>();
    (allMembers || []).forEach((m: any) => {
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
  } catch (err) {
    console.warn('Failed to get user teams:', err);
    return [];
  }
};

export const subscribeToUserTeams = (
  userId: string,
  callback: (teams: Team[]) => void,
) => {
  const pull = () => {
    void getUserTeams(userId).then(callback).catch(() => callback([]));
  };

  pull();
  const channel = supabase
    .channel(`user_teams_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_members', filter: `user_id=eq.${userId}` },
      pull
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, pull)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};

export const createTeam = async (name: string, maxMembers = DEFAULT_MAX_TEAM_MEMBERS): Promise<Team> => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const cleanName = name.trim().slice(0, 50);
  if (!cleanName) throw new Error('小队名称不能为空');

  // Try RPC function first
  try {
    const { data, error } = await supabase.rpc('create_new_team', {
      p_name: cleanName,
      p_max_members: maxMembers,
    });
    if (!error && data) {
      return {
        id: data.id,
        name: data.name,
        code: data.code,
        createdBy: data.created_by,
        maxMembers: Number(data.max_members || maxMembers),
        createdAt: toIso(data.created_at) || new Date().toISOString(),
        memberCount: 1,
      };
    }
  } catch (rpcErr) {
    console.warn('RPC create_new_team failed, fallback to client table insert:', rpcErr);
  }

  // Fallback client-side generation and insert
  const teamId = newId('team');
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let codeSuffix = '';
  for (let i = 0; i < 4; i++) {
    codeSuffix += chars[Math.floor(Math.random() * chars.length)];
  }
  const code = `FIT-${codeSuffix}`;

  const { data: createdTeam, error: tErr } = await supabase
    .from('teams')
    .insert({
      id: teamId,
      name: cleanName,
      code,
      created_by: user.id,
      max_members: maxMembers,
    })
    .select()
    .single();
  if (tErr) throw tErr;

  const { error: mErr } = await supabase.from('team_members').insert({
    id: newId('tm'),
    team_id: teamId,
    user_id: user.id,
    role: 'owner',
  });
  if (mErr) throw mErr;

  return {
    id: createdTeam.id,
    name: createdTeam.name,
    code: createdTeam.code,
    createdBy: createdTeam.created_by,
    maxMembers: Number(createdTeam.max_members || maxMembers),
    createdAt: toIso(createdTeam.created_at) || new Date().toISOString(),
    memberCount: 1,
  };
};

export const joinTeamByCode = async (code: string): Promise<Team> => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) throw new Error('请输入小队口令');

  // Try RPC function first
  try {
    const { data, error } = await supabase.rpc('join_team_by_code', {
      p_code: cleanCode,
    });
    if (error) throw new Error(error.message || '加入小队失败');
    if (data) {
      return {
        id: data.id,
        name: data.name,
        code: data.code,
        createdBy: data.created_by,
        maxMembers: Number(data.max_members || DEFAULT_MAX_TEAM_MEMBERS),
        createdAt: toIso(data.created_at) || new Date().toISOString(),
      };
    }
  } catch (rpcErr) {
    if (rpcErr instanceof Error && rpcErr.message && !rpcErr.message.includes('function') && !rpcErr.message.includes('42883')) {
      throw rpcErr;
    }
  }

  // Fallback client check & insert
  const { data: team, error: findErr } = await supabase
    .from('teams')
    .select('*')
    .ilike('code', cleanCode)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!team) throw new Error('无效的小队口令，请核对后重试');

  const { data: existingMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', team.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingMember) throw new Error('您已经是该小队的成员，无需重复加入');

  const { count, error: countErr } = await supabase
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', team.id);
  if (countErr) throw countErr;
  if (typeof count === 'number' && count >= team.max_members) {
    throw new Error(`该小队人数已达上限（${team.max_members}人）`);
  }

  const { error: joinErr } = await supabase.from('team_members').insert({
    id: newId('tm'),
    team_id: team.id,
    user_id: user.id,
    role: 'member',
  });
  if (joinErr) throw joinErr;

  return {
    id: team.id,
    name: team.name,
    code: team.code,
    createdBy: team.created_by,
    maxMembers: Number(team.max_members || DEFAULT_MAX_TEAM_MEMBERS),
    createdAt: toIso(team.created_at) || new Date().toISOString(),
  };
};

export const leaveTeam = async (teamId: string): Promise<void> => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  try {
    const { error } = await supabase.rpc('leave_team_by_id', { p_team_id: teamId });
    if (!error) return;
  } catch (rpcErr) {
    console.warn('RPC leave_team_by_id failed, fallback:', rpcErr);
  }

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', user.id);
  if (error) throw error;
};

export const getTeamDashboard = async (teamId: string): Promise<TeamDashboardData> => {
  const { data: teamRow, error: tErr } = await supabase
    .from('teams')
    .select('*')
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
  const { data: profileRows } = memberUserIds.length > 0
    ? await supabase.from('profiles').select('*').in('id', memberUserIds)
    : { data: [] };
  const profilesMap = new Map((profileRows || []).map((p: any) => [p.id, p]));

  // Today check-in status calculation (last 36 hours query to cover local day boundaries)
  const todayStr = toLocalDateKey(new Date());
  const thirtySixHoursAgo = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data: recentLogs } = memberUserIds.length > 0
    ? await supabase
        .from('workout_logs')
        .select('id, user_id, created_at')
        .in('user_id', memberUserIds)
        .gte('created_at', thirtySixHoursAgo)
    : { data: [] };

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
        resolve(null);
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
          resolve(cachedUser);
        });
    })
    .catch((err) => {
      console.warn('waitForAuthReady getSession error:', err);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------


export const fetchNotifications = async (userId: string, limit = 50): Promise<AppNotification[]> => {
  try {
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
  } catch (err) {
    console.warn('fetchNotifications error:', err);
    return [];
  }
};

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  limit = 50
) => {
  const pull = () => {
    void fetchNotifications(userId, limit).then(callback);
  };

  pull();

  const channel = supabase
    .channel(`notifications_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      pull
    )
    .subscribe();

  return () => {
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
  const user = cachedUser || getCurrentUser();
  const id = newId('fb');
  const now = new Date().toISOString();

  const item: UserFeedback = {
    id,
    userId: user?.id || user?.uid,
    userName: user?.displayName || '健友',
    userEmail: user?.email || '',
    type: feedback.type,
    content: feedback.content,
    contact: feedback.contact || '',
    status: 'pending',
    createdAt: now,
  };

  try {
    const { error } = await supabase.from('feedbacks').insert({
      id: item.id,
      user_id: item.userId || null,
      user_name: item.userName,
      user_email: item.userEmail,
      type: item.type,
      content: item.content,
      contact: item.contact,
      status: item.status,
      created_at: item.createdAt,
    });
    if (error) {
      console.warn('Supabase insert feedback warning:', error);
    }
  } catch (err) {
    console.warn('submitFeedbackFn error, saving locally:', err);
  }

  // Also cache locally
  try {
    const raw = localStorage.getItem('fitgroup_feedbacks');
    const local: UserFeedback[] = raw ? JSON.parse(raw) : [];
    local.unshift(item);
    localStorage.setItem('fitgroup_feedbacks', JSON.stringify(local.slice(0, 30)));
  } catch (err) {
    console.warn('localStorage save feedback error:', err);
  }

  return item;
};

export const fetchUserFeedbacksFn = async (userId?: string): Promise<UserFeedback[]> => {
  let list: UserFeedback[] = [];

  if (userId) {
    try {
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data && data.length > 0) {
        list = data.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          userEmail: r.user_email,
          type: r.type,
          content: r.content,
          contact: r.contact,
          status: r.status,
          createdAt: r.created_at,
        }));
      }
    } catch (err) {
      console.warn('fetchUserFeedbacksFn network warning:', err);
    }
  }

  if (list.length === 0) {
    try {
      const raw = localStorage.getItem('fitgroup_feedbacks');
      if (raw) {
        const local = JSON.parse(raw);
        if (Array.isArray(local)) {
          list = local;
        }
      }
    } catch {}
  }

  return list;
};

export default supabase;


