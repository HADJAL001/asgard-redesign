import { useQuery } from '@tanstack/react-query';
import { fetchTrades } from '@/lib/tc-market-api';

export const TRADES_QUERY_KEY = ['tc-market', 'trades'] as const;

export function useTradesQuery() {
  return useQuery({
    queryKey: TRADES_QUERY_KEY,
    queryFn: fetchTrades,
  });
}
