jest.mock('@/lib/api-client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { apiClient, ApiError } from '@/lib/api-client';
import { buyListing, createListing, fetchMarketplaceListings } from '../marketplace-api';

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('marketplace-api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchMarketplaceListings requests the listings endpoint and unwraps the array', async () => {
    const listings = [{ id: 1 }, { id: 2 }];
    mockedApiClient.get.mockResolvedValue({ listings });

    const result = await fetchMarketplaceListings();

    expect(mockedApiClient.get).toHaveBeenCalledWith('/marketplace/listings');
    expect(result).toBe(listings);
  });

  it('buyListing posts to the buy endpoint for the given listing and unwraps the wallet', async () => {
    const wallet = { credits: 100 };
    mockedApiClient.post.mockResolvedValue({ wallet });

    const result = await buyListing(42);

    expect(mockedApiClient.post).toHaveBeenCalledWith('/marketplace/42/buy');
    expect(result).toBe(wallet);
  });

  it('createListing posts artifactId/price/currency and unwraps the created listing', async () => {
    const listing = { id: 7, artifactId: 3, price: 500, currency: 'credits' };
    mockedApiClient.post.mockResolvedValue({ listing });

    const result = await createListing(3, 500, 'credits');

    expect(mockedApiClient.post).toHaveBeenCalledWith('/marketplace/list', {
      artifactId: 3,
      price: 500,
      currency: 'credits',
    });
    expect(result).toBe(listing);
  });

  it('propagates ApiError from buyListing on failure', async () => {
    mockedApiClient.post.mockRejectedValue(new ApiError(400, 'Лот уже продан'));

    await expect(buyListing(1)).rejects.toBeInstanceOf(ApiError);
    await expect(buyListing(1)).rejects.toThrow('Лот уже продан');
  });

  it('propagates ApiError from createListing on failure', async () => {
    mockedApiClient.post.mockRejectedValue(new ApiError(400, 'Артефакт уже выставлен'));

    await expect(createListing(1, 100, 'credits')).rejects.toBeInstanceOf(ApiError);
  });
});
