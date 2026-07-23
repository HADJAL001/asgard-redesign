"use client"

import dynamic from "next/dynamic"

const IntegrationsView = dynamic(
  () => import("@/components/integrations-view").then((m) => m.IntegrationsView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  },
)

export default function IntegrationsPage() {
  return <IntegrationsView />
}
