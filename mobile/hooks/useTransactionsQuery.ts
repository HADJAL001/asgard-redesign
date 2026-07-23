import { useQuery } from '@tanstack/react-query';
import { fetchTransactions } from '@/lib/transactions-api';

export const TRANSACTIONS_QUERY_KEY = ['transactions'] as const;

export function useTransactionsQuery() {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEY,
    queryFn: fetchTransactions,
  });
}
