"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const ProjectsView = dynamic(
  () => import("@/components/projects-view").then((m) => m.ProjectsView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function ProjectsPage() {
  return <ProjectsView />
}
