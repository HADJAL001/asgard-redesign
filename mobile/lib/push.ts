import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from '@/lib/api-client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const EAS_PROJECT_ID_PLACEHOLDER = 'YOUR_EAS_PROJECT_ID';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const configuredProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!configuredProjectId || configuredProjectId === EAS_PROJECT_ID_PLACEHOLDER) {
    console.warn('EAS projectId не настроен — push-уведомления отключены');
    return null;
  }

  if (!Device.isDevice) {
    // Push-токены не выдаются на симуляторах/эмуляторах без реального push-сервиса.
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId: configuredProjectId });
    return tokenResponse.data;
  } catch {
    // Нет EAS project id / нет сети до push-сервиса — считаем, что пуши недоступны,
    // а не роняем весь вызов (setupPushNotifications вызывается fire-and-forget).
    return null;
  }
}

export async function registerPushTokenWithBackend(token: string) {
  await apiClient.post('/push/register', {
    token,
    platform: Platform.OS,
  });
}

export async function setupPushNotifications() {
  const token = await registerForPushNotificationsAsync();
  if (!token) return null;
  try {
    await registerPushTokenWithBackend(token);
  } catch {
    // Нет сети/не авторизован — токен зарегистрируется при следующем успешном запуске.
  }
  return token;
}
