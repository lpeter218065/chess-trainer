import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.xu.chesstrainer',
  appName: '国际象棋训练',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    Keyboard: {
      resize: 'native',
    },
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
