import { useMutation, useQueryClient } from '@tanstack/react-query';
import { stakeTC } from '@/lib/stakes-api';
import type { OsgardStake } from '@/types/market';
import { STAKES_QUERY_KEY } from '@/hooks/useStakesQuery';

export function useStakeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amount, days }: { amount: number; days: number }) => stakeTC(amount, days),
    onSuccess: (stake) => {
      queryClient.setQueryData<OsgardStake[]>(STAKES_QUERY_KEY, (old) => (old ? [stake, ...old] : [stake]));
    },
  });
}
