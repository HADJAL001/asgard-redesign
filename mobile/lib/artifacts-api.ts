import { apiClient } from '@/lib/api-client';
import type { OsgardArtifact, OsgardWallet } from '@/types/artifact';

export async function fetchMyArtifacts(): Promise<OsgardArtifact[]> {
  const data = await apiClient.get<{ artifacts: OsgardArtifact[] }>('/artifacts/mine');
  return data.artifacts;
}

export async function fetchWallet(): Promise<OsgardWallet> {
  const data = await apiClient.get<{ wallet: OsgardWallet }>('/wallet');
  return data.wallet;
}

/** Сервер не принимает параметр темы — она подмешивается в свободный текст hint на клиенте. */
export async function generateAiArtifact(hint: string): Promise<{ artifact: OsgardArtifact; aiSource: string }> {
  return apiClient.post<{ artifact: OsgardArtifact; aiSource: string }>('/artifacts/generate-ai', { hint });
}
