import dynamic from "next/dynamic"

const ActivityFeedView = dynamic(
  () => import("@/components/activity-feed-view").then((m) => m.ActivityFeedView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
  }
)

export default function Page() {
  return <ActivityFeedView />
}
