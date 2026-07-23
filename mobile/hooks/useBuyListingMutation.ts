import { useMutation, useQueryClient } from '@tanstack/react-query';
import { buyListing } from '@/lib/marketplace-api';
import type { MarketListing } from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';
import { MARKETPLACE_QUERY_KEY } from '@/hooks/useMarketplaceQuery';
import { WALLET_QUERY_KEY } from '@/hooks/useWalletQuery';

export function useBuyListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: MarketListing['id']) => buyListing(listingId),
    onSuccess: (wallet, listingId) => {
      queryClient.setQueryData<OsgardWallet>(WALLET_QUERY_KEY, wallet);
      queryClient.setQueryData<MarketListing[]>(MARKETPLACE_QUERY_KEY, (old) =>
        old ? old.filter((l) => l.id !== listingId) : old,
      );
    },
  });
}
