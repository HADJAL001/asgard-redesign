import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unequipArtifact } from '@/lib/artifacts-api';
import type { ForgeLoadout } from '@/types/artifact';
import { FORGE_LOADOUT_QUERY_KEY } from '@/hooks/useForgeLoadoutQuery';
import { ARTIFACTS_QUERY_KEY } from '@/hooks/useArtifactsQuery';

export function useUnequipArtifactMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (artifactId: number) => unequipArtifact(artifactId),
    onSuccess: (loadout) => {
      queryClient.setQueryData<ForgeLoadout>(FORGE_LOADOUT_QUERY_KEY, loadout);
      queryClient.invalidateQueries({ queryKey: ARTIFACTS_QUERY_KEY });
    },
  });
}
