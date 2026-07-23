import { useMutation, useQueryClient } from '@tanstack/react-query';
import { convertCurrency } from '@/lib/wallet-api';
import type { CurrencyKey } from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';
import { WALLET_QUERY_KEY } from '@/hooks/useWalletQuery';

export function useWalletConvertMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ from, to, amount }: { from: CurrencyKey; to: CurrencyKey; amount: number }) =>
      convertCurrency(from, to, amount),
    onSuccess: (data) => {
      queryClient.setQueryData<OsgardWallet>(WALLET_QUERY_KEY, data.wallet);
    },
  });
}
