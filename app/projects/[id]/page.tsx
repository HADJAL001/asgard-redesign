import dynamic from "next/dynamic"

const ProjectDetailView = dynamic(
  () => import("@/components/project-detail-view").then((m) => m.ProjectDetailView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
  }
)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectDetailView projectId={Number(id)} />
}
