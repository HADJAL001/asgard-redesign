"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Navbar } from "./navbar"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { orchestratorApi } from "@/lib/orchestrator/api"
import { ApiError } from "@/lib/api-client"
import { OrchestratorPanel } from "./orchestrator/OrchestratorPanel"
import { OrchestratorEditor } from "./orchestrator/OrchestratorEditor"
import type { OrchestratorChain } from "@/lib/orchestrator/types"

interface OrchestratorEditorViewProps {
  chainId: number | "new"
}

export function OrchestratorEditorView({ chainId }: OrchestratorEditorViewProps) {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const autoRun = searchParams.get("run") === "1"

  const [chain, setChain] = useState<OrchestratorChain | null>(null)
  const [loading, setLoading] = useState(chainId !== "new")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (chainId === "new") return
    let cancelled = false
    setLoading(true)
    setError(null)
    orchestratorApi
      .getChain(chainId)
      .then((data) => {
        if (!cancelled) setChain(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("orchestrator.loadError"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId])

  return (
    <div className="flex min-h-screen flex-col font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 gap-4 px-6 py-8 md:px-10">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-32">
            <Loader2 size={24} className="animate-spin" style={{ color: COLORS.accent }} />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center py-32">
            <p className="rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: COLORS.red }}>
              {error}
            </p>
          </div>
        ) : (
          <>
            <OrchestratorPanel />
            <OrchestratorEditor chainId={chainId} initialChain={chain} autoRun={autoRun} />
          </>
        )}
      </main>
    </div>
  )
}
