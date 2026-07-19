import { ArtifactDetailView } from "@/components/artifact-detail-view"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ArtifactDetailView id={Number(id)} />
}
