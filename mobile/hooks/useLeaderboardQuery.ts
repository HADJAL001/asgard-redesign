import { useQuery } from '@tanstack/react-query';
import { fetchLeaderboard } from '@/lib/leaderboard-api';

export const LEADERBOARD_QUERY_KEY = ['leaderboard'] as const;

export function useLeaderboardQuery() {
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEY,
    queryFn: fetchLeaderboard,
  });
}
