import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fitgroup.app',
  appName: 'FitGroup',
  webDir: 'dist',
  android: {
    backgroundColor: '#F4F4F4',
  },
  server: {
    url: 'https://fitgroup-three.vercel.app',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false,
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
