import { apiClient } from '@/lib/api-client';
import type { MarketListing } from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';

export async function fetchMarketplaceListings(): Promise<MarketListing[]> {
  const data = await apiClient.get<{ listings: MarketListing[] }>('/marketplace/listings');
  return data.listings;
}

export async function buyListing(listingId: MarketListing['id']): Promise<OsgardWallet> {
  const data = await apiClient.post<{ wallet: OsgardWallet }>(`/marketplace/${listingId}/buy`);
  return data.wallet;
}
