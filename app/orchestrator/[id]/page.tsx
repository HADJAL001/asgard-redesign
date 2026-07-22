"use client"

import dynamic from "next/dynamic"

const OrchestratorEditorView = dynamic(
  () => import("@/components/orchestrator-editor-view").then((m) => m.OrchestratorEditorView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
    ssr: false,
  }
)

export default function Page({ params }: { params: { id: string } }) {
  const chainId = params.id === "new" ? "new" : Number(params.id)
  return <OrchestratorEditorView chainId={chainId} />
}
