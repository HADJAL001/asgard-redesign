import { apiClient } from '@/lib/api-client';
import type { OsgardStake } from '@/types/market';

export async function fetchStakes(): Promise<OsgardStake[]> {
  const data = await apiClient.get<{ stakes: OsgardStake[] }>('/stakes');
  return data.stakes;
}

export async function stakeTC(amount: number, days: number): Promise<OsgardStake> {
  const data = await apiClient.post<{ stake: OsgardStake }>('/stakes', { amount, days });
  return data.stake;
}

export async function unstakeTC(
  stakeId: OsgardStake['id'],
): Promise<{ stake: OsgardStake; reward: number; totalReturn: number; matured: boolean }> {
  return apiClient.post(`/stakes/${stakeId}/unstake`);
}
