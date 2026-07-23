import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMarketBuy } from '@/lib/tc-market-api';
import type { TcPriceState } from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';
import { WALLET_QUERY_KEY } from '@/hooks/useWalletQuery';
import { TC_STATE_QUERY_KEY } from '@/hooks/useTcMarketQuery';

export function useMarketBuyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (usdAmount: number) => createMarketBuy(usdAmount),
    onSuccess: (data) => {
      queryClient.setQueryData<OsgardWallet>(WALLET_QUERY_KEY, data.wallet);
      queryClient.setQueryData<TcPriceState & { history: unknown[] }>(TC_STATE_QUERY_KEY, (old) =>
        old ? { ...old, price: data.trade.newPrice } : old,
      );
    },
  });
}
