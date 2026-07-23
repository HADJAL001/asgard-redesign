import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createLimitOrder } from '@/lib/tc-market-api';
import type { UserOrder, OrderBookState } from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';
import { USER_ORDERS_QUERY_KEY } from '@/hooks/useUserOrdersQuery';
import { ORDER_BOOK_QUERY_KEY } from '@/hooks/useOrderBookQuery';
import { WALLET_QUERY_KEY } from '@/hooks/useWalletQuery';

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ side, price, amount }: { side: 'buy' | 'sell'; price: number; amount: number }) =>
      createLimitOrder(side, price, amount),
    onSuccess: (data) => {
      queryClient.setQueryData<UserOrder[]>(USER_ORDERS_QUERY_KEY, (old) =>
        old ? [data.order, ...old] : [data.order],
      );
      queryClient.setQueryData<OrderBookState>(ORDER_BOOK_QUERY_KEY, data.orderbook);
      queryClient.setQueryData<OsgardWallet>(WALLET_QUERY_KEY, data.wallet);
    },
  });
}
