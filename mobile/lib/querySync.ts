import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

let initialized = false;

/**
 * Подключает React Query к реальному состоянию сети/приложения:
 * - onlineManager: рефетч зависших запросов при восстановлении сети.
 * - focusManager: рефетч при возврате приложения на передний план (открытие/возврат из фона).
 * Вызывать один раз при старте приложения (см. app/_layout.tsx).
 */
export function setupQuerySync() {
  if (initialized) return;
  initialized = true;

  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
  });

  const onAppStateChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };
  const subscription = AppState.addEventListener('change', onAppStateChange);
  return () => subscription.remove();
}

export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    return NetInfo.addEventListener((state: NetInfoState) => {
      setIsOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
  }, []);
  return isOnline;
}
