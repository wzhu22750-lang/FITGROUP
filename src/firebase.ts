import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';

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
export const auth = getAuth(app);
export const db = getFirestore(app, FIRESTORE_DB_ID);

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

  if (auth.currentUser && auth.currentUser.uid === userId && typeof payload.displayName === 'string') {
    await updateProfile(auth.currentUser, { displayName: payload.displayName });
  }
  if (cachedUser && cachedUser.uid === userId) {
    cachedUser = {
      ...cachedUser,
      ...payload,
      lastWorkoutDate: toIso(payload.lastWorkoutDate) || cachedUser.lastWorkoutDate,
    };
  }
};

export const createWorkoutLog = async (logData: Record<string, unknown>) => {
  const user = auth.currentUser;
  if (!user) throw new Error('未登录');

  const logId = newId('log');
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
  return { id: logId };
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

// Realtime listener: the feed must update when anyone checks in.
export const subscribeToWorkoutLogs = (callback: (logs: unknown[]) => void) => {
  const q = query(collection(db, 'workoutLogs'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => normalizeLog(d.id, d.data())));
  }, (e) => {
    console.error('Workout logs listen error:', e);
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
  const current = Number(logSnap.data().likesCount || 0);

  const batch = writeBatch(db);
  if (hasLiked) {
    batch.delete(likeRef);
    batch.update(logRef, { likesCount: Math.max(0, current - 1) });
  } else {
    batch.set(likeRef, { userId });
    batch.update(logRef, { likesCount: current + 1 });
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
  batch.update(logRef, { commentsCount: Number(logSnap.data().commentsCount || 0) + 1 });
  await batch.commit();
};

export const uploadPhoto = async (_file: File, _path?: string): Promise<string> => {
  return '';
};

export const uploadAvatar = async (_userId: string, _file: File): Promise<string> => {
  return '';
};

export const uploadWorkoutPhoto = async (_userId: string, _file: File): Promise<string> => {
  return '';
};

export const getLeaderboard = async (maxCount = 10) => {
  const q = query(collection(db, 'users'), orderBy('streak', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => profileFromDoc(d.id, d.data()));
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
