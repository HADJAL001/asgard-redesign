import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateAiArtifact } from '@/lib/artifacts-api';
import type { OsgardArtifact, OsgardWallet } from '@/types/artifact';
import { ARTIFACTS_QUERY_KEY } from '@/hooks/useArtifactsQuery';
import { WALLET_QUERY_KEY } from '@/hooks/useWalletQuery';

export const AI_GENERATE_COST_TC = 50;

export function useGenerateArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (hint: string) => generateAiArtifact(hint),
    onSuccess: (data) => {
      queryClient.setQueryData<OsgardArtifact[]>(ARTIFACTS_QUERY_KEY, (old) =>
        old ? [data.artifact, ...old] : [data.artifact],
      );
      queryClient.setQueryData<OsgardWallet>(WALLET_QUERY_KEY, (old) =>
        old ? { ...old, timecoin: old.timecoin - AI_GENERATE_COST_TC } : old,
      );
    },
  });
}
