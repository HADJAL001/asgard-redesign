import { apiClient } from '@/lib/api-client';

export type DemoArtifact = {
  id: string;
  name: string;
  type: string;
  rarity: string;
  level: number;
  power: number;
  defense: number;
  magic: number;
  speed: number;
  price: number;
  listCurrency: string;
};

export type DemoGenerateResponse = {
  project: { name: string; description: string; badge: string; artifactCount: number };
  artifacts: DemoArtifact[];
  aiSource: string;
  generationsRemaining: number;
  expiresAt: number;
};

/** Анонимная генерация без JWT — backend/src/routes/demo.routes.ts сам ограничивает
 *  до 3 запросов на IP за 24ч, независимо от локального счётчика в guestStore. */
export function generateDemoProject(name: string, hint?: string) {
  return apiClient.post<DemoGenerateResponse>('/demo/generate', { name, hint }, { auth: false });
}
