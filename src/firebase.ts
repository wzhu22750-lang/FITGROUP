import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: 'AIzaSyALpuhcfQXxu87fIsiOEfRUkpQ6uORnTtY',
  authDomain: 'gen-lang-client-0285368146.firebaseapp.com',
  projectId: 'gen-lang-client-0285368146',
  storageBucket: 'gen-lang-client-0285368146.firebasestorage.app',
  messagingSenderId: '717219904394',
  appId: '1:717219904394:web:0c2423a516b4eb14c9a673',
};

const FIRESTORE_DB_ID = 'ai-studio-320fe0bc-75e3-4038-a995-52950cbd787e';

export const app = initializeApp(firebaseConfig);

function createAuth(): Auth {
  if (Capacitor.isNativePlatform()) {
    try {
      return initializeAuth(app, { persistence: indexedDBLocalPersistence });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const auth = createAuth();
export const db = getFirestore(app, FIRESTORE_DB_ID);
export const storage = getStorage(app);

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

let cachedUser: AppUser | null = null;

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate().toISOString();
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

function profileFromDoc(uid: string, data: DocumentData | undefined, authUser?: User | null): AppUser {
  return {
    id: uid,
    uid,
    email: authUser?.email || undefined,
    displayName: data?.displayName || authUser?.displayName || authUser?.email?.split('@')[0] || 'FitGroup',
    photoURL: data?.photoURL || authUser?.photoURL || '',
    phone: '',
    streak: Number(data?.streak || 0),
    totalWorkouts: Number(data?.totalWorkouts || 0),
    lastWorkoutDate: toIso(data?.lastWorkoutDate),
    prs: data?.prs && typeof data.prs === 'object' ? data.prs : {},
  };
}

function authOnlyUser(user: User): AppUser {
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email || undefined,
    displayName: user.displayName || user.email?.split('@')[0] || 'FitGroup',
    photoURL: user.photoURL || '',
    phone: '',
    streak: 0,
    totalWorkouts: 0,
    prs: {},
  };
}

export async function ensureUserProfile(user: User, extras: Partial<AppUser> = {}): Promise<AppUser> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const profile = profileFromDoc(user.uid, snap.data(), user);
    cachedUser = profile;
    return profile;
  }

  const displayName = (extras.displayName || user.displayName || user.email?.split('@')[0] || 'FitGroup').slice(0, 50);
  const photoURL = extras.photoURL || user.photoURL || '';
  await setDoc(ref, {
    displayName,
    photoURL,
    streak: 0,
    totalWorkouts: 0,
    prs: {},
  });
  const profile = profileFromDoc(user.uid, { displayName, photoURL, streak: 0, totalWorkouts: 0, prs: {} }, user);
  cachedUser = profile;
  return profile;
}

function mapAuthError(error: unknown): Error {
  const code = (error as { code?: string })?.code || '';
  const messages: Record<string, string> = {
    'auth/email-already-in-use': '该邮箱已注册，请直接登录',
    'auth/invalid-email': '邮箱格式不正确',
    'auth/weak-password': '密码至少需要 6 位',
    'auth/invalid-credential': '邮箱或密码错误',
    'auth/user-not-found': '账号不存在，请先注册',
    'auth/wrong-password': '邮箱或密码错误',
    'auth/too-many-requests': '尝试次数过多，请稍后再试',
    'auth/network-request-failed': '网络异常，请检查网络后重试',
  };
  return new Error(messages[code] || (error as Error)?.message || '登录失败，请重试');
}

export const registerWithEmail = async (email: string, password: string, displayName: string) => {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const name = displayName.trim().slice(0, 50) || email.split('@')[0];
    await updateProfile(cred.user, { displayName: name });
    return ensureUserProfile(cred.user, { displayName: name });
  } catch (e) {
    throw mapAuthError(e);
  }
};

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return ensureUserProfile(cred.user);
  } catch (e) {
    throw mapAuthError(e);
  }
};

export const logout = async () => {
  cachedUser = null;
  await signOut(auth);
  return null;
};

export const getCurrentUser = () => cachedUser;

export const onAuthStateChangedFn = (callback: (user: AppUser | null) => void) => {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      cachedUser = null;
      callback(null);
      return;
    }
    try {
      const profile = await ensureUserProfile(user);
      callback(profile);
    } catch (e) {
      console.error('Load profile failed:', e);
      cachedUser = authOnlyUser(user);
      callback(cachedUser);
    }
  });
};

export const getUserProfile = async (userId: string) => {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) throw new Error('User not found');
  const authUser = auth.currentUser?.uid === userId ? auth.currentUser : null;
  return profileFromDoc(userId, snap.data(), authUser);
};

export const updateUserProfileFn = async (userId: string, updates: Record<string, unknown>) => {
  const payload: Record<string, unknown> = {};
  if (typeof updates.displayName === 'string') payload.displayName = updates.displayName.trim().slice(0, 50);
  if (typeof updates.photoURL === 'string') payload.photoURL = updates.photoURL;
  if (typeof updates.streak === 'number') payload.streak = updates.streak;
  if (typeof updates.totalWorkouts === 'number') payload.totalWorkouts = updates.totalWorkouts;
  if (updates.prs && typeof updates.prs === 'object') payload.prs = updates.prs;
  if (updates.lastWorkoutDate) {
    const raw = updates.lastWorkoutDate;
    payload.lastWorkoutDate = raw instanceof Date
      ? Timestamp.fromDate(raw)
      : typeof raw === 'string'
        ? Timestamp.fromDate(new Date(raw))
        : raw;
  }

  await updateDoc(doc(db, 'users', userId), payload);

  if (auth.currentUser && auth.currentUser.uid === userId) {
    const profilePatch: { displayName?: string; photoURL?: string } = {};
    if (typeof payload.displayName === 'string') profilePatch.displayName = payload.displayName;
    if (typeof payload.photoURL === 'string') profilePatch.photoURL = payload.photoURL;
    if (Object.keys(profilePatch).length > 0) {
      await updateProfile(auth.currentUser, profilePatch);
    }
  }
  if (cachedUser && cachedUser.uid === userId) {
    cachedUser = {
      ...cachedUser,
      ...payload,
      lastWorkoutDate: toIso(payload.lastWorkoutDate) || cachedUser.lastWorkoutDate,
    };
  }
};

export const syncUserStatsFromLogs = async (userId: string): Promise<AppUser> => {
  const user = auth.currentUser;
  if (!user || user.uid !== userId) {
    return getUserProfile(userId);
  }

  const q = query(
    collection(db, 'workoutLogs'),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  const logs = snap.docs.map(d => normalizeLog(d.id, d.data()));

  const totalWorkouts = logs.length;
  const prs: Record<string, number> = {};

  logs.forEach(log => {
    (log.exercises || []).forEach((ex: any) => {
      if (ex.type === 'strength' && typeof ex.weight === 'number' && ex.weight > 0 && ex.name) {
        const name = String(ex.name).trim();
        if (!prs[name] || ex.weight > prs[name]) {
          prs[name] = ex.weight;
        }
      }
    });
  });

  let streak = 0;
  let lastWorkoutDate: string | undefined = undefined;

  if (logs.length > 0) {
    lastWorkoutDate = logs[0].timestamp;

    const toDateKey = (dateStr: string) => {
      const d = new Date(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const uniqueDateKeys = Array.from(
      new Set(logs.map(l => toDateKey(l.timestamp)))
    ).sort().reverse();

    const todayKey = toDateKey(new Date().toISOString());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = toDateKey(yesterday.toISOString());

    const latestKey = uniqueDateKeys[0];
    if (latestKey === todayKey || latestKey === yesterdayKey) {
      streak = 1;
      let curr = new Date(latestKey);
      for (let i = 1; i < uniqueDateKeys.length; i++) {
        const prevExpected = new Date(curr);
        prevExpected.setDate(prevExpected.getDate() - 1);
        const prevExpectedKey = toDateKey(prevExpected.toISOString());
        if (uniqueDateKeys[i] === prevExpectedKey) {
          streak += 1;
          curr = prevExpected;
        } else {
          break;
        }
      }
    } else {
      streak = 0;
    }
  }

  await updateUserProfileFn(userId, {
    totalWorkouts,
    streak,
    prs,
    lastWorkoutDate: lastWorkoutDate || null,
  });

  return getUserProfile(userId);
};

export const createWorkoutLog = async (logData: Record<string, unknown>) => {
  const user = auth.currentUser;
  if (!user) throw new Error('未登录');

  const logId = typeof logData.id === 'string' && logData.id ? logData.id : newId('log');
  const exercises = Array.isArray(logData.exercises) ? logData.exercises : [];
  await setDoc(doc(db, 'workoutLogs', logId), {
    userId: user.uid,
    userName: String(logData.userName || user.displayName || 'FitGroup').slice(0, 50),
    userPhoto: String(logData.userPhoto || user.photoURL || ''),
    timestamp: serverTimestamp(),
    category: logData.category,
    exercises,
    note: String(logData.note || '').slice(0, 500),
    photoUrl: String(logData.photoUrl || ''),
    likesCount: 0,
    commentsCount: 0,
  });

  await syncUserStatsFromLogs(user.uid).catch((err) => {
    console.warn('Sync user stats after create failed:', err);
  });

  return { id: logId };
};

export const deleteWorkoutLog = async (workoutLogId: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('未登录');
  const logRef = doc(db, 'workoutLogs', workoutLogId);
  const snap = await getDoc(logRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.userId !== user.uid) {
    throw new Error('只能删除自己的打卡记录');
  }

  // 1. Clean up likes and comments subcollections in batch
  try {
    const [likesSnap, commentsSnap] = await Promise.all([
      getDocs(collection(db, 'workoutLogs', workoutLogId, 'likes')),
      getDocs(collection(db, 'workoutLogs', workoutLogId, 'comments')),
    ]);

    const batch = writeBatch(db);
    likesSnap.docs.forEach((d) => batch.delete(d.ref));
    commentsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(logRef);
    await batch.commit();
  } catch (err) {
    console.warn('Batch delete subcollections failed, falling back to direct delete:', err);
    await deleteDoc(logRef);
  }

  // 2. Clean up storage photo if present
  if (data.photoUrl && typeof data.photoUrl === 'string') {
    try {
      if (data.photoUrl.includes('firebasestorage.app') || data.photoUrl.includes('firebasestorage.googleapis.com')) {
        const photoRef = ref(storage, data.photoUrl);
        await deleteObject(photoRef).catch(() => {});
      }
    } catch {
      // Non-blocking storage cleanup
    }
  }

  // 3. Recalculate stats from remaining logs
  await syncUserStatsFromLogs(user.uid).catch((err) => {
    console.warn('Sync user stats after delete failed:', err);
  });
};

function normalizeLog(id: string, data: DocumentData) {
  return {
    ...data,
    id,
    timestamp: toIso(data.timestamp) || new Date().toISOString(),
    exercises: Array.isArray(data.exercises) ? data.exercises : [],
    likesCount: Number(data.likesCount || 0),
    commentsCount: Number(data.commentsCount || 0),
  };
}

// Realtime listener with query limits
export const subscribeToWorkoutLogs = (
  callback: (logs: unknown[]) => void,
  onError?: (error: Error) => void,
  maxCount = 30,
) => {
  const q = query(collection(db, 'workoutLogs'), orderBy('timestamp', 'desc'), limit(maxCount));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => normalizeLog(d.id, d.data())));
  }, (e) => {
    console.error('Workout logs listen error:', e);
    onError?.(e instanceof Error ? e : new Error('动态加载失败'));
    callback([]);
  });
};

export const checkUserLike = async (workoutLogId: string, userId: string) => {
  const snap = await getDoc(doc(db, 'workoutLogs', workoutLogId, 'likes', userId));
  return snap.exists();
};

export const toggleLike = async (workoutLogId: string, userId: string, hasLiked: boolean) => {
  const logRef = doc(db, 'workoutLogs', workoutLogId);
  const likeRef = doc(db, 'workoutLogs', workoutLogId, 'likes', userId);
  const logSnap = await getDoc(logRef);
  if (!logSnap.exists()) throw new Error('Log not found');

  const batch = writeBatch(db);
  if (hasLiked) {
    batch.delete(likeRef);
    batch.update(logRef, { likesCount: increment(-1) });
  } else {
    batch.set(likeRef, { userId });
    batch.update(logRef, { likesCount: increment(1) });
  }
  await batch.commit();
};

// Realtime listener: comment panel should stream new replies.
export const subscribeToComments = (workoutLogId: string, callback: (comments: unknown[]) => void) => {
  const q = query(
    collection(db, 'workoutLogs', workoutLogId, 'comments'),
    orderBy('timestamp', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({
      ...d.data(),
      id: d.id,
      timestamp: toIso(d.data().timestamp) || d.data().timestamp,
    })));
  }, () => callback([]));
};

export const addComment = async (
  workoutLogId: string,
  userId: string,
  userName: string,
  userPhoto: string,
  content: string,
) => {
  const commentId = newId('c');
  const logRef = doc(db, 'workoutLogs', workoutLogId);
  const commentRef = doc(db, 'workoutLogs', workoutLogId, 'comments', commentId);
  const logSnap = await getDoc(logRef);
  if (!logSnap.exists()) throw new Error('Log not found');

  const batch = writeBatch(db);
  batch.set(commentRef, {
    userId,
    userName: userName.slice(0, 50),
    userPhoto: userPhoto || '',
    content: content.slice(0, 300),
    timestamp: serverTimestamp(),
  });
  batch.update(logRef, { commentsCount: increment(1) });
  await batch.commit();
};

async function compressImage(file: File, maxDim = 1280, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error('图片压缩失败'))),
      'image/jpeg',
      quality,
    );
  });
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

function mapStorageError(error: unknown): Error {
  const code = (error as { code?: string })?.code || '';
  const messages: Record<string, string> = {
    'storage/unauthorized': '没有权限上传照片，请重新登录',
    'storage/canceled': '已取消上传',
    'storage/retry-limit-exceeded': '网络不稳定，照片上传失败',
    'storage/quota-exceeded': '存储空间已满，请稍后再试',
    'storage/unauthenticated': '请先登录后再上传照片',
    'storage/unknown': '照片上传失败，请检查网络后重试',
  };
  return new Error(messages[code] || (error as Error)?.message || '照片上传失败，请重试');
}

async function uploadImage(file: File, path: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('未登录');

  try {
    const compressed = await compressImage(file);
    const storageRef = ref(storage, path);
    const snap = await uploadBytes(storageRef, compressed, {
      contentType: compressed.type || 'image/jpeg',
      cacheControl: 'public,max-age=31536000',
    });
    const url = await getDownloadURL(snap.ref);
    if (url.length > 500) {
      throw new Error('照片地址过长，请换一张图再试');
    }
    return url;
  } catch (error) {
    throw mapStorageError(error);
  }
}

export const uploadPhoto = async (file: File, path?: string): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('未登录');
  return uploadImage(file, path || `u/${user.uid}/w/${newId('p')}.jpg`);
};

export const uploadAvatar = async (userId: string, file: File): Promise<string> => {
  if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error('未登录');
  return uploadImage(file, `u/${userId}/a/${newId('a')}.jpg`);
};

export const uploadWorkoutPhoto = async (userId: string, file: File): Promise<string> => {
  if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error('未登录');
  return uploadImage(file, `u/${userId}/w/${newId('w')}.jpg`);
};

export const getLeaderboard = async (maxCount = 10) => {
  const q = query(collection(db, 'users'), orderBy('streak', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => profileFromDoc(d.id, d.data()));
};

export const subscribeToUserProfile = (userId: string, callback: (profile: AppUser) => void) => {
  const ref = doc(db, 'users', userId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const profile = profileFromDoc(userId, snap.data(), auth.currentUser);
      cachedUser = profile;
      callback(profile);
    }
  });
};

export const subscribeToLeaderboard = (callback: (users: AppUser[]) => void, maxCount = 10) => {
  const q = query(collection(db, 'users'), orderBy('streak', 'desc'), limit(maxCount));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => profileFromDoc(d.id, d.data())));
  });
};

export const waitForAuthReady = () => new Promise<AppUser | null>((resolve) => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    unsub();
    if (!user) {
      cachedUser = null;
      resolve(null);
      return;
    }
    try {
      resolve(await ensureUserProfile(user));
    } catch {
      cachedUser = authOnlyUser(user);
      resolve(cachedUser);
    }
  });
});

export default app;
