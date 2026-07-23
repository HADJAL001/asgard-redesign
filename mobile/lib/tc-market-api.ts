import { apiClient } from '@/lib/api-client';
import type { PricePoint } from '@/lib/tc-market';
import type {
  TcPriceState,
  OrderBookState,
  TcTrade,
  UserOrder,
  MarketTradeInfo,
} from '@/types/market';
import type { OsgardWallet } from '@/types/artifact';

export async function fetchTcState(): Promise<TcPriceState & { history: PricePoint[] }> {
  const data = await apiClient.get<TcPriceState & { history?: PricePoint[] }>('/tc-market/state');
  return { ...data, history: Array.isArray(data.history) ? data.history : [] };
}

export async function fetchOrderBook(): Promise<OrderBookState> {
  return apiClient.get<OrderBookState>('/tc-market/orderbook');
}

export async function fetchTrades(): Promise<TcTrade[]> {
  const data = await apiClient.get<{ trades: TcTrade[] }>('/tc-market/trades');
  return data.trades;
}

export async function fetchUserOrders(): Promise<UserOrder[]> {
  const data = await apiClient.get<{ orders: UserOrder[] }>('/tc-market/orders');
  return data.orders;
}

export async function createLimitOrder(
  side: 'buy' | 'sell',
  price: number,
  amount: number,
): Promise<{ order: UserOrder; trades: TcTrade[]; wallet: OsgardWallet; orderbook: OrderBookState }> {
  return apiClient.post('/tc-market/order', { side, price, amount });
}

export async function cancelOrder(
  orderId: number,
): Promise<{ order: UserOrder; wallet: OsgardWallet; orderbook: OrderBookState }> {
  return apiClient.delete(`/tc-market/order/${orderId}`);
}

export async function createMarketBuy(
  usdAmount: number,
): Promise<{ wallet: OsgardWallet; trade: MarketTradeInfo; trades: TcTrade[] }> {
  return apiClient.post('/tc-market/buy', { usdAmount });
}

export async function createMarketSell(
  tcAmount: number,
): Promise<{ wallet: OsgardWallet; trade: MarketTradeInfo; trades: TcTrade[] }> {
  return apiClient.post('/tc-market/sell', { tcAmount });
}
