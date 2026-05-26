import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  increment,
  serverTimestamp,
  writeBatch,
  addDoc,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

const firebaseConfig = {
  projectId: 'gen-lang-client-0285368146',
  appId: '1:717219904394:web:bf81e5445080fbaec9a673',
  apiKey: 'AIzaSyALpuhcfQXxu87fIsiOEfRUkpQ6uORnTtY',
  authDomain: 'gen-lang-client-0285368146.firebaseapp.com',
  storageBucket: 'gen-lang-client-0285368146.firebasestorage.app',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

// ── auth ──

export const registerWithPhone = async (phone: string, displayName: string, photoURL: string) => {
  const email = `${phone}@fitgroup.local`;
  const password = randomPassword();

  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (e: any) {
    if (e.code === 'auth/email-already-in-use') {
      throw new Error('该手机号已注册，请直接登录');
    }
    throw e;
  }

  await updateProfile(userCredential.user, { displayName, photoURL });
  saveCredentials(phone, password);

  await setDoc(doc(db, 'users', userCredential.user.uid), {
    uid: userCredential.user.uid,
    displayName,
    photoURL,
    email,
    phone,
    streak: 0,
    totalWorkouts: 0,
    prs: {},
  });

  return userCredential.user;
};

export const loginWithPhone = async (phone: string) => {
  const creds = getStoredCredentials();
  if (!creds || creds.phone !== phone) {
    throw new Error('该手机号未在本设备注册，请先注册');
  }

  const result = await signInWithEmailAndPassword(auth, `${phone}@fitgroup.local`, creds.password);
  return result.user;
};

export const autoLogin = async () => {
  const creds = getStoredCredentials();
  if (!creds) return null;

  try {
    const result = await signInWithEmailAndPassword(auth, `${creds.phone}@fitgroup.local`, creds.password);
    return result.user;
  } catch {
    return null;
  }
};

export const logout = async () => {
  clearCredentials();
  await signOut(auth);
};

export const getCurrentUser = () => auth.currentUser;

export const onAuthStateChangedFn = (cb: (user: User | null) => void) =>
  onAuthStateChanged(auth, cb);

// ── user ──

export const syncUserToDatabase = async (user: User) => {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL || '',
      email: user.email || '',
      phone: user.phoneNumber || '',
      streak: 0,
      totalWorkouts: 0,
      prs: {},
    });
  }
};

export const getUserProfile = async (userId: string) => {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) throw new Error('用户不存在');
  return { ...snap.data(), uid: snap.id };
};

export const updateUserProfileFn = async (userId: string, updates: Record<string, any>) => {
  await updateDoc(doc(db, 'users', userId), updates);
  const user = auth.currentUser;
  if (user && (updates.displayName || updates.photoURL)) {
    await updateProfile(user, {
      displayName: updates.displayName ?? user.displayName,
      photoURL: updates.photoURL ?? user.photoURL,
    });
  }
};

// ── workout logs ──

export const createWorkoutLog = async (logData: any) => {
  return addDoc(collection(db, 'workoutLogs'), {
    ...logData,
    timestamp: serverTimestamp(),
  });
};

export const subscribeToWorkoutLogs = (callback: (logs: any[]) => void) => {
  const q = query(collection(db, 'workoutLogs'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        id: d.id,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
      };
    }));
  }, (err) => {
    console.error('Feed subscribe error:', err);
    callback([]);
  });
};

// ── likes ──

export const checkUserLike = async (workoutLogId: string, userId: string) => {
  const q = query(collection(db, 'workoutLogs', workoutLogId, 'likes'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return !snap.empty;
};

export const toggleLike = async (workoutLogId: string, userId: string, hasLiked: boolean) => {
  const batch = writeBatch(db);
  const logRef = doc(db, 'workoutLogs', workoutLogId);

  if (hasLiked) {
    const q = query(collection(db, 'workoutLogs', workoutLogId, 'likes'), where('userId', '==', userId));
    const snap = await getDocs(q);
    snap.forEach(d => batch.delete(d.ref));
    batch.update(logRef, { likesCount: increment(-1) });
  } else {
    batch.set(doc(collection(db, 'workoutLogs', workoutLogId, 'likes')), { userId, timestamp: serverTimestamp() });
    batch.update(logRef, { likesCount: increment(1) });
  }

  await batch.commit();
};

// ── comments ──

export const subscribeToComments = (workoutLogId: string, callback: (comments: any[]) => void) => {
  const q = query(collection(db, 'workoutLogs', workoutLogId, 'comments'), orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => {
      const data = d.data();
      return { ...data, id: d.id, timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp };
    }));
  });
};

export const addComment = async (workoutLogId: string, userId: string, userName: string, userPhoto: string, content: string) => {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'workoutLogs', workoutLogId, 'comments')), {
    userId, userName, userPhoto, content, timestamp: serverTimestamp(),
  });
  batch.update(doc(db, 'workoutLogs', workoutLogId), { commentsCount: increment(1) });
  await batch.commit();
};

// ── storage ──

export const uploadPhoto = async (file: File, path: string): Promise<string> => {
  const snap = await uploadBytes(ref(storage, path), file);
  return getDownloadURL(snap.ref);
};

export const uploadAvatar = async (userId: string, file: File): Promise<string> => {
  const ext = file.name.split('.').pop() || 'jpg';
  return uploadPhoto(file, `avatars/${userId}_${Date.now()}.${ext}`);
};

export const uploadWorkoutPhoto = async (userId: string, file: File): Promise<string> => {
  const ext = file.name.split('.').pop() || 'jpg';
  return uploadPhoto(file, `workouts/${userId}_${Date.now()}.${ext}`);
};

// ── leaderboard ──

export const getLeaderboard = async (maxCount = 10) => {
  const q = query(collection(db, 'users'), orderBy('streak', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), uid: d.id }));
};
