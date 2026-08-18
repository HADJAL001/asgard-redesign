import { apiClient } from '@/lib/api-client';
import type { OsgardProject, ProjectFile, ProjectRefinement } from '@/types/project';

export async function fetchProjects(): Promise<OsgardProject[]> {
  const data = await apiClient.get<{ projects: OsgardProject[] }>('/projects/mine');
  return data.projects;
}

export async function fetchProject(id: number): Promise<OsgardProject> {
  const data = await apiClient.get<{ project: OsgardProject }>(`/projects/${id}`);
  return data.project;
}

export async function createProject(input: {
  name?: string;
  hint: string;
  depth?: 'quick' | 'standard' | 'deep';
}): Promise<OsgardProject> {
  const data = await apiClient.post<{ project: OsgardProject }>('/projects/generate', {
    name: input.name?.trim() || undefined,
    hint: input.hint.trim(),
    depth: input.depth ?? 'standard',
    profile: 'static',
  });
  return data.project;
}

export async function fetchProjectFiles(id: number): Promise<ProjectFile[]> {
  const data = await apiClient.get<{ files: ProjectFile[] }>(`/projects/${id}/files`);
  return data.files;
}

export async function refineProject(id: number, prompt: string, kind = 'feature') {
  return apiClient.post<{
    success: boolean;
    projectId: number;
    refinementId: number;
    costCredits: number;
    refinementsRemaining: number;
  }>(`/projects/${id}/refine`, { prompt: prompt.trim(), kind });
}

export async function fetchProjectRefinements(id: number) {
  return apiClient.get<{ refinements: ProjectRefinement[]; refinementsRemaining: number }>(
    `/projects/${id}/refinements`,
  );
}
