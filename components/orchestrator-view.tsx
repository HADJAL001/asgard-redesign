"use client"

/* ================================================================
   OrchestratorView — список AI-цепочек («Python Snake»)
   ----------------------------------------------------------------
   GET    /orchestrator/chains       — список цепочек пользователя
   DELETE /orchestrator/chains/:id   — удалить цепочку
   Создание — переход на /orchestrator/new (без POST заранее, чтобы
   не плодить пустые записи, если пользователь передумает).
   ================================================================ */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, GitBranch, Play, Pencil, Trash2, Loader2 } from "lucide-react"
import { Navbar } from "./navbar"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { orchestratorApi } from "@/lib/orchestrator/api"
import { ApiError } from "@/lib/api-client"
import type { OrchestratorChain } from "@/lib/orchestrator/types"

export function OrchestratorView() {
  const { t } = useTranslation()
  const router = useRouter()

  const [chains, setChains] = useState<OrchestratorChain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadChains = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await orchestratorApi.getChains()
      setChains(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("orchestrator.loadError"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    Promise.resolve().then(() => loadChains())
  }, [loadChains])

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(t("orchestrator.confirmDelete"))) return
    setDeletingId(id)
    try {
      await orchestratorApi.deleteChain(id)
      setChains((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("orchestrator.deleteError"))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg" style={{ border: `1px solid ${COLORS.border}` }}>
              <GitBranch size={18} strokeWidth={1.5} style={{ color: COLORS.accent }} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-[32px] font-semibold leading-tight">{t("orchestrator.title")}</h1>
              <p className="mt-0.5 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {t("orchestrator.subtitle")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/orchestrator/new")}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {t("orchestrator.createBtn")}
          </button>
        </div>

        {error && (
          <p className="mt-6 rounded-lg px-3 py-2 text-[13px]" style={{ backgroundColor: "rgba(248,113,113,0.1)", color: COLORS.red }}>
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: COLORS.accent }} />
          </div>
        ) : chains.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <GitBranch size={32} strokeWidth={1.25} style={{ color: COLORS.label }} aria-hidden="true" />
            <p style={{ color: COLORS.label }}>{t("orchestrator.emptyState")}</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {chains.map((chain) => (
              <div
                key={chain.id}
                onClick={() => router.push(`/orchestrator/${chain.id}`)}
                className="cursor-pointer rounded-xl p-5 transition-colors"
                style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
              >
                <p className="text-[15px] font-medium">{chain.name}</p>
                {chain.description && (
                  <p className="mt-1 line-clamp-2 text-[13px]" style={{ color: COLORS.label }}>
                    {chain.description}
                  </p>
                )}
                <p className="mt-3 text-[12px]" style={{ color: COLORS.label }}>
                  {t("orchestrator.nodeCount", { count: chain.nodes.length })}
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/orchestrator/${chain.id}?run=1`)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
                    style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                  >
                    <Play size={13} strokeWidth={1.75} />
                    {t("orchestrator.runBtn")}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/orchestrator/${chain.id}`)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    <Pencil size={13} strokeWidth={1.75} />
                    {t("orchestrator.editBtn")}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(chain.id, e)}
                    disabled={deletingId === chain.id}
                    className="ml-auto inline-flex items-center rounded-lg p-1.5 disabled:opacity-50"
                    style={{ color: COLORS.red }}
                  >
                    {deletingId === chain.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={1.75} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
