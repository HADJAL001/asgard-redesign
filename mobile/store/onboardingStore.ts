import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const ONBOARDING_SEEN_KEY = 'osgard_onboarding_seen';

type OnboardingState = {
  isHydrated: boolean;
  hasSeenOnboarding: boolean;
  hydrate: () => Promise<void>;
  markSeen: () => Promise<void>;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isHydrated: false,
  hasSeenOnboarding: false,

  hydrate: async () => {
    const raw = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
    set({ hasSeenOnboarding: raw === '1', isHydrated: true });
  },

  markSeen: async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    set({ hasSeenOnboarding: true });
  },
}));
