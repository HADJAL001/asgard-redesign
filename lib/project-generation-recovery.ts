export type RecoverableProject = { id: number; status: string }

/** Returns unique projects whose server-side generation can still be running. */
export function pendingProjectIds(projects: RecoverableProject[]): number[] {
  const ids = new Set<number>()
  for (const project of projects) {
    if (project.status === "generating") ids.add(project.id)
  }
  return [...ids]
}
