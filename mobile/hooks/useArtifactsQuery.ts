import { useQuery } from '@tanstack/react-query';
import { fetchMyArtifacts } from '@/lib/artifacts-api';
import type { OsgardArtifact } from '@/types/artifact';

export const ARTIFACTS_QUERY_KEY = ['artifacts'] as const;

export function useArtifactsQuery() {
  return useQuery({
    queryKey: ARTIFACTS_QUERY_KEY,
    queryFn: fetchMyArtifacts,
  });
}

function isToday(timestampMs: number): boolean {
  const d = new Date(timestampMs);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Артефакты AI-генерации отличаются от ручной ковки наличием source (POST /artifacts/generate-ai). */
export function countTodayAiGenerated(artifacts: OsgardArtifact[] | undefined): number {
  if (!artifacts) return 0;
  return artifacts.filter((a) => !!a.source && isToday(a.createdAt)).length;
}
