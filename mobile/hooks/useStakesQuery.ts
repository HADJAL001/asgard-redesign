import { useQuery } from '@tanstack/react-query';
import { fetchStakes } from '@/lib/stakes-api';

export const STAKES_QUERY_KEY = ['stakes'] as const;

export function useStakesQuery() {
  return useQuery({
    queryKey: STAKES_QUERY_KEY,
    queryFn: fetchStakes,
  });
}
