"use client"

import dynamic from "next/dynamic"

const ArtifactsView = dynamic(
  () => import("@/components/artifacts-view").then((m) => m.ArtifactsView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function ArtifactsPage() {
  return <ArtifactsView />
}
