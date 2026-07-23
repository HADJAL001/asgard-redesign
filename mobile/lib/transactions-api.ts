import { apiClient } from '@/lib/api-client';
import type { OsgardTransaction } from '@/types/market';

export async function fetchTransactions(): Promise<OsgardTransaction[]> {
  const data = await apiClient.get<{ transactions: OsgardTransaction[] }>('/transactions');
  return data.transactions;
}
