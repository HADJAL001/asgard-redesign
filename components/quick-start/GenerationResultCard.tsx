"use client"

/* ================================================================
   OSGARD · GenerationResultCard
   ----------------------------------------------------------------
   Показывает результат завершённой генерации. Пайплайн сейчас
   работает на StubAgent (см. backend/src/services/pipeline-agents.ts),
   поэтому result.appUrl обычно отсутствует — в этом случае карточка
   показывает плашку демо-режима вместо битых ссылок.

   Кнопка «Открыть в оркестраторе» создаёт новую цепочку-заглушку
   (по образцу первого сохранения цепочки в OrchestratorEditor.tsx)
   и переходит на неё.
   ================================================================ */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Workflow, Loader2 } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { orchestratorApi } from "@/lib/orchestrator/api"
import type { TaskStatus } from "@/lib/generation/types"

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.6.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

interface Props {
  name: string
  result: TaskStatus["result"]
}

export function GenerationResultCard({ name, result }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const [openingOrchestrator, setOpeningOrchestrator] = useState(false)
  const [orchestratorError, setOrchestratorError] = useState<string | null>(null)

  const hasRealResult = Boolean(result?.appUrl)

  async function handleOpenOrchestrator() {
    setOrchestratorError(null)
    setOpeningOrchestrator(true)
    try {
      const created = await orchestratorApi.createChain({ name, nodes: [], edges: [] })
      router.push(`/orchestrator/${created.id}`)
    } catch {
      setOrchestratorError(t("quickStart.errorOrchestrator"))
      setOpeningOrchestrator(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <h3 className="text-[15px] font-semibold" style={{ color: COLORS.text }}>
        {hasRealResult ? t("quickStart.resultTitle") : t("quickStart.demoResultTitle")}
      </h3>

      {!hasRealResult && (
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: COLORS.label }}>
          {t("quickStart.demoResultMessage")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        {hasRealResult && (
          <>
            <a
              href={result!.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              <ExternalLink size={14} strokeWidth={2} />
              {t("quickStart.openApp")}
            </a>
            <a
              href={result!.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              <GithubIcon size={14} />
              {t("quickStart.openRepo")}
            </a>
          </>
        )}

        <button
          type="button"
          onClick={handleOpenOrchestrator}
          disabled={openingOrchestrator}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-60"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
        >
          {openingOrchestrator ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <Workflow size={14} strokeWidth={2} />
          )}
          {openingOrchestrator ? t("quickStart.openingOrchestrator") : t("quickStart.openOrchestrator")}
        </button>
      </div>

      {orchestratorError && (
        <p className="mt-3 text-[12px]" style={{ color: COLORS.red }}>
          {orchestratorError}
        </p>
      )}
    </div>
  )
}
