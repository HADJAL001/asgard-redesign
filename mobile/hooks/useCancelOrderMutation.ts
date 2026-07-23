import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cancelOrder } from '@/lib/tc-market-api';
import type { UserOrder, OrderBookState } from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';
import { USER_ORDERS_QUERY_KEY } from '@/hooks/useUserOrdersQuery';
import { ORDER_BOOK_QUERY_KEY } from '@/hooks/useOrderBookQuery';
import { WALLET_QUERY_KEY } from '@/hooks/useWalletQuery';

export function useCancelOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: number) => cancelOrder(orderId),
    onSuccess: (data) => {
      queryClient.setQueryData<UserOrder[]>(USER_ORDERS_QUERY_KEY, (old) =>
        old ? old.map((o) => (o.id === data.order.id ? data.order : o)) : old,
      );
      queryClient.setQueryData<OrderBookState>(ORDER_BOOK_QUERY_KEY, data.orderbook);
      queryClient.setQueryData<OsgardWallet>(WALLET_QUERY_KEY, data.wallet);
    },
  });
}
