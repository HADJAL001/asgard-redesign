import dynamic from "next/dynamic"

const PublicProfileView = dynamic(
  () => import("@/components/public-profile-view").then((m) => m.PublicProfileView),
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
  return <PublicProfileView userId={Number(id)} />
}
