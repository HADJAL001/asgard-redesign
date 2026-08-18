export type ProjectStatus = 'generating' | 'ready' | 'failed' | string;

export type OsgardProject = {
  id: number;
  name: string;
  description?: string | null;
  badge?: string | null;
  status: ProjectStatus;
  generationError?: string | null;
  createdAt?: number;
  generationDepth?: string | null;
  buildStatus?: string | null;
  deployStatus?: string | null;
  deployError?: string | null;
  liveUrl?: string | null;
  artifactCount?: number;
};

export type ProjectFile = { path: string; content: string; updatedAt?: number };

export type ProjectRefinement = {
  id: number;
  prompt: string;
  kind?: string;
  status: string;
  costCredits: number;
  createdAt?: number;
};
