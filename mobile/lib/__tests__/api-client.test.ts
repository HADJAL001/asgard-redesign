import { apiClient, ApiError } from '../api-client';

jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    __store: store,
    getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
  };
});

const SecureStore = require('expo-secure-store');

function resetStore() {
  Object.keys(SecureStore.__store).forEach((key) => delete SecureStore.__store[key]);
}

async function seedStore(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await SecureStore.setItemAsync(key, value);
  }
}

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    global.fetch = jest.fn();
  });

  it('attaches Authorization header when an access token exists', async () => {
    await seedStore({ osgard_access_token: 'token-123' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    });

    const result = await apiClient.get('/wallet');

    expect(result).toEqual({ hello: 'world' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer token-123');
  });

  it('refreshes an expired token and retries the request once', async () => {
    await seedStore({ osgard_access_token: 'expired-token', osgard_refresh_token: 'refresh-token' });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: 'new-token' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ balance: 42 }) });

    const result = await apiClient.get('/wallet');

    expect(result).toEqual({ balance: 42 });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('osgard_access_token', 'new-token');
    const lastCallHeaders = (global.fetch as jest.Mock).mock.calls[2][1].headers;
    expect(lastCallHeaders.Authorization).toBe('Bearer new-token');
  });

  it('clears tokens and gives up when the refresh token is also invalid', async () => {
    await seedStore({ osgard_access_token: 'expired-token', osgard_refresh_token: 'refresh-token' });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Invalid refresh token' }) });

    await expect(apiClient.get('/wallet')).rejects.toBeInstanceOf(ApiError);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('throws ApiError with the server-provided message on failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
    });

    await expect(apiClient.post('/wallet', {})).rejects.toThrow('Bad request');
  });
});
