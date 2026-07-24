/**
 * Detox конфиг для OSGARD mobile (Expo SDK 52 / RN 0.76).
 *
 * Приложение — managed Expo с несколькими native-модулями (config plugins),
 * поэтому перед сборкой нужен `npx expo prebuild` — Detox тестирует
 * native-бинарник, а не JS-бандл напрямую.
 *
 * Запуск (не выполнялся в этой среде — нет Android SDK/Xcode):
 *   npx expo prebuild
 *   npm run e2e:build:android && npm run e2e:test:android
 *   npm run e2e:build:ios && npm run e2e:test:ios   (только на macOS)
 *
 * @type {Detox.DetoxConfig}
 */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/mobile.app',
      build:
        'xcodebuild -workspace ios/mobile.xcworkspace -scheme mobile -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build:
        'cd android && ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug && cd ..',
      reversePorts: [8081],
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: { type: 'iPhone 15' },
    },
    emulator: {
      type: 'android.emulator',
      device: { avdName: 'Pixel_7_API_34' },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
