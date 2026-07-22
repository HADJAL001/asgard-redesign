import dynamic from "next/dynamic"

const OrchestratorEditorView = dynamic(
  () => import("@/components/orchestrator-editor-view").then((m) => m.OrchestratorEditorView),
  {
    loading: () => (
      <div className="flex items-center justify-center py-32" style={{ color: "#6A6A8A" }}>
        Загрузка…
      </div>
    ),
  }
)

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const chainId = id === "new" ? "new" : Number(id)
  return <OrchestratorEditorView chainId={chainId} />
}
