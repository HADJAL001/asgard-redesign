import { useQuery } from '@tanstack/react-query';
import { fetchTcState } from '@/lib/tc-market-api';

export const TC_STATE_QUERY_KEY = ['tc-market', 'state'] as const;

export function useTcMarketQuery() {
  return useQuery({
    queryKey: TC_STATE_QUERY_KEY,
    queryFn: fetchTcState,
  });
}
