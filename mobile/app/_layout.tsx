import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import '../global.css';

import { OfflineBanner } from '@/components/OfflineBanner';
import { ToastProvider } from '@/components/ui/Toast';
import { useColorScheme } from '@/hooks/useColorScheme';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { setupPushNotifications } from '@/lib/push';
import { setupQuerySync } from '@/lib/querySync';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useBiometricStore } from '@/store/biometricStore';
import { useGuestStore } from '@/store/guestStore';
import { useArchiveStore } from '@/store/archiveStore';
import { usePrefsStore } from '@/store/prefsStore';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  });

  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const isAuthHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const justLoggedIn = useAuthStore((s) => s.justLoggedIn);

  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const isOnboardingHydrated = useOnboardingStore((s) => s.isHydrated);
  const hasSeenOnboarding = useOnboardingStore((s) => s.hasSeenOnboarding);

  const hydrateBiometric = useBiometricStore((s) => s.hydrate);
  const isBiometricHydrated = useBiometricStore((s) => s.isHydrated);
  const biometricEnabled = useBiometricStore((s) => s.isEnabled);
  const unlockedThisSession = useBiometricStore((s) => s.unlockedThisSession);

  const hydrateGuest = useGuestStore((s) => s.hydrate);
  const isGuestHydrated = useGuestStore((s) => s.isHydrated);

  const hydrateArchive = useArchiveStore((s) => s.hydrate);
  const isArchiveHydrated = useArchiveStore((s) => s.isHydrated);

  const hydratePrefs = usePrefsStore((s) => s.hydrate);

  const storesReady =
    isAuthHydrated && isOnboardingHydrated && isBiometricHydrated && isGuestHydrated && isArchiveHydrated;
  const appReady = loaded && storesReady;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  // Разовая инициализация: подписка на сеть/фокус приложения для авто-рефетча React Query
  // + гидратация всех локальных stores (auth/onboarding/biometric/guest) из secure storage.
  useEffect(() => {
    const unsubscribe = setupQuerySync();
    hydrateAuth();
    hydrateOnboarding();
    hydrateBiometric();
    hydrateGuest();
    hydrateArchive();
    hydratePrefs();
    return unsubscribe;
  }, [hydrateAuth, hydrateOnboarding, hydrateBiometric, hydrateGuest, hydrateArchive, hydratePrefs]);

  // Регистрация push-токена возможна только после того, как известен пользователь
  // (эндпоинт /push/register требует авторизации).
  useEffect(() => {
    if (isAuthenticated) {
      setupPushNotifications();
    }
  }, [isAuthenticated]);

  // Переход на целевой экран по клику на push-уведомление.
  const responseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener>>();
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (typeof screen === 'string') {
        router.push(screen as any);
      }
    });
    return () => responseListener.current?.remove();
  }, [router]);

  // Централизованный route-guard: решает, куда пользователь должен попасть, исходя из
  // онбординга/авторизации/биометрии — вместо того, чтобы раскидывать эту логику по экранам.
  useEffect(() => {
    if (!appReady) return;

    const current = segments[0] as string | undefined;
    const inAuthGroup = current === '(auth)';
    const onOnboarding = current === 'onboarding';
    const onGuestHome = current === 'guest-home';
    const onBiometricLock = current === 'biometric-lock';

    if (!hasSeenOnboarding) {
      if (!onOnboarding) router.replace('/onboarding');
      return;
    }

    if (isAuthenticated) {
      const needsBiometricUnlock = biometricEnabled && !unlockedThisSession && !justLoggedIn;
      if (needsBiometricUnlock) {
        if (!onBiometricLock) router.replace('/biometric-lock');
        return;
      }
      if (inAuthGroup || onOnboarding || onGuestHome || onBiometricLock) {
        router.replace('/(tabs)');
      }
      return;
    }

    // Неавторизован: гостевой режим и экраны входа/регистрации разрешены явно, всё
    // остальное (включая lock-screen, который без сессии показывать нечего) — редирект на вход.
    if (!inAuthGroup && !onGuestHome) {
      router.replace('/(auth)/login');
    }
  }, [
    appReady,
    segments,
    hasSeenOnboarding,
    isAuthenticated,
    biometricEnabled,
    unlockedThisSession,
    justLoggedIn,
    router,
  ]);

  if (!appReady) {
    return null;
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ToastProvider>
          <OfflineBanner />
          <Stack screenOptions={{ animation: 'slide_from_right' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="guest-home" options={{ title: 'Гостевой режим' }} />
            <Stack.Screen
              name="biometric-lock"
              options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
            />
            <Stack.Screen name="result/[id]" options={{ title: 'Артефакт', animation: 'fade' }} />
            <Stack.Screen name="marketplace/sell" options={{ title: 'Продать артефакт' }} />
            <Stack.Screen name="wallet/transfer" options={{ title: 'Перевод TimeCoin' }} />
            <Stack.Screen name="wallet/convert" options={{ title: 'Конвертация валют' }} />
            <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
        </ToastProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
