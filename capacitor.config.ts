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
    LocalNotifications: {
      smallIcon: "ic_stat_studyio",
      iconColor: "#0F172A",
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#050507',
      androidSplashResourceName: 'splash_background',
      showSpinner: false,
    },
  },
};

export default config;