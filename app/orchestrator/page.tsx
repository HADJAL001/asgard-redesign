"use client"

import dynamic from "next/dynamic"

const OrchestratorView = dynamic(
  () => import("@/components/orchestrator-view").then((m) => m.OrchestratorView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function OrchestratorPage() {
  return <OrchestratorView />
}
