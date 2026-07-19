"use client"

import dynamic from "next/dynamic"

const ProjectsView = dynamic(
  () => import("@/components/projects-view").then((m) => m.ProjectsView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function ProjectsPage() {
  return <ProjectsView />
}
