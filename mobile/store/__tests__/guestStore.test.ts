jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: { post: jest.fn() },
  getGuestClaimToken: jest.fn(),
  clearGuestClaimToken: jest.fn(),
}));

import { apiClient, clearGuestClaimToken, getGuestClaimToken } from '@/lib/api-client';
import { useGuestStore } from '../guestStore';

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedGetGuestClaimToken = getGuestClaimToken as jest.Mock;
const mockedClearGuestClaimToken = clearGuestClaimToken as jest.Mock;

function resetStore() {
  useGuestStore.setState({ isHydrated: true, generationsUsed: 0, demoProjects: [] });
}

describe('guestStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  it('claims the real guest project and clears its token after a successful transfer', async () => {
    mockedGetGuestClaimToken.mockResolvedValue('guest-token');
    mockedApiClient.post.mockResolvedValue({ ok: true, projectsMoved: 1, artifactsMoved: 2 });

    await useGuestStore.getState().migrateToAccount();

    expect(mockedApiClient.post).toHaveBeenCalledWith('/guest/claim', { guestToken: 'guest-token' });
    expect(mockedClearGuestClaimToken).toHaveBeenCalledTimes(1);
  });

  it('retains the claim token when the transfer cannot complete', async () => {
    mockedGetGuestClaimToken.mockResolvedValue('guest-token');
    mockedApiClient.post.mockRejectedValue(new Error('offline'));

    await useGuestStore.getState().migrateToAccount();

    expect(mockedApiClient.post).toHaveBeenCalledWith('/guest/claim', { guestToken: 'guest-token' });
    expect(mockedClearGuestClaimToken).not.toHaveBeenCalled();
  });

  it('can retry a preserved guest project transfer', async () => {
    mockedGetGuestClaimToken.mockResolvedValue('guest-token');
    mockedApiClient.post
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, projectsMoved: 1, artifactsMoved: 0 });

    await useGuestStore.getState().migrateToAccount();
    await useGuestStore.getState().migrateToAccount();

    expect(mockedApiClient.post).toHaveBeenCalledTimes(2);
    expect(mockedClearGuestClaimToken).toHaveBeenCalledTimes(1);
  });
});
