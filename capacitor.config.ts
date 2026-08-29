import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fitgroup.app',
  appName: 'FitGroup',
  webDir: 'dist',
  android: {
    backgroundColor: '#F4F4F4',
  },
  // 远程热更新：APK 启动时从 app.du4s.com 加载最新 web 内容（同一 Vercel 项目的自定义域名）
  // 如需打包纯本地离线资源 APK，请注释 server 配置
  server: {
    url: 'https://app.du4s.com',
    cleartext: false,
  },
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
