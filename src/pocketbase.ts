import PocketBase, { RecordModel, AuthModel } from 'pocketbase';

// 用户部署时修改为实际 PocketBase 服务器地址
const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8090';

const pb = new PocketBase(PB_URL);

pb.autoCancellation(false);

// ── credential helpers ──

const CRED_KEY = 'fitgroup_cred';

function saveCredentials(phone: string, password: string) {
  localStorage.setItem(CRED_KEY, JSON.stringify({ phone, password }));
}

function getStoredCredentials(): { phone: string; password: string } | null {
  const raw = localStorage.getItem(CRED_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clearCredentials() {
  localStorage.removeItem(CRED_KEY);
}

function randomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

// ── auth ──

export const registerWithPhone = async (phone: string, displayName: string, photoURL: string) => {
  const email = `${phone}@fitgroup.local`;
  const password = randomPassword();

  // Check if user already exists
  try {
    const existing = await pb.collection('users').getFirstListItem(`email="${email}"`);
    if (existing) throw new Error('该手机号已注册，请直接登录');
  } catch (e: any) {
    if (e.message === '该手机号已注册，请直接登录') throw e;
  }

  const record = await pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    displayName,
    photoURL,
    phone,
    streak: 0,
    totalWorkouts: 0,
    prs: {},
  });

  await pb.collection('users').authWithPassword(email, password);
  saveCredentials(phone, password);

  // Also sync to PocketBase auth profile
  await pb.collection('users').update(record.id, { ...record });

  return pb.authStore.record;
};

export const loginWithPhone = async (phone: string) => {
  const creds = getStoredCredentials();
  if (!creds || creds.phone !== phone) {
    throw new Error('该手机号未在本设备注册，请先注册');
  }

  await pb.collection('users').authWithPassword(`${phone}@fitgroup.local`, creds.password);

  return pb.authStore.record;
};

export const autoLogin = async () => {
  const creds = getStoredCredentials();
  if (!creds) return null;

  try {
    await pb.collection('users').authWithPassword(`${creds.phone}@fitgroup.local`, creds.password);
    return pb.authStore.record;
  } catch {
    return null;
  }
};

export const logout = () => {
  clearCredentials();
  pb.authStore.clear();
};

export const getCurrentUser = () => {
  return pb.authStore.record ?? null;
};

export const getAuthUserModel = () => pb.authStore.model;

export const onAuthStateChangedFn = (callback: (user: RecordModel | null) => void) => {
  const handler = () => callback(pb.authStore.record ?? null);
  pb.authStore.onChange(handler);
  return () => {
    // PocketBase authStore doesn't have unsubscribe, but onChange returns a disposer
  };
};

// ── user ──

export const syncUserToDatabase = async (user: any) => {
  try {
    await pb.collection('users').getOne(user.id || user.uid);
  } catch {
    await pb.collection('users').create({
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL || '',
      phone: user.phone || '',
      streak: 0,
      totalWorkouts: 0,
      prs: {},
    });
  }
};

export const getUserProfile = async (userId: string) => {
  const record = await pb.collection('users').getOne(userId);
  return { ...record, uid: record.id };
};

export const updateUserProfileFn = async (userId: string, updates: Record<string, any>) => {
  await pb.collection('users').update(userId, updates);
};

// ── workout logs ──

export const createWorkoutLog = async (logData: any) => {
  return pb.collection('workoutLogs').create({
    ...logData,
    timestamp: new Date().toISOString(),
  });
};

export const subscribeToWorkoutLogs = (callback: (logs: any[]) => void) => {
  const fetchLogs = async () => {
    try {
      const records = await pb.collection('workoutLogs').getFullList({
        sort: '-timestamp',
      });
      callback(records.map(r => ({ ...r, id: r.id, timestamp: r.timestamp })));
    } catch (e) {
      console.error('Workout logs fetch error:', e);
      callback([]);
    }
  };

  fetchLogs();

  pb.collection('workoutLogs').subscribe('*', () => {
    fetchLogs();
  });

  return () => {
    pb.collection('workoutLogs').unsubscribe('*');
  };
};

// ── likes ──

export const checkUserLike = async (workoutLogId: string, userId: string) => {
  try {
    const records = await pb.collection('likes').getFullList({
      filter: `workoutLogId="${workoutLogId}" && userId="${userId}"`,
    });
    return records.length > 0;
  } catch {
    return false;
  }
};

export const toggleLike = async (workoutLogId: string, userId: string, hasLiked: boolean) => {
  if (hasLiked) {
    const records = await pb.collection('likes').getFullList({
      filter: `workoutLogId="${workoutLogId}" && userId="${userId}"`,
    });
    for (const r of records) {
      await pb.collection('likes').delete(r.id);
    }
    const log = await pb.collection('workoutLogs').getOne(workoutLogId);
    await pb.collection('workoutLogs').update(workoutLogId, {
      likesCount: Math.max(0, (log.likesCount || 1) - 1),
    });
  } else {
    await pb.collection('likes').create({ workoutLogId, userId });
    const log = await pb.collection('workoutLogs').getOne(workoutLogId);
    await pb.collection('workoutLogs').update(workoutLogId, {
      likesCount: (log.likesCount || 0) + 1,
    });
  }
};

// ── comments ──

export const subscribeToComments = (workoutLogId: string, callback: (comments: any[]) => void) => {
  const fetchComments = async () => {
    try {
      const records = await pb.collection('comments').getFullList({
        filter: `workoutLogId="${workoutLogId}"`,
        sort: 'created',
      });
      callback(records.map(r => ({ ...r, id: r.id, timestamp: r.created })));
    } catch (e) {
      callback([]);
    }
  };

  fetchComments();

  pb.collection('comments').subscribe('*', () => {
    fetchComments();
  });

  return () => {
    pb.collection('comments').unsubscribe('*');
  };
};

export const addComment = async (workoutLogId: string, userId: string, userName: string, userPhoto: string, content: string) => {
  await pb.collection('comments').create({ workoutLogId, userId, userName, userPhoto, content });

  const log = await pb.collection('workoutLogs').getOne(workoutLogId);
  await pb.collection('workoutLogs').update(workoutLogId, {
    commentsCount: (log.commentsCount || 0) + 1,
  });
};

// ── storage ──

export const uploadPhoto = async (file: File, path: string): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  // We'll create a temp record and use its file field
  const record = await pb.collection('photos').create({ file: file });
  return pb.files.getURL(record, record.file);
};

export const uploadAvatar = async (userId: string, file: File): Promise<string> => {
  return uploadPhoto(file, `avatars/${userId}`);
};

export const uploadWorkoutPhoto = async (userId: string, file: File): Promise<string> => {
  return uploadPhoto(file, `workouts/${userId}`);
};

// ── leaderboard ──

export const getLeaderboard = async (maxCount = 10) => {
  const records = await pb.collection('users').getFullList({
    sort: '-streak',
    perPage: maxCount,
  });
  return records.map(r => ({ ...r, uid: r.id }));
};

export default pb;
