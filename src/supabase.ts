import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://icupkwemtyygkcfeedab.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jPHUyzUgx2d_AZ8GLcm8EA_fbN3UJSG';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── credential helpers (localStorage) ──

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
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(36).padStart(2, '0')).join('');
}

// ── auth functions ──

export const registerWithPhone = async (phone: string, displayName: string, photoURL: string) => {
  const email = `${phone}@fitgroup.local`;
  const password = randomPassword();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { displayName, photoURL, phone } },
  });
  if (error) {
    if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
      throw new Error('该手机号已注册，请直接登录');
    }
    throw error;
  }

  if (!data.user) {
    throw new Error('请在 Supabase 后台关闭邮箱验证（Authentication → Settings → Disable email confirmations）');
  }

  saveCredentials(phone, password);

  const { error: insertError } = await supabase.from('users').insert([{
    uid: data.user.id,
    displayName,
    photoURL,
    email,
    phone,
    streak: 0,
    totalWorkouts: 0,
    prs: {},
  }]);
  if (insertError) throw new Error('用户表创建失败，请先在 Supabase SQL Editor 中执行建表 SQL');

  return data.user;
};

export const loginWithPhone = async (phone: string) => {
  const creds = getStoredCredentials();
  if (!creds || creds.phone !== phone) {
    throw new Error('该手机号未在本设备注册，请先注册');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${phone}@fitgroup.local`,
    password: creds.password,
  });
  if (error) {
    if (error.message?.includes('Invalid login credentials')) {
      throw new Error('登录凭证有误，请重新注册');
    }
    throw error;
  }

  return data.user;
};

export const autoLogin = async () => {
  const creds = getStoredCredentials();
  if (!creds) return null;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${creds.phone}@fitgroup.local`,
    password: creds.password,
  });
  if (error) return null;

  return data.user;
};

export const logout = async () => {
  clearCredentials();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

export const onAuthStateChanged = (callback: (user: any) => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(session?.user || null);
    }
  );
  return subscription;
};

// User functions
export const syncUserToDatabase = async (user: any) => {
  const { data, error } = await supabase
    .from('users')
    .select('uid')
    .eq('uid', user.id)
    .single();

  if (!data) {
    const { error: insertError } = await supabase
      .from('users')
      .insert([
        {
          uid: user.id,
          displayName: user.user_metadata?.displayName || user.email?.split('@')[0] || 'User',
          photoURL: user.user_metadata?.photoURL || '',
          email: user.email || '',
          phone: user.user_metadata?.phone || '',
          streak: 0,
          totalWorkouts: 0,
          prs: {},
        },
      ]);
    if (insertError) throw insertError;
  }
};

export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('uid', userId)
    .single();
  
  if (error) throw error;
  return data;
};

export const updateUserProfile = async (userId: string, updates: any) => {
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('uid', userId);
  
  if (error) throw error;
};

// Workout log functions
export const createWorkoutLog = async (logData: any) => {
  const { data, error } = await supabase
    .from('workoutLogs')
    .insert([logData])
    .select();
  
  if (error) throw error;
  return data;
};

export const getWorkoutLogs = (callback: (logs: any[]) => void) => {
  const channel = supabase
    .channel('workout-logs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workoutLogs' }, () => {
      // Handle real-time updates if needed
    })
    .subscribe();

  // Initial fetch
  supabase
    .from('workoutLogs')
    .select('*')
    .order('timestamp', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) {
        callback(data);
      }
    });

  return channel;
};

export const subscribeToWorkoutLogs = (callback: (logs: any[]) => void) => {
  // Initial fetch
  supabase
    .from('workoutLogs')
    .select('*')
    .order('timestamp', { ascending: false })
    .then(({ data, error }) => {
      if (!error && data) {
        callback(data);
      }
    });

  // Subscribe to changes
  const channel = supabase
    .channel('workout-logs-sub')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workoutLogs' }, () => {
      // Refetch logs on any change
      supabase
        .from('workoutLogs')
        .select('*')
        .order('timestamp', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            callback(data);
          }
        });
    })
    .subscribe();

  return channel;
};

// Like functions
export const toggleLike = async (workoutLogId: string, userId: string, hasLiked: boolean) => {
  if (hasLiked) {
    // Remove like
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('workoutLogId', workoutLogId)
      .eq('userId', userId);
    
    if (error) throw error;

    // Decrement likes count
    await supabase
      .from('workoutLogs')
      .update({ likesCount: (await supabase.from('workoutLogs').select('likesCount').eq('id', workoutLogId)).data?.[0]?.likesCount - 1 || 0 })
      .eq('id', workoutLogId);
  } else {
    // Add like
    const { error } = await supabase
      .from('likes')
      .insert([
        {
          workoutLogId,
          userId,
          timestamp: new Date().toISOString(),
        },
      ]);
    
    if (error) throw error;

    // Increment likes count
    const { data } = await supabase
      .from('workoutLogs')
      .select('likesCount')
      .eq('id', workoutLogId)
      .single();
    
    await supabase
      .from('workoutLogs')
      .update({ likesCount: (data?.likesCount || 0) + 1 })
      .eq('id', workoutLogId);
  }
};

export const checkUserLike = async (workoutLogId: string, userId: string) => {
  const { data, error } = await supabase
    .from('likes')
    .select('id')
    .eq('workoutLogId', workoutLogId)
    .eq('userId', userId);
  
  if (error) throw error;
  return data && data.length > 0;
};

export const removeLike = async (workoutLogId: string, userId: string) => {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('workoutLogId', workoutLogId)
    .eq('userId', userId);
  
  if (error) throw error;

  // Decrement likes count
  const { data } = await supabase
    .from('workoutLogs')
    .select('likesCount')
    .eq('id', workoutLogId)
    .single();
  
  await supabase
    .from('workoutLogs')
    .update({ likesCount: Math.max(0, (data?.likesCount || 1) - 1) })
    .eq('id', workoutLogId);
};

export const addLike = async (workoutLogId: string, userId: string) => {
  const { error } = await supabase
    .from('likes')
    .insert([
      {
        workoutLogId,
        userId,
        timestamp: new Date().toISOString(),
      },
    ]);
  
  if (error) throw error;

  // Increment likes count
  const { data } = await supabase
    .from('workoutLogs')
    .select('likesCount')
    .eq('id', workoutLogId)
    .single();
  
  await supabase
    .from('workoutLogs')
    .update({ likesCount: (data?.likesCount || 0) + 1 })
    .eq('id', workoutLogId);
};
