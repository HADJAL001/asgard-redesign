import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { create } from 'zustand';

const BIOMETRIC_ENABLED_KEY = 'osgard_biometric_enabled';

type BiometricState = {
  isHydrated: boolean;
  /** Пользователь явно включил вход по биометрии (после первого успешного пароль-входа). */
  isEnabled: boolean;
  /** Есть ли на устройстве работающий сенсор + хотя бы один зарегистрированный отпечаток/лицо. */
  isAvailable: boolean;
  /** Пройдена ли биометрия уже в этом запуске приложения — сбрасывается только при перезапуске,
   *  чтобы lock-screen не всплывал повторно при каждой навигации внутри одной сессии. */
  unlockedThisSession: boolean;
  hydrate: () => Promise<void>;
  checkAvailability: () => Promise<boolean>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  authenticate: () => Promise<boolean>;
  markUnlocked: () => void;
};

export const useBiometricStore = create<BiometricState>((set, get) => ({
  isHydrated: false,
  isEnabled: false,
  isAvailable: false,
  unlockedThisSession: false,

  hydrate: async () => {
    const [enabledRaw, available] = await Promise.all([
      AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY),
      get().checkAvailability(),
    ]);
    set({ isEnabled: enabledRaw === '1', isAvailable: available, isHydrated: true });
  },

  checkAvailability: async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
    set({ isAvailable: isEnrolled });
    return isEnrolled;
  },

  enable: async () => {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, '1');
    set({ isEnabled: true });
  },

  disable: async () => {
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    set({ isEnabled: false });
  },

  authenticate: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Войдите с помощью биометрии',
      cancelLabel: 'Отмена',
      disableDeviceFallback: false,
    });
    if (result.success) {
      set({ unlockedThisSession: true });
    }
    return result.success;
  },

  markUnlocked: () => set({ unlockedThisSession: true }),
}));
