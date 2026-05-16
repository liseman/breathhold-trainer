import type { ExpoConfig } from 'expo/config';

const REPO_NAME = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'breathhold-trainer';
const baseUrl = process.env.EXPO_PUBLIC_BASE_PATH || `/${REPO_NAME}`;

const config: ExpoConfig = {
  name: 'BreathHold Trainer',
  slug: 'breathhold-trainer',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#08111f',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'ai.openclaw.breathholdtrainer',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#08111f',
    },
    edgeToEdgeEnabled: true,
    package: 'ai.openclaw.breathholdtrainer',
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  experiments: {
    baseUrl,
  },
};

export default config;
