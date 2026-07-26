import { useMutation, useQueryClient } from '@tanstack/react-query';
import { equipArtifact } from '@/lib/artifacts-api';
import type { ForgeLoadout } from '@/types/artifact';
import { FORGE_LOADOUT_QUERY_KEY } from '@/hooks/useForgeLoadoutQuery';
import { ARTIFACTS_QUERY_KEY } from '@/hooks/useArtifactsQuery';

export function useEquipArtifactMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (artifactId: number) => equipArtifact(artifactId),
    onSuccess: (loadout) => {
      queryClient.setQueryData<ForgeLoadout>(FORGE_LOADOUT_QUERY_KEY, loadout);
      // Список артефактов не меняется составом, но карточка может отрисовывать equippedAt.
      queryClient.invalidateQueries({ queryKey: ARTIFACTS_QUERY_KEY });
    },
  });
}
