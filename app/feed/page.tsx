import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const ActivityFeedView = dynamic(
  () => import("@/components/activity-feed-view").then((m) => m.ActivityFeedView),
  {
    loading: () => <PageLoader />,
  }
)

export default function Page() {
  return <ActivityFeedView />
}
