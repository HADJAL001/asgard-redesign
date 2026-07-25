import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const ProjectDetailView = dynamic(
  () => import("@/components/project-detail-view").then((m) => m.ProjectDetailView),
  {
    loading: () => <PageLoader />,
  }
)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectDetailView projectId={Number(id)} />
}
