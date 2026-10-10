import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { WorkoutLog, WorkoutVisibility, Team, TeamMember, TeamDashboardData, AppNotification, FeedbackType, UserFeedback } from './types';
import { WorkoutCategory } from './types';
import { parseCategories } from './constants/workoutPresets';
import { fetchAllPages } from './utils/pagination';
import { executeWorkoutLogUpdate, sanitizeExercisesForDb } from './utils/workoutLogUpdate';
export { sanitizeExercisesForDb } from './utils/workoutLogUpdate';
import { DEFAULT_MAX_TEAM_MEMBERS } from './constants/teamConfig';
import { updateCachedLogsProfile } from './utils/feedCache';
import { readRequest, type ReadRequestOptions, withCallerSignal } from './utils/request';
import { startStage } from './utils/startupMetrics';
export { readRequest, REQUEST_TIMEOUT_MS, type ReadRequestOptions } from './utils/request';


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
  categories?: unknown;
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
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage;
    }
  } catch {
    // Window localStorage blocked or sandbox restricted
  }
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any)?.localStorage && typeof (globalThis as any).localStorage.getItem === 'function') {
      return (globalThis as any).localStorage;
    }
  } catch {
    // globalThis localStorage blocked
  }
  return null;
}

function loadCachedUserFromStorage(expectedUid?: string): AppUser | null {
  try {
    const storage = getSafeLocalStorage();
    if (!storage) return null;
    const raw = storage.getItem(CACHED_USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.id || parsed.uid)) {
        if (!expectedUid || ((parsed.id === expectedUid || parsed.uid === expectedUid) && (!parsed.id || parsed.id === expectedUid) && (!parsed.uid || parsed.uid === expectedUid))) {
          return parsed;
        }
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

// Real session only: never assume authentication from cached data without a verified session
let cachedUser: AppUser | null = null;
let activeAuthUid: string | null = null;
let authGeneration = 0;
let currentProfileAbortController: AbortController | null = null;

// Singleflight per UID: deduplicate concurrent profile requests
const profileSingleflightMap = new Map<string, Promise<AppUser>>();

// Set of UIDs whose full profile is ready
const readyProfiles = new Set<string>();

// Subscribed auth listeners
const authStateCallbacks = new Set<(user: AppUser | null) => void>();

function handleAuthSignOut(): void {
  authGeneration++;
  if (currentProfileAbortController) {
    try {
      currentProfileAbortController.abort();
    } catch {
      // ignore
    }
    currentProfileAbortController = null;
  }
  profileSingleflightMap.clear();
  readyProfiles.clear();
  activeAuthUid = null;
  cachedUser = null;
  persistCachedUser(null);
}

function handleAuthSessionUser(user: User): AppUser {
  if (activeAuthUid !== user.id) {
    // Account switch: increment generation and abort pending profile requests
    authGeneration++;
    if (currentProfileAbortController) {
      try {
        currentProfileAbortController.abort();
      } catch {
        // ignore
      }
      currentProfileAbortController = null;
    }
    profileSingleflightMap.clear();
    readyProfiles.clear();
    activeAuthUid = user.id;
  }

  // Auth-only immediate: construct immediate user object
  const baseAuth = authOnlyUser(user);
  const stored = loadCachedUserFromStorage(user.id);
  const immediate = stored ? { ...baseAuth, ...stored, id: user.id, uid: user.id, email: user.email } : baseAuth;
  cachedUser = immediate;
  return immediate;
}

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
  return null;
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
  let inFlight = false;
  let refreshPending = false;

  const execute = () => {
    if (disposed) return;
    if (inFlight) { refreshPending = true; return; }
    inFlight = true;
    const requestedVersion = ++version;
    void Promise.resolve().then(fetcher)
      .then((value) => {
        if (!disposed && requestedVersion === version) onData(value);
      })
      .catch((error) => {
        if (!disposed && requestedVersion === version) {
          onError?.(error instanceof Error ? error : new Error(fallbackMessage));
        }
      })
      .finally(() => {
        inFlight = false;
        if (refreshPending && !disposed) { refreshPending = false; pull(); }
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

async function getMyProfileRow(signal?: AbortSignal): Promise<ProfileRow | null> {
  const { data, error } = await readRequest('profile', (deadlineSignal) =>
    supabase.rpc('get_my_profile').abortSignal(deadlineSignal), { signal });
  if (error) throw error;
  return (data || null) as ProfileRow | null;
}

export const isProfileReady = (userId?: string): boolean => {
  const uid = userId || activeAuthUid || cachedUser?.uid || cachedUser?.id;
  return !!uid && readyProfiles.has(uid);
};

async function requireProfileForWrite(user: User): Promise<AppUser> {
  const profile = readyProfiles.has(user.id) && cachedUser?.uid === user.id
    ? cachedUser
    : await ensureUserProfile(user);
  if (activeAuthUid !== user.id || !readyProfiles.has(user.id)) {
    throw new Error('用户资料尚未就绪，请稍后重试');
  }
  return profile;
}

export const waitForProfileReady = async (userId?: string, timeoutMs = 3000): Promise<AppUser | null> => {
  const uid = userId || activeAuthUid || cachedUser?.uid || cachedUser?.id;
  if (!uid) return cachedUser;

  if (readyProfiles.has(uid) && cachedUser && (cachedUser.uid === uid || cachedUser.id === uid)) {
    return cachedUser;
  }

  const inFlight = profileSingleflightMap.get(uid);
  if (inFlight) {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<null>((res) => {
        timer = setTimeout(() => res(null), timeoutMs);
      });
      const result = await Promise.race([
        inFlight.catch(() => null),
        timeoutPromise,
      ]);
      if (timer) clearTimeout(timer);
      if (result) return result;
    } catch {
      // Fallback
    }
  }

  return cachedUser;
};

export async function ensureUserProfile(user: User, extras: Partial<AppUser> = {}): Promise<AppUser> {
  const uid = user.id;

  // Singleflight per UID: deduplicate concurrent requests
  const inFlight = profileSingleflightMap.get(uid);
  if (inFlight) {
    return inFlight;
  }

  const controller = new AbortController();
  currentProfileAbortController = controller;
  const gen = authGeneration;

  const fetchPromise = (async () => {
    try {
      const existing = await getMyProfileRow(controller.signal);

      // Generation guard: abort on account switch
      if (controller.signal.aborted || gen !== authGeneration || (activeAuthUid && activeAuthUid !== uid)) {
        throw new Error('Profile fetch aborted: account switch or session change');
      }

      if (existing) {
        if (existing.id !== uid) throw new Error('用户资料与当前会话不匹配');
        const profile = profileFromRow(existing, user);
        if (gen === authGeneration && activeAuthUid === uid) {
          cachedUser = profile;
          persistCachedUser(profile);
          readyProfiles.add(uid);
          for (const cb of authStateCallbacks) {
            try { cb(profile); } catch { /* ignore */ }
          }
        }
        return profile;
      }

      if (controller.signal.aborted || gen !== authGeneration || (activeAuthUid && activeAuthUid !== uid)) {
        throw new Error('Profile fetch aborted: account switch or session change');
      }

      const displayName = (extras.displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'FitGroup')
        .toString()
        .slice(0, 50);
      const photoURL = extras.photoURL || user.user_metadata?.photo_url || '';

      // Execute once; cancellation is not an automatic retry of this write.
      const { error: insertError } = await readRequest('profile-create', (signal) =>
        supabase.from('profiles').insert({
          id: user.id,
          display_name: displayName,
          photo_url: photoURL,
        }).abortSignal(signal), { signal: controller.signal });

      if (insertError && insertError.code !== '23505') throw insertError;

      if (controller.signal.aborted || gen !== authGeneration || (activeAuthUid && activeAuthUid !== uid)) {
        throw new Error('Profile fetch aborted: account switch or session change');
      }

      const created = await getMyProfileRow(controller.signal);
      if (!created || created.id !== uid) throw new Error('用户资料创建后无法读取');

      if (controller.signal.aborted || gen !== authGeneration || (activeAuthUid && activeAuthUid !== uid)) {
        throw new Error('Profile fetch aborted: account switch or session change');
      }

      const profile = profileFromRow(created, user);
      if (gen === authGeneration && activeAuthUid === uid) {
        cachedUser = profile;
        persistCachedUser(profile);
        readyProfiles.add(uid);
        for (const cb of authStateCallbacks) {
          try { cb(profile); } catch { /* ignore */ }
        }
      }
      return profile;
    } finally {
      if (currentProfileAbortController === controller) profileSingleflightMap.delete(uid);
      if (currentProfileAbortController === controller) {
        currentProfileAbortController = null;
      }
    }
  })();

  profileSingleflightMap.set(uid, fetchPromise);
  return fetchPromise;
}

function mapAuthError(error: unknown): Error {
  const err = error as { code?: string; message?: string; status?: number; name?: string };
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
  if (err.name === 'TimeoutError' || message.includes('timed out') || message.includes('timeout')) {
    return new Error('请求超时，请检查网络后重试；注册是否成功请先检查确认邮件');
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
    const immediateUser = handleAuthSessionUser(data.user);
    void ensureUserProfile(data.user, { displayName: name }).catch((e) => {
      console.warn('Background profile create failed:', e);
    });
    return immediateUser;
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
    if (!data.user || !data.session) throw new Error('登录失败，请重试');
    const immediateUser = handleAuthSessionUser(data.user);
    void ensureUserProfile(data.user).catch((e) => {
      console.warn('Background profile load failed:', e);
    });
    return immediateUser;
  } catch (e) {
    throw mapAuthError(e);
  }
};

export const logout = async () => {
  handleAuthSignOut();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return null;
};

export const getCurrentUser = () => cachedUser;

export const onAuthStateChangedFn = (callback: (user: AppUser | null) => void) => {
  authStateCallbacks.add(callback);

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    if (!user) {
      handleAuthSignOut();
      callback(null);
      return;
    }

    // Real session confirmed: auth-only immediate
    const immediateUser = handleAuthSessionUser(user);
    callback(immediateUser);

    // Leave the Supabase auth callback/lock before making SDK requests.
    const generation = authGeneration;
    setTimeout(() => {
      if (generation !== authGeneration || activeAuthUid !== user.id) return;
      void ensureUserProfile(user).catch((e) => console.warn('Load profile failed:', e));
    }, 0);
  });

  return () => {
    authStateCallbacks.delete(callback);
    data.subscription.unsubscribe();
  };
};

export const getUserProfile = async (userId: string) => {
  const authUser = await currentAuthUser();
  if (authUser?.id === userId) {
    const shared = profileSingleflightMap.get(userId);
    if (shared) return shared;
    const generation = authGeneration;
    const data = await getMyProfileRow(currentProfileAbortController?.signal);
    if (!data) throw new Error('User not found');
    const profile = profileFromRow(data, authUser);
    if (activeAuthUid === userId && generation === authGeneration) {
      cachedUser = profile;
      persistCachedUser(profile);
      readyProfiles.add(userId);
    }
    return profile;
  }

  const { data, error } = await readRequest('public-profile', (signal) =>
    supabase.from('public_profiles')
      .select('id, display_name, photo_url, streak, total_workouts, last_workout_date')
      .eq('id', userId)
      .abortSignal(signal).maybeSingle());
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

  if (cachedUser && (cachedUser.uid === userId || cachedUser.id === userId)) {
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
    readyProfiles.add(userId);
  }

  // Synchronize updated display name and avatar to historical workout_logs & workout_comments
  if (typeof payload.display_name === 'string' || typeof payload.photo_url === 'string') {
    const logsPayload: Record<string, unknown> = {};
    if (typeof payload.display_name === 'string') logsPayload.user_name = payload.display_name;
    if (typeof payload.photo_url === 'string') logsPayload.user_photo = payload.photo_url;

    try {
      const { error: logsError } = await supabase
        .from('workout_logs')
        .update(logsPayload)
        .eq('user_id', userId);
      if (logsError) {
        console.warn('Syncing user_name to workout_logs returned error:', logsError);
      }
    } catch (e) {
      console.warn('Syncing user_name to workout_logs failed:', e);
    }

    try {
      await supabase
        .from('workout_comments')
        .update(logsPayload)
        .eq('user_id', userId);
    } catch (e) {
      console.warn('Syncing user_name to workout_comments failed:', e);
    }

    // Synchronize local SWR cache across public & personal feeds
    updateCachedLogsProfile(userId, {
      userName: typeof payload.display_name === 'string' ? payload.display_name : undefined,
      userPhoto: typeof payload.photo_url === 'string' ? payload.photo_url : undefined,
    });

    // Broadcast in-memory event to immediately update Feed, Team, and Statistics components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fitgroup:user-profile-updated', {
          detail: {
            userId,
            displayName: payload.display_name,
            photoURL: payload.photo_url,
          },
        })
      );
    }
  }

  return getUserProfile(userId);
};

export const syncUserStatsFromLogs = async (userId: string): Promise<AppUser> => {
  return getUserProfile(userId);
};

export const createWorkoutLog = async (logData: Record<string, unknown>) => {
  const user = await currentAuthUser();
  if (!user) throw new Error('未登录');

  const logId = typeof logData.id === 'string' && logData.id ? logData.id : newId('log');
  const exercises = sanitizeExercisesForDb(logData.exercises);
  let trainingTimestamp: string | undefined;
  if (logData.timestamp !== undefined) {
    const date = typeof logData.timestamp === 'string' ? new Date(logData.timestamp) : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) {
      throw new Error('请选择有效且不晚于当前时间的训练时间');
    }
    trainingTimestamp = date.toISOString();
  }

  // A cached/auth-only name is not sufficient for a profile-dependent write.
  const profile = await requireProfileForWrite(user);

  const categoriesList = Array.isArray(logData.categories) && logData.categories.length > 0
    ? (logData.categories as string[])
    : (typeof logData.category === 'string' ? [logData.category] : ['Others']);

  const categoryStr = categoriesList.join(', ');
  const visibility: WorkoutVisibility = (
    logData.visibility === 'friends' || logData.visibility === 'private' ? logData.visibility : 'public'
  ) as WorkoutVisibility;

  const { error } = await supabase.from('workout_logs').insert({
    id: logId,
    ...(trainingTimestamp ? { created_at: trainingTimestamp } : {}),
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

export function normalizeLog(row: WorkoutLogRow): WorkoutLog {
  const rawVis = (row.visibility || '').toLowerCase();
  const visibility: WorkoutVisibility = (
    rawVis === 'friends' || rawVis === 'private' ? rawVis : 'public'
  );

  // Persist multi-category data as a comma-joined `category` string in the DB.
  // Rehydrate the structured `categories` array here so callers (feed, export)
  // can rely on it without re-parsing legacy strings.
  const explicitCategories = Array.isArray(row.categories)
    ? (row.categories as unknown[]).filter(
        (c): c is WorkoutCategory => typeof c === 'string' && Object.values(WorkoutCategory).includes(c as WorkoutCategory),
      )
    : [];
  const categories = explicitCategories.length > 0
    ? Array.from(new Set(explicitCategories))
    : parseCategories(row.category);

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userPhoto: row.user_photo,
    timestamp: toIso(row.created_at) || new Date().toISOString(),
    category: row.category,
    categories,
    exercises: Array.isArray(row.exercises) ? row.exercises as any : [],
    note: row.note || '',
    photoUrl: row.photo_url || '',
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    visibility,
  };
}

export async function attachCurrentUserLikeState(
  logs: WorkoutLog[],
  options?: ReadRequestOptions,
): Promise<WorkoutLog[]> {
  if (logs.length === 0) return logs;
  const userId = cachedUser?.uid || cachedUser?.id || (await currentAuthUser())?.id;
  if (!userId) return logs;

  try {
    const { data, error } = await readRequest(
      'attachCurrentUserLikeState',
      (signal) =>
        supabase
          .from('workout_likes')
          .select('log_id')
          .eq('user_id', userId)
          .in('log_id', logs.map((log) => log.id))
          .abortSignal(signal),
      { signal: options?.signal, timeoutMs: options?.timeoutMs ?? 5000 },
    );

    if (error) {
      // Like state is auxiliary; keep the feed usable and let individual LogCard fallback check
      console.warn('Batch like state load failed:', error);
      return logs;
    }

    const likedIds = new Set((data || []).map((row: { log_id: string }) => row.log_id));
    return logs.map((log) => ({ ...log, isLiked: likedIds.has(log.id) }));
  } catch (err: any) {
    if (options?.signal?.aborted) {
      throw err;
    }
    console.warn('Batch like state load failed or timed out:', err);
    return logs;
  }
}

interface FeedSubscriber {
  id: string;
  callback: (logs: WorkoutLog[]) => void;
  onError?: (error: Error) => void;
}

class SharedFeedScheduler {
  private subscribers = new Map<string, Map<string, FeedSubscriber>>();
  private inFlight = new Map<string, Promise<WorkoutLog[]>>();
  private controllers = new Map<string, AbortController>();
  private likeControllers = new Map<string, AbortController>();
  private latestVersion = new Map<string, number>();
  private latestCommittedVersion = new Map<string, number>();
  private latestLogs = new Map<string, WorkoutLog[]>();
  private channels = new Map<string, any>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  nextVersion(domainKey: string): number {
    const next = (this.latestVersion.get(domainKey) || 0) + 1;
    this.latestVersion.set(domainKey, next);
    return next;
  }

  async fetch(
    domainKey: string,
    fetcher: (signal: AbortSignal) => Promise<WorkoutLog[]>,
    options?: ReadRequestOptions,
  ): Promise<WorkoutLog[]> {
    // Single latest / dedup feed reads: coalesce concurrent calls into single flight
    const existing = this.inFlight.get(domainKey);
    if (existing && !options?.force) {
      return withCallerSignal(existing, options?.signal);
    }

    const version = this.nextVersion(domainKey);
    this.controllers.get(domainKey)?.abort(new DOMException('Read superseded', 'AbortError'));
    this.likeControllers.get(domainKey)?.abort(new Error('Likes superseded'));
    const controller = new AbortController();
    this.controllers.set(domainKey, controller);

    // Defer execution until flight has been stored, including synchronous throws.
    const flight = Promise.resolve().then(async () => {
      try {
        const logs = await readRequest(
          `feed:${domainKey}`,
          (signal) => fetcher(signal),
          { ...options, signal: controller.signal },
        );

        // Also reject responses superseded before the replacement has committed.
        if (version !== this.latestVersion.get(domainKey)) {
          return this.latestLogs.get(domainKey) || logs;
        }

        this.latestCommittedVersion.set(domainKey, version);
        this.latestLogs.set(domainKey, logs);

        // Immediately notify active subscribers with logs BEFORE batch likes!
        this.notifySubscribers(domainKey, logs);

        // Asynchronously attach like state for active subscribers with bounded cancellation
        const subs = this.subscribers.get(domainKey);
        if (subs && subs.size > 0 && logs.length > 0) {
          const likesController = new AbortController();
          this.likeControllers.set(domainKey, likesController);
          const uid = activeAuthUid;
          void attachCurrentUserLikeState(logs, { timeoutMs: 4000, signal: likesController.signal })
            .then((logsWithLikes) => {
              if (this.latestVersion.get(domainKey) === version && activeAuthUid === uid && !likesController.signal.aborted) {
                this.latestLogs.set(domainKey, logsWithLikes);
                this.notifySubscribers(domainKey, logsWithLikes);
              }
            })
            .catch(() => undefined);
        }

        // Feed fetch returns logs before batch likes!
        return logs;
      } finally {
        if (this.inFlight.get(domainKey) === flight) {
          this.inFlight.delete(domainKey);
        }
      }
    });

    this.inFlight.set(domainKey, flight);
    return withCallerSignal(flight, options?.signal);
  }

  private notifySubscribers(domainKey: string, logs: WorkoutLog[]) {
    const domainSubs = this.subscribers.get(domainKey);
    if (!domainSubs) return;
    for (const sub of Array.from(domainSubs.values())) {
      try {
        sub.callback(logs);
      } catch (e) {
        console.error('Feed subscriber error:', e);
      }
    }
  }

  private notifyError(domainKey: string, error: Error) {
    if (error.name === 'AbortError') return;
    const domainSubs = this.subscribers.get(domainKey);
    if (!domainSubs) return;
    for (const sub of Array.from(domainSubs.values())) {
      try {
        sub.onError?.(error);
      } catch (e) {
        console.error('Feed subscriber error callback failed:', e);
      }
    }
  }

  subscribe(
    domainKey: string,
    fetcher: (signal: AbortSignal) => Promise<WorkoutLog[]>,
    setupChannel: (pull: () => void) => any,
    callback: (logs: WorkoutLog[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    let domainSubs = this.subscribers.get(domainKey);
    if (!domainSubs) {
      domainSubs = new Map();
      this.subscribers.set(domainKey, domainSubs);
    }

    const subId = newId('sub');
    domainSubs.set(subId, { id: subId, callback, onError });

    const pull = () => {
      const existingTimer = this.debounceTimers.get(domainKey);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        this.debounceTimers.delete(domainKey);
        void this.fetch(domainKey, fetcher).catch((err) => {
          this.notifyError(domainKey, err instanceof Error ? err : new Error(String(err)));
        });
      }, 120);
      this.debounceTimers.set(domainKey, timer);
    };

    if (!this.channels.has(domainKey)) {
      const channel = setupChannel(pull);
      this.channels.set(domainKey, channel);
    }

    // Immediately trigger initial fetch
    void this.fetch(domainKey, fetcher).catch((err) => {
      this.notifyError(domainKey, err instanceof Error ? err : new Error(String(err)));
    });

    return () => {
      const currentSubs = this.subscribers.get(domainKey);
      if (currentSubs) {
        currentSubs.delete(subId);
        if (currentSubs.size === 0) {
          this.subscribers.delete(domainKey);

          const ch = this.channels.get(domainKey);
          if (ch) {
            void supabase.removeChannel(ch);
            this.channels.delete(domainKey);
          }

          const timer = this.debounceTimers.get(domainKey);
          if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(domainKey);
          }

          this.nextVersion(domainKey);
          this.controllers.get(domainKey)?.abort(new DOMException('Feed disposed', 'AbortError'));
          this.likeControllers.get(domainKey)?.abort(new Error('Feed disposed'));
          this.controllers.delete(domainKey);
          this.likeControllers.delete(domainKey);
          this.inFlight.delete(domainKey);
        }
      }
    };
  }
}

export const sharedFeedScheduler = new SharedFeedScheduler();

export async function fetchPublicWorkoutLogs(
  maxCount = 30,
  options?: ReadRequestOptions,
): Promise<WorkoutLog[]> {
  const domainKey = `public:${maxCount}`;
  return sharedFeedScheduler.fetch(
    domainKey,
    async (signal) => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(maxCount)
        .abortSignal(signal);

      if (error) throw error;
      return ((data || []) as WorkoutLogRow[]).map(normalizeLog);
    },
    options,
  );
}

export async function fetchTeamWorkoutLogs(
  teamId: string,
  maxCount = 30,
  options?: ReadRequestOptions,
): Promise<WorkoutLog[]> {
  if (!teamId) return [];

  const domainKey = `team:${teamId}:${maxCount}`;
  return sharedFeedScheduler.fetch(
    domainKey,
    async (signal) => {
      // 1. Get member user IDs of this squad
      const { data: members, error: mErr } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .abortSignal(signal);
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
        .limit(maxCount)
        .abortSignal(signal);

      if (error) throw error;
      return ((data || []) as WorkoutLogRow[]).map(normalizeLog);
    },
    options,
  );
}

export async function fetchMyWorkoutLogs(
  userId: string,
  maxCount = 100,
  options?: ReadRequestOptions,
): Promise<WorkoutLog[]> {
  if (!userId) return [];

  const domainKey = `my:${userId}:${maxCount}`;
  return sharedFeedScheduler.fetch(
    domainKey,
    async (signal) => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(maxCount)
        .abortSignal(signal);
      if (error) throw error;
      return ((data || []) as WorkoutLogRow[]).map(normalizeLog);
    },
    options,
  );
}

export const subscribeToPublicWorkoutLogs = (
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 30,
) => {
  const domainKey = `public:${maxCount}`;
  return sharedFeedScheduler.subscribe(
    domainKey,
    async (signal) => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(maxCount)
        .abortSignal(signal);
      if (error) throw error;
      return ((data || []) as WorkoutLogRow[]).map(normalizeLog);
    },
    (pull) => {
      return supabase
        .channel(`public_feed_${newId('ch')}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, pull)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, pull)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, pull)
        .subscribe();
    },
    callback,
    onError,
  );
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

  const domainKey = `team:${teamId}:${maxCount}`;
  return sharedFeedScheduler.subscribe(
    domainKey,
    async (signal) => {
      const { data: members, error: mErr } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .abortSignal(signal);
      if (mErr) throw mErr;
      if (!members || members.length === 0) return [];

      const memberIds = members.map((m: any) => m.user_id);
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .in('user_id', memberIds)
        .in('visibility', ['public', 'friends'])
        .order('created_at', { ascending: false })
        .limit(maxCount)
        .abortSignal(signal);
      if (error) throw error;
      return ((data || []) as WorkoutLogRow[]).map(normalizeLog);
    },
    (pull) => {
      return supabase
        .channel(`team_feed_${teamId}_${newId('ch')}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, pull)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, pull)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, pull)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, pull)
        .subscribe();
    },
    callback,
    onError,
  );
};

export const subscribeToMyWorkoutLogs = (
  userId: string,
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 100,
) => {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const domainKey = `my:${userId}:${maxCount}`;
  return sharedFeedScheduler.subscribe(
    domainKey,
    async (signal) => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(maxCount)
        .abortSignal(signal);
      if (error) throw error;
      return ((data || []) as WorkoutLogRow[]).map(normalizeLog);
    },
    (pull) => {
      return supabase
        .channel(`my_feed_${userId}_${newId('ch')}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'workout_logs', filter: `user_id=eq.${userId}` },
          pull,
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_likes' }, pull)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, pull)
        .subscribe();
    },
    callback,
    onError,
  );
};

// Backward-compatible alias
export const subscribeToWorkoutLogs = subscribeToPublicWorkoutLogs;

export const checkUserLike = async (
  workoutLogId: string,
  userId: string,
  options?: ReadRequestOptions,
) => {
  if (!workoutLogId || !userId) return false;
  return readRequest(
    'checkUserLike',
    async (signal) => {
      const { data, error } = await supabase
        .from('workout_likes')
        .select('user_id')
        .eq('log_id', workoutLogId)
        .eq('user_id', userId)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    options,
  );
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
  let version = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pull = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      execute();
    }, 120);
  };

  const execute = () => {
    const currentVersion = ++version;
    void readRequest(
      `comments:${workoutLogId}`,
      async (signal) => {
        const { data, error } = await supabase
          .from('workout_comments')
          .select('*')
          .eq('log_id', workoutLogId)
          .order('created_at', { ascending: true })
          .abortSignal(signal);
        if (error) throw error;
        return data;
      },
    )
      .then((data) => {
        if (!disposed && currentVersion === version) {
          callback(
            ((data || []) as CommentRow[]).map((row) => ({
              id: row.id,
              userId: row.user_id,
              userName: row.user_name,
              userPhoto: row.user_photo,
              content: row.content,
              timestamp: toIso(row.created_at) || row.created_at,
            })),
          );
        }
      })
      .catch((err) => {
        if (!disposed && currentVersion === version) {
          onError?.(err instanceof Error ? err : new Error('评论加载失败'));
        }
      });
  };

  execute();
  const channel = supabase
    .channel(`comments_${workoutLogId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_comments', filter: `log_id=eq.${workoutLogId}` },
      pull,
    )
    .subscribe();

  return () => {
    disposed = true;
    version++;
    if (timer) clearTimeout(timer);
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
  const profile = await requireProfileForWrite(user);

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
    user_name: (profile.displayName || userName).slice(0, 50),
    user_photo: profile.photoURL || userPhoto || '',
    content: content.slice(0, 300),
  });
  if (error) throw error;
};

export const getLeaderboard = async (maxCount = 10, options?: ReadRequestOptions) => {
  return readRequest(
    'getLeaderboard',
    async (signal) => {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('id, display_name, photo_url, streak, total_workouts, last_workout_date')
        .order('total_workouts', { ascending: false })
        .order('streak', { ascending: false })
        .limit(maxCount)
        .abortSignal(signal);
      if (error) throw error;
      return ((data || []) as ProfileRow[]).map((row) => profileFromRow(row));
    },
    options,
  );
};


export const subscribeToUserProfile = (userId: string, callback: (profile: AppUser) => void) => {
  let disposed = false;
  const generation = authGeneration;
  const pull = () => {
    void getUserProfile(userId)
      .then((profile) => {
        if (disposed || generation !== authGeneration) return;
        if (cachedUser && (cachedUser.uid === userId || cachedUser.id === userId)) {
          cachedUser = { ...cachedUser, ...profile };
          persistCachedUser(cachedUser);
          readyProfiles.add(userId);
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
    disposed = true;
    void supabase.removeChannel(channel);
  };
};

export const subscribeToLeaderboard = (
  callback: (users: AppUser[]) => void,
  maxCount = 10,
  onError?: (error: Error) => void,
) => {
  let version = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pull = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      execute();
    }, 150);
  };

  const execute = () => {
    const currentVersion = ++version;
    void getLeaderboard(maxCount)
      .then((users) => {
        if (!disposed && currentVersion === version) {
          callback(users);
        }
      })
      .catch((err) => {
        if (!disposed && currentVersion === version) {
          onError?.(err instanceof Error ? err : new Error('排行榜加载失败'));
        }
      });
  };

  execute();
  const channel = supabase
    .channel(`leaderboard_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, pull)
    .subscribe();

  return () => {
    disposed = true;
    version++;
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
};

export const getLastWorkoutByCategory = async (
  userId: string,
  category: string,
  options?: ReadRequestOptions,
): Promise<any | null> => {
  if (!userId || !category) return null;
  try {
    return await readRequest(
      'getLastWorkoutByCategory',
      async (signal) => {
        const { data, error } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('user_id', userId)
          .ilike('category', `%${category}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .abortSignal(signal)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return normalizeLog(data as WorkoutLogRow);
      },
      options,
    );
  } catch (err) {
    console.warn('Failed to get last workout for category:', err);
    return null;
  }
};

export const getUserWorkoutLogs = async (
  userId: string,
  maxCount = 100,
  options?: ReadRequestOptions,
): Promise<WorkoutLog[]> => {
  if (!userId) return [];
  return readRequest(
    'getUserWorkoutLogs',
    async (signal) => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(maxCount)
        .abortSignal(signal);
      if (error) throw error;
      return ((data || []) as WorkoutLogRow[]).map(normalizeLog);
    },
    options,
  );
};

/**
 * Page size for full-history export reads. Kept below common provider caps so
 * `.range()` reliably returns complete pages.
 */
export const EXPORT_PAGE_SIZE = 400;

/**
 * Read the user's *complete* workout history for export.
 *
 * Unlike `getUserWorkoutLogs` (a bounded feed read using `.limit()`), this
 * paginates with `.range()` until a short page is returned, pins the result set
 * to logs created at or before `exportStartedAt` so records added mid-export
 * cannot shift the offset window, orders by a stable `(created_at, id)` pair and
 * de-duplicates by id. It never truncates to a fixed count.
 */
export const fetchAllMyWorkoutLogsForExport = async (
  userId: string,
  options?: ReadRequestOptions & { exportStartedAt?: string; pageSize?: number },
): Promise<WorkoutLog[]> => {
  if (!userId) return [];
  const exportStartedAt = options?.exportStartedAt || new Date().toISOString();
  const pageSize = Math.min(Math.max(Math.trunc(options?.pageSize ?? EXPORT_PAGE_SIZE), 1), 1000);

  return readRequest(
    'fetchAllMyWorkoutLogsForExport',
    async (signal) => {
      const rows = await fetchAllPages<WorkoutLogRow>(
        async (from, to) => {
          const { data, error } = await supabase
            .from('workout_logs')
            .select('*')
            .eq('user_id', userId)
            .lte('created_at', exportStartedAt)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
            .abortSignal(signal);
          if (error) throw error;
          return (data || []) as WorkoutLogRow[];
        },
        pageSize,
        { signal },
      );

      const byId = new Map<string, WorkoutLog>();
      rows.forEach((row) => {
        const log = normalizeLog(row);
        if (!byId.has(log.id)) {
          byId.set(log.id, log);
        }
      });
      return Array.from(byId.values());
    },
    { ...options, timeoutMs: options?.timeoutMs ?? 60000 },
  );
};

export const subscribeToUserWorkoutLogs = (
  userId: string,
  callback: (logs: WorkoutLog[]) => void,
  onError?: (error: Error) => void,
  maxCount = 100,
) => {
  if (!userId) {
    callback([]);
    return () => {};
  }
  let version = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pull = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      execute();
    }, 120);
  };

  const execute = () => {
    const currentVersion = ++version;
    void getUserWorkoutLogs(userId, maxCount)
      .then((logs) => {
        if (!disposed && currentVersion === version) {
          callback(logs);
        }
      })
      .catch((err) => {
        if (!disposed && currentVersion === version) {
          onError?.(err instanceof Error ? err : new Error('个人训练记录加载失败'));
        }
      });
  };

  execute();
  const channel = supabase
    .channel(`user_workout_logs_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workout_logs', filter: `user_id=eq.${userId}` },
      pull,
    )
    .subscribe();

  return () => {
    disposed = true;
    version++;
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
};

export const getLastWorkoutsByCategories = async (
  userId: string,
  categories: string[],
): Promise<Record<string, any>> => {
  const result: Record<string, any> = {};
  await Promise.all(
    categories.map(async (cat) => {
      const log = await getLastWorkoutByCategory(userId, cat);
      if (log) {
        result[cat] = log;
      }
    }),
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

export const getUserTeams = async (userId: string, options?: ReadRequestOptions): Promise<Team[]> => {
  if (!userId) return [];
  return readRequest(
    'getUserTeams',
    async (signal) => {
      const { data: memberships, error: mErr } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)
        .abortSignal(signal);
      if (mErr) throw mErr;
      if (!memberships || memberships.length === 0) return [];

      const teamIds = memberships.map((m: { team_id: string }) => m.team_id);
      const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('id, name, code, created_by, max_members, created_at')
        .in('id', teamIds)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (tErr) throw tErr;

      const { data: allMembers, error: membersError } = await supabase
        .from('team_members')
        .select('team_id')
        .in('team_id', teamIds)
        .abortSignal(signal);
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
    },
    options,
  );
};

export const subscribeToUserTeams = (
  userId: string,
  callback: (teams: Team[]) => void,
  onError?: (error: Error) => void,
) => {
  let version = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pull = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      execute();
    }, 120);
  };

  const execute = () => {
    const currentVersion = ++version;
    void getUserTeams(userId)
      .then((teams) => {
        if (!disposed && currentVersion === version) {
          callback(teams);
        }
      })
      .catch((err) => {
        if (!disposed && currentVersion === version) {
          onError?.(err instanceof Error ? err : new Error('小队列表加载失败'));
        }
      });
  };

  execute();
  const channel = supabase
    .channel(`user_teams_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_members', filter: `user_id=eq.${userId}` },
      pull,
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, pull)
    .subscribe();

  return () => {
    disposed = true;
    version++;
    if (timer) clearTimeout(timer);
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

export const getTeamDashboard = async (
  teamId: string,
  options?: ReadRequestOptions,
): Promise<TeamDashboardData> => {
  if (!teamId) throw new Error('小队不存在');

  return readRequest(
    `teamDashboard:${teamId}`,
    async (signal) => {
      const { data: teamRow, error: tErr } = await supabase
        .from('teams')
        .select('id, name, code, created_by, max_members, created_at')
        .eq('id', teamId)
        .abortSignal(signal)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!teamRow) throw new Error('小队不存在');

      const { data: memberRows, error: mErr } = await supabase
        .from('team_members')
        .select('id, team_id, user_id, role, joined_at')
        .eq('team_id', teamId)
        .order('joined_at', { ascending: true })
        .abortSignal(signal);
      if (mErr) throw mErr;

      const memberUserIds = (memberRows || []).map((m: any) => m.user_id);
      const { data: profileRows, error: profileError } = memberUserIds.length > 0
        ? await supabase
            .from('public_profiles')
            .select('id, display_name, photo_url, streak, total_workouts, last_workout_date')
            .in('id', memberUserIds)
            .abortSignal(signal)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profilesMap = new Map((profileRows || []).map((p: any) => [p.id, p]));

      const todayStr = toLocalDateKey(new Date());
      const thirtySixHoursAgo = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      const { data: recentLogs, error: recentLogsError } = memberUserIds.length > 0
        ? await supabase
            .from('workout_logs')
            .select('id, user_id, created_at')
            .in('user_id', memberUserIds)
            .gte('created_at', thirtySixHoursAgo)
            .abortSignal(signal)
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
    },
    options,
  );
};

export const subscribeToTeamDashboard = (
  teamId: string,
  callback: (data: TeamDashboardData) => void,
  onError?: (err: Error) => void,
) => {
  if (!teamId) return () => {};

  let version = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pull = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      execute();
    }, 150);
  };

  const execute = () => {
    const currentVersion = ++version;
    void getTeamDashboard(teamId)
      .then((data) => {
        if (!disposed && currentVersion === version) {
          callback(data);
        }
      })
      .catch((err) => {
        if (!disposed && currentVersion === version) {
          console.warn('Dashboard fetch error:', err);
          onError?.(err instanceof Error ? err : new Error('小队数据加载失败'));
        }
      });
  };

  execute();
  const channel = supabase
    .channel(`team_dashboard_${teamId}_${newId('ch')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: `team_id=eq.${teamId}` }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, pull)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, pull)
    .subscribe();

  return () => {
    disposed = true;
    version++;
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
};



export const waitForAuthReady = (timeoutMs = 3000): Promise<AppUser | null> => new Promise<AppUser | null>((settle) => {
  const finishStage = startStage('auth');
  const resolve = (value: AppUser | null) => { finishStage(value ? 'session' : 'no-session'); settle(value); };
  const generation = authGeneration;
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      console.warn(`waitForAuthReady timed out after ${timeoutMs}ms`);
      // Real session only: never cached authentication on timeout
      resolve(null);
    }
  }, timeoutMs);

  supabase.auth.getSession()
    .then(({ data, error }) => {
      if (settled) return;
      if (generation !== authGeneration) {
        settled = true;
        clearTimeout(timer);
        resolve(cachedUser);
        return;
      }
      const user = data?.session?.user;
      if (error || !user) {
        settled = true;
        clearTimeout(timer);
        handleAuthSignOut();
        resolve(null);
        return;
      }

      // Real session confirmed! Immediate auth user
      const immediateUser = handleAuthSessionUser(user);

      settled = true;
      clearTimeout(timer);
      // Resolve auth IMMEDIATELY! Do not wait for remote profile fetch!
      resolve(immediateUser);

      // Trigger background profile fetch via singleflight
      void ensureUserProfile(user).catch((e) => {
        console.warn('Background profile load failed:', e);
      });
    })
    .catch((err) => {
      console.warn('waitForAuthReady getSession error:', err);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        // Real session only: never cached authentication on error
        resolve(null);
      }
    });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------


export const fetchNotifications = async (
  userId: string,
  limit = 50,
  options?: ReadRequestOptions,
): Promise<AppNotification[]> => {
  if (!userId) return [];
  return readRequest(
    'fetchNotifications',
    async (signal) => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
        .abortSignal(signal);
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
    },
    options,
  );
};

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  limit = 50,
  onError?: (error: Error) => void,
) => {
  if (!userId) {
    callback([]);
    return () => {};
  }
  let version = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pull = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      execute();
    }, 120);
  };

  const execute = () => {
    const currentVersion = ++version;
    void fetchNotifications(userId, limit)
      .then((notifications) => {
        if (!disposed && currentVersion === version) {
          callback(notifications);
        }
      })
      .catch((err) => {
        if (!disposed && currentVersion === version) {
          onError?.(err instanceof Error ? err : new Error('通知加载失败'));
        }
      });
  };

  execute();
  const channel = supabase
    .channel(`notifications_${userId}_${newId('ch')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      refreshPullFallback(pull)
    )
    .subscribe();

  return () => {
    disposed = true;
    version++;
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
};

function refreshPullFallback(pull: () => void) {
  return pull;
}

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

  // Non-idempotent write: execute once without automatic retries
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

export const fetchUserFeedbacksFn = async (
  userId?: string,
  options?: ReadRequestOptions,
): Promise<UserFeedback[]> => {
  const user = await currentAuthUser();
  if (!user || !userId || user.id !== userId) return [];

  return readRequest(
    'fetchUserFeedbacks',
    async (signal) => {
      const { data, error } = await supabase
        .from('feedbacks')
        .select('id, user_id, user_name, user_email, type, content, contact, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
        .abortSignal(signal);
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
    },
    options,
  );
};

export default supabase;

