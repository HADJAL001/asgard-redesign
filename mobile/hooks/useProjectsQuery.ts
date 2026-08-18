import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '@/lib/projects-api';

export const PROJECTS_QUERY_KEY = ['projects'] as const;

export function useProjectsQuery() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: fetchProjects,
    staleTime: 15_000,
  });
}
