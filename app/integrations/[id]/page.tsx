"use client"

import { use } from "react"
import dynamic from "next/dynamic"

const IntegrationsDetailView = dynamic(
  () => import("@/components/integrations-detail-view").then((m) => m.IntegrationsDetailView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  },
)

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const integrationId = id === "new" ? "new" : Number(id)
  return <IntegrationsDetailView id={integrationId} />
}
