import { useQuery } from '@tanstack/react-query';
import { fetchForgeLoadout } from '@/lib/artifacts-api';

export const FORGE_LOADOUT_QUERY_KEY = ['forge-loadout'] as const;

export function useForgeLoadoutQuery() {
  return useQuery({
    queryKey: FORGE_LOADOUT_QUERY_KEY,
    queryFn: fetchForgeLoadout,
  });
}
