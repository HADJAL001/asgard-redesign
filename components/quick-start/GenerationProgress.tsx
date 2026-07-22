"use client"

/* ================================================================
   OSGARD · GenerationProgress
   ----------------------------------------------------------------
   Список 8 стадий пайплайна (Аналитик → ... → Безопасник) с
   индикацией done/active/pending + тонкий прогресс-бар, markup
   идентичен components/project-create-wizard.tsx.
   ================================================================ */

import { Check, Loader2 } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { PIPELINE_STAGES } from "@/lib/generation/stage-meta"
import type { Artifact } from "@/lib/generation/types"

interface Props {
  progress: number
  currentStep: string | null
  artifacts: Artifact[]
}

export function GenerationProgress({ progress, currentStep, artifacts }: Props) {
  const { t } = useTranslation()
  const doneTypes = new Set(artifacts.map((a) => a.type))

  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: COLORS.border }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, backgroundColor: COLORS.accent }}
        />
      </div>

      <ul className="mt-5 flex flex-col gap-2.5">
        {PIPELINE_STAGES.map((stage) => {
          const done = doneTypes.has(stage.type)
          const active = !done && stage.type === currentStep
          return (
            <li key={stage.type} className="flex items-center gap-3 text-[13px]">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `1px solid ${done || active ? COLORS.accent : COLORS.border}`,
                  backgroundColor: done ? COLORS.accent : "transparent",
                }}
              >
                {done && <Check size={12} strokeWidth={2.5} style={{ color: COLORS.bg }} />}
                {active && <Loader2 size={12} strokeWidth={2.5} className="animate-spin" style={{ color: COLORS.accent }} />}
              </span>
              <span style={{ color: done || active ? COLORS.text : COLORS.label }}>
                {t(stage.labelKey)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
