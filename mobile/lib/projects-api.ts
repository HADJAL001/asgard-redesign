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

/** Re-run the engineering contour against the files already stored for a project. */
export async function repairProject(id: number) {
  return apiClient.post<{ project?: OsgardProject }>(`/projects/${id}/repair`);
}

/** Start an asynchronous deployment. A broken engineering verdict requires an explicit acknowledgement. */
export async function deployProject(id: number, acknowledgeBroken = false) {
  return apiClient.post<{
    project: OsgardProject;
    deployTarget?: string;
    deployTargetLabel?: string;
  }>(`/projects/${id}/deploy`, { acknowledgeBroken });
}

export async function publishProjectToGithub(id: number, repoName?: string) {
  return apiClient.post<{ repoUrl: string; commitSha: string }>(`/projects/${id}/publish-github`, {
    ...(repoName?.trim() ? { repoName: repoName.trim() } : {}),
  });
}

export async function verifyProjectBuild(id: number) {
  return apiClient.post<{ ok: boolean; skipped?: boolean; timedOut?: boolean; durationMs?: number; logs?: string }>(
    `/projects/${id}/verify-build`,
  );
}

export async function fetchProjectRefinements(id: number) {
  return apiClient.get<{ refinements: ProjectRefinement[]; refinementsRemaining: number }>(
    `/projects/${id}/refinements`,
  );
}
