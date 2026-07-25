"use client"

import { use } from "react"
import { PageLoader } from "@/components/osgard-loader"
import dynamic from "next/dynamic"

const OrchestratorEditorView = dynamic(
  () => import("@/components/orchestrator-editor-view").then((m) => m.OrchestratorEditorView),
  {
    loading: () => <PageLoader />,
    ssr: false,
  }
)

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const chainId = id === "new" ? "new" : Number(id)
  return <OrchestratorEditorView chainId={chainId} />
}
