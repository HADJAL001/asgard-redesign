"use client"

import dynamic from "next/dynamic"
import { PageLoader } from "@/components/osgard-loader"

const DashboardView = dynamic(
  () => import("@/components/dashboard-view").then((m) => m.DashboardView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function DashboardPage() {
  return <DashboardView />
}
