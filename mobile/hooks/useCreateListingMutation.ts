import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createListing } from '@/lib/marketplace-api';
import { MARKETPLACE_QUERY_KEY } from '@/hooks/useMarketplaceQuery';
import { ARTIFACTS_QUERY_KEY } from '@/hooks/useArtifactsQuery';

export function useCreateListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ artifactId, price, currency }: { artifactId: number; price: number; currency: string }) =>
      createListing(artifactId, price, currency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MARKETPLACE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ARTIFACTS_QUERY_KEY });
    },
  });
}
