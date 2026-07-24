import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

const PUSH_ENABLED_KEY = 'osgard_push_enabled';
const REDUCE_MOTION_OVERRIDE_KEY = 'osgard_reduce_motion_override';

export type ReduceMotionOverride = 'system' | 'on' | 'off';

type PrefsState = {
  isHydrated: boolean;
  pushEnabled: boolean;
  reduceMotionOverride: ReduceMotionOverride;
  /** Текущее значение системной настройки "Уменьшить движение", обновляется подпиской. */
  osReduceMotion: boolean;
  /** Итоговое значение, которым должны руководствоваться все анимации в приложении. */
  effectiveReduceMotion: boolean;
  hydrate: () => Promise<void>;
  setPushEnabled: (enabled: boolean) => Promise<void>;
  setReduceMotionOverride: (override: ReduceMotionOverride) => Promise<void>;
};

function computeEffective(override: ReduceMotionOverride, osValue: boolean): boolean {
  if (override === 'system') return osValue;
  return override === 'on';
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  isHydrated: false,
  pushEnabled: true,
  reduceMotionOverride: 'system',
  osReduceMotion: false,
  effectiveReduceMotion: false,

  hydrate: async () => {
    const [pushRaw, overrideRaw, osValue] = await Promise.all([
      AsyncStorage.getItem(PUSH_ENABLED_KEY),
      AsyncStorage.getItem(REDUCE_MOTION_OVERRIDE_KEY),
      AccessibilityInfo.isReduceMotionEnabled?.() ?? Promise.resolve(false),
    ]);
    const override = (overrideRaw as ReduceMotionOverride | null) ?? 'system';
    set({
      pushEnabled: pushRaw === null ? true : pushRaw === '1',
      reduceMotionOverride: override,
      osReduceMotion: osValue,
      effectiveReduceMotion: computeEffective(override, osValue),
      isHydrated: true,
    });

    AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value: boolean) => {
      set({ osReduceMotion: value, effectiveReduceMotion: computeEffective(get().reduceMotionOverride, value) });
    });
  },

  setPushEnabled: async (enabled) => {
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled ? '1' : '0');
    set({ pushEnabled: enabled });
  },

  setReduceMotionOverride: async (override) => {
    await AsyncStorage.setItem(REDUCE_MOTION_OVERRIDE_KEY, override);
    set({ reduceMotionOverride: override, effectiveReduceMotion: computeEffective(override, get().osReduceMotion) });
  },
}));
