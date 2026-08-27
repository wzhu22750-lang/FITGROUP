import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fitgroup.app',
  appName: 'FitGroup',
  webDir: 'dist',
  android: {
    backgroundColor: '#F4F4F4',
  },
  // 如需打包纯本地离线资源 APK，请注释 server 配置；如需远程热更新请填入国内可直连域名
  // server: {
  //   url: 'https://fitgroup-three.vercel.app',
  //   cleartext: false,
  // },
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
      style: 'LIGHT',
      backgroundColor: '#F4F4F4',
      overlaysWebView: true,
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
};

export default config;
