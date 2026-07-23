import { useQuery } from '@tanstack/react-query';
import { fetchMarketplaceListings } from '@/lib/marketplace-api';

export const MARKETPLACE_QUERY_KEY = ['marketplace', 'listings'] as const;

export function useMarketplaceQuery() {
  return useQuery({
    queryKey: MARKETPLACE_QUERY_KEY,
    queryFn: fetchMarketplaceListings,
  });
}
