import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

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
};

type ProfileRow = {
  id: string;
  display_name: string;
  photo_url: string;
  streak: number;
  total_workouts: number;
  last_workout_date: string | null;
  prs: Record<string, number> | null;
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

  const { error } = await supabase.from('workout_logs').insert({
    id: logId,
    user_id: user.id,
    user_name: String(logData.userName || profile.displayName || 'FitGroup').slice(0, 50),
    user_photo: String(logData.userPhoto || profile.photoURL || ''),
    category: logData.category,
    exercises,
    note: String(logData.note || '').slice(0, 500),
    photo_url: String(logData.photoUrl || ''),
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

function normalizeLog(row: WorkoutLogRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.user_photo,
    timestamp: toIso(row.created_at) || new Date().toISOString(),
    category: row.category,
    exercises: Array.isArray(row.exercises) ? row.exercises : [],
    note: row.note || '',
    photoUrl: row.photo_url || '',
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
  };
}

async function fetchWorkoutLogs(maxCount: number) {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(maxCount);
  if (error) throw error;
  return (data as WorkoutLogRow[]).map(normalizeLog);
}

export const subscribeToWorkoutLogs = (
  callback: (logs: unknown[]) => void,
  onError?: (error: Error) => void,
  maxCount = 30,
) => {
  const pull = () => {
    void fetchWorkoutLogs(maxCount)
      .then(callback)
      .catch((e) => {
        console.error('Workout logs listen error:', e);
        onError?.(e instanceof Error ? e : new Error('动态加载失败'));
        callback([]);
      });
  };

  pull();
  const channel = supabase
    .channel(`workout_logs_feed_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, pull)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};

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
      .eq('category', category)
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

export const waitForAuthReady = () => new Promise<AppUser | null>((resolve) => {
  void supabase.auth.getSession().then(({ data }) => {
    const user = data.session?.user;
    if (!user) {
      cachedUser = null;
      resolve(null);
      return;
    }
    ensureUserProfile(user).then(resolve).catch(() => {
      cachedUser = authOnlyUser(user);
      resolve(cachedUser);
    });
  });
});

export default supabase;
