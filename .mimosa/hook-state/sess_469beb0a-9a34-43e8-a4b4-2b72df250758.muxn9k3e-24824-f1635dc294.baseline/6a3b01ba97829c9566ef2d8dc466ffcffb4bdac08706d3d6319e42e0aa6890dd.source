import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version?: string };

export default defineConfig(({ command, mode }) => {
  // Build guard: ensure required Supabase credentials exist before bundling.
  // Production guard: no bypasses permitted — missing environment variables must always fail.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '');
    const rawUrl = process.env.VITE_SUPABASE_URL !== undefined
      ? process.env.VITE_SUPABASE_URL
      : env.VITE_SUPABASE_URL;
    const rawKey = process.env.VITE_SUPABASE_ANON_KEY !== undefined
      ? process.env.VITE_SUPABASE_ANON_KEY
      : env.VITE_SUPABASE_ANON_KEY;

    const supabaseUrl = (rawUrl || '').trim();
    const supabaseAnonKey = (rawKey || '').trim();

    const isInvalidUrl = !supabaseUrl ||
      supabaseUrl === 'https://your-project.supabase.co' ||
      supabaseUrl === 'https://invalid.localhost';
    const isInvalidKey = !supabaseAnonKey ||
      supabaseAnonKey === 'your-anon-or-publishable-key' ||
      supabaseAnonKey === 'missing-anon-key';

    if (isInvalidUrl || isInvalidKey) {
      const reasons: string[] = [];
      if (isInvalidUrl) {
        reasons.push('VITE_SUPABASE_URL is missing, empty, or an unconfigured placeholder');
      }
      if (isInvalidKey) {
        reasons.push('VITE_SUPABASE_ANON_KEY is missing, empty, or an unconfigured placeholder');
      }
      throw new Error(
        `\n❌ [FATAL BUILD GUARD] Production build aborted due to missing environment variables:\n` +
        reasons.map((r) => `  - ${r}`).join('\n') +
        `\n\nEnsure valid credentials are provided in .env or CI environment variables before building.\n`
      );
    }
  }

  return {
    base: '/',
    define: {
      // Single source of app version: injected from package.json so the UI,
      // JSON backup and TXT report can never drift apart.
      __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      entries: ['index.html', 'src/**/*.{ts,tsx}'],
    },
    build: {
      manifest: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('@supabase') || id.includes('supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('html-to-image')) {
                return 'vendor-share';
              }
              if (id.includes('react') || id.includes('scheduler')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
