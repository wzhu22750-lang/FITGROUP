import { createClient } from '@supabase/supabase-js';
import { REQUEST_TIMEOUT_MS } from '../utils/request';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) ||
  (typeof process !== 'undefined' && process.env) ||
  {};
const configuredUrl = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : undefined;
const configuredAnonKey = typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : undefined;

export const supabaseConfigError = !configuredUrl || !configuredAnonKey
  ? '缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，请在构建前配置 .env 环境变量'
  : null;

if (supabaseConfigError) {
  console.error(supabaseConfigError);
}

// Keep module evaluation safe so the app can render a useful configuration error
// instead of leaving the native splash screen over a blank WebView.
const url = configuredUrl || 'https://invalid.localhost';
const anonKey = configuredAnonKey || 'missing-anon-key';

// Central fetch handler:
// 1. Applies cancellable deadline to critical un-signaled read requests centrally via fetch.
// 2. Strict policy: NO automatic write retries (POST, PATCH, PUT, DELETE).
export const customFetch: typeof fetch = async (input, init) => {
  const method = (init?.method || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';

  // If signal is explicitly provided (e.g. from readRequest via abortSignal), delegate directly
  if (init?.signal) {
    return globalThis.fetch(input, init);
  }

  // Bound un-signaled transport calls too (including Auth login/sign-up).
  // Aborting an uncertain write is NOT permission to automatically retry it.
  {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const err = new Error(`Central ${isRead ? 'read' : 'write'} request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      err.name = 'TimeoutError';
      controller.abort(err);
    }, REQUEST_TIMEOUT_MS);

    try {
      return await globalThis.fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

};

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: customFetch,
  },
});
