let mockIsDevice = true;
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('@/lib/api-client', () => ({ apiClient: { post: jest.fn() } }));

import { apiClient } from '@/lib/api-client';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, registerPushTokenWithBackend, setupPushNotifications } from '../push';

describe('push notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDevice = true;
  });

  it('returns null on simulators/emulators without a real push service', async () => {
    mockIsDevice = false;

    const token = await registerForPushNotificationsAsync();

    expect(token).toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not already granted and returns null on denial', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const token = await registerForPushNotificationsAsync();

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(token).toBeNull();
  });

  it('returns the Expo push token once permission is granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[abc]' });

    const token = await registerForPushNotificationsAsync();

    expect(token).toBe('ExponentPushToken[abc]');
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
  });

  it('sends the token and platform to the backend', async () => {
    await registerPushTokenWithBackend('ExponentPushToken[abc]');

    expect(apiClient.post).toHaveBeenCalledWith('/push/register', {
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
    });
  });

  it('swallows backend registration failures and still returns the token', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[xyz]' });
    (apiClient.post as jest.Mock).mockRejectedValue(new Error('network error'));

    const token = await setupPushNotifications();

    expect(token).toBe('ExponentPushToken[xyz]');
  });
});
