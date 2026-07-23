import { useQuery } from '@tanstack/react-query';
import { fetchOrderBook } from '@/lib/tc-market-api';

export const ORDER_BOOK_QUERY_KEY = ['tc-market', 'orderbook'] as const;

export function useOrderBookQuery() {
  return useQuery({
    queryKey: ORDER_BOOK_QUERY_KEY,
    queryFn: fetchOrderBook,
  });
}
