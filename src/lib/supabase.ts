import { createClient } from '@supabase/supabase-js';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

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

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
