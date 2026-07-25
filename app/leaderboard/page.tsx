"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const LeaderboardView = dynamic(
  () => import("@/components/leaderboard-view").then((m) => m.LeaderboardView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function LeaderboardPage() {
  return <LeaderboardView />
}
