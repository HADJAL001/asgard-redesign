import { apiClient } from '@/lib/api-client';
import type { ForgeLoadout, OsgardArtifact, OsgardWallet } from '@/types/artifact';

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

/** Снаряжение Кузницы: надетые артефакты + совокупный бонус/скидка (см. mobile/types/artifact.ts). */
export async function fetchForgeLoadout(): Promise<ForgeLoadout> {
  return apiClient.get<ForgeLoadout>('/artifacts/loadout');
}

export async function equipArtifact(artifactId: number): Promise<ForgeLoadout> {
  return apiClient.post<ForgeLoadout>(`/artifacts/${artifactId}/equip`);
}

export async function unequipArtifact(artifactId: number): Promise<ForgeLoadout> {
  return apiClient.post<ForgeLoadout>(`/artifacts/${artifactId}/unequip`);
}
