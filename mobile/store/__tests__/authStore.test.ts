jest.mock('@/lib/api-client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  getAccessToken: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

import { apiClient, clearTokens, getAccessToken, setTokens } from '@/lib/api-client';
import { useAuthStore } from '../authStore';

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedGetAccessToken = getAccessToken as jest.Mock;
const mockedSetTokens = setTokens as jest.Mock;
const mockedClearTokens = clearTokens as jest.Mock;

function resetStore() {
  useAuthStore.setState({ user: null, isHydrated: false, isAuthenticated: false });
}

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  it('login stores tokens and marks the user as authenticated', async () => {
    const user = { id: 1, username: 'alex_odin' };
    mockedApiClient.post.mockResolvedValue({ success: true, token: 'a', refreshToken: 'r', user });

    const result = await useAuthStore.getState().login('alex_odin', 'password123');

    expect(result).toEqual({ ok: true });
    expect(mockedSetTokens).toHaveBeenCalledWith('a', 'r');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('login surfaces a failure message without authenticating', async () => {
    mockedApiClient.post.mockRejectedValue(new Error('Неверный пароль'));

    const result = await useAuthStore.getState().login('alex_odin', 'wrong');

    expect(result).toEqual({ ok: false, message: 'Неверный пароль' });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('logout clears tokens and resets state', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'alex_odin' }, isAuthenticated: true, isHydrated: true });

    await useAuthStore.getState().logout();

    expect(mockedClearTokens).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('hydrate without a stored token marks the store hydrated but unauthenticated', async () => {
    mockedGetAccessToken.mockResolvedValue(null);

    await useAuthStore.getState().hydrate();

    expect(mockedApiClient.get).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isHydrated).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('hydrate with a valid token fetches the current user', async () => {
    const user = { id: 1, username: 'alex_odin' };
    mockedGetAccessToken.mockResolvedValue('token-123');
    mockedApiClient.get.mockResolvedValue({ user });

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });

  it('hydrate with an invalid token clears it and resets state', async () => {
    mockedGetAccessToken.mockResolvedValue('stale-token');
    mockedApiClient.get.mockRejectedValue(new Error('unauthorized'));

    await useAuthStore.getState().hydrate();

    expect(mockedClearTokens).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });
});
