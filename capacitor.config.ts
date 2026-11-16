import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.studyio.app',
  appName: 'study.io',
  webDir: 'public',
  appendUserAgent: 'StudyIoNativeApp',
  server: {
    url: 'https://studyio-web.vercel.app',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#050507',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;