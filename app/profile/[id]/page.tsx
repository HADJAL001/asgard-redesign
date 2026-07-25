import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const PublicProfileView = dynamic(
  () => import("@/components/public-profile-view").then((m) => m.PublicProfileView),
  {
    loading: () => <PageLoader />,
  }
)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PublicProfileView userId={Number(id)} />
}
