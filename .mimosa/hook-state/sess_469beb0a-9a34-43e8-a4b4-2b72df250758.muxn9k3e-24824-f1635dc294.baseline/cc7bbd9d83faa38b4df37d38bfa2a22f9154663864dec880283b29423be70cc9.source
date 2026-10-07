import type { CapacitorConfig } from '@capacitor/cli';

/**
 * FitGroup Capacitor Configuration
 *
 * 启动策略说明：
 * 1. 默认采用本地打包资源（dist/）启动，本地静态资源直接通过 WebView 加载，避免网络波动导致静态页面加载白屏；应用内动态业务数据仍依赖 Supabase 网络服务。
 * 2. 远程热更新 Web 壳模式（指向 https://app.du4s.com）仅在非生产环境下显式传入 CAP_DEV_REMOTE=true 时激活。
 * 3. 生产安全防线（Production Guard）：生产构建（NODE_ENV=production）严禁配置远程 URL。任何远程标志在生产模式下必须直接失败中断构建，严禁静默移除或绕过。
 */
const REMOTE_SERVER_URL = 'https://app.du4s.com';

const isProduction = process.env.NODE_ENV === 'production';
const isDevRemote = process.env.CAP_DEV_REMOTE === 'true';

// 生产安全防线：生产构建下严禁任何远程服务配置（杜绝 CAP_ALLOW_REMOTE_PROD 等任何后门）
if (isProduction && (isDevRemote || process.env.CAP_REMOTE === 'true' || process.env.CAP_DEV === 'true' || process.env.CAP_ALLOW_REMOTE_PROD === 'true')) {
  throw new Error(
    '❌ [FATAL PRODUCTION GUARD] Remote server configuration is strictly prohibited in production builds (NODE_ENV=production). Build aborted.'
  );
}

// 仅在非生产环境下通过显式 CAP_DEV_REMOTE=true 标志激活远程热更新
const useRemote = !isProduction && isDevRemote;

const config: CapacitorConfig = {
  appId: 'com.fitgroup.app',
  appName: 'FitGroup',
  webDir: 'dist',
  android: {
    backgroundColor: '#F4F4F4',
  },
  ...(useRemote
    ? {
        server: {
          url: REMOTE_SERVER_URL,
          cleartext: false,
        },
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#F4F4F4',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F4F4F4',
      overlaysWebView: false,
    },

    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
};

export default config;
