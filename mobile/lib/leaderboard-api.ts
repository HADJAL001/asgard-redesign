import { apiClient } from '@/lib/api-client';
import type { LeaderboardEntry } from '@/types/market';

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const data = await apiClient.get<{ leaderboard: LeaderboardEntry[] }>('/leaderboard');
  return data.leaderboard;
}
