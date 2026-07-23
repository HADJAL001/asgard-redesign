import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unstakeTC } from '@/lib/stakes-api';
import type { OsgardStake } from '@/types/market';
import { STAKES_QUERY_KEY } from '@/hooks/useStakesQuery';

export function useUnstakeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stakeId: OsgardStake['id']) => unstakeTC(stakeId),
    onSuccess: (data) => {
      queryClient.setQueryData<OsgardStake[]>(STAKES_QUERY_KEY, (old) =>
        old ? old.map((s) => (s.id === data.stake.id ? data.stake : s)) : old,
      );
    },
  });
}
