"use client"

import dynamic from "next/dynamic"

const DashboardView = dynamic(
  () => import("@/components/dashboard-view").then((m) => m.DashboardView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function DashboardPage() {
  return <DashboardView />
}
