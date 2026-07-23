import { useQuery } from '@tanstack/react-query';
import { fetchWallet } from '@/lib/artifacts-api';

export const WALLET_QUERY_KEY = ['wallet'] as const;

export function useWalletQuery() {
  return useQuery({
    queryKey: WALLET_QUERY_KEY,
    queryFn: fetchWallet,
  });
}
