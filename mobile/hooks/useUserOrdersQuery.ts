import { useQuery } from '@tanstack/react-query';
import { fetchUserOrders } from '@/lib/tc-market-api';

export const USER_ORDERS_QUERY_KEY = ['tc-market', 'orders'] as const;

export function useUserOrdersQuery() {
  return useQuery({
    queryKey: USER_ORDERS_QUERY_KEY,
    queryFn: fetchUserOrders,
  });
}
