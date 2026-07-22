"use client"

/* ================================================================
   OSGARD · QuickStartModal
   ----------------------------------------------------------------
   «Быстрый старт»: пользователь одной фразой описывает приложение —
   AI-конвейер (ChainManager, POST /generate-project) собирает его
   за 8 стадий (Аналитик → ... → Безопасник), прогресс идёт по SSE
   (useTaskStatus), результат — карточка со ссылками или демо-плашка.

   remaining/limit — необязательные внешние пропсы: этот компонент
   не знает, откуда берётся лимит генераций, только отображает его.
   ================================================================ */

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { PremiumModal } from "@/components/PremiumModal"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { useCreateProject } from "@/hooks/useCreateProject"
import { useTaskStatus } from "@/hooks/useTaskStatus"
import { GenerationProgress } from "./GenerationProgress"
import { GenerationResultCard } from "./GenerationResultCard"

export interface QuickStartModalProps {
  open: boolean
  onClose: () => void
  onCreated?: (taskId: string) => void
  remaining?: number
  limit?: number
}

export function QuickStartModal({ open, onClose, onCreated, remaining, limit }: QuickStartModalProps) {
  const { t } = useTranslation()
  const { createProject, submitting, error: createError } = useCreateProject()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [submittedName, setSubmittedName] = useState("")

  const run = useTaskStatus(taskId)
  const noQuotaLeft = remaining !== undefined && remaining <= 0

  function handleClose() {
    setTaskId(null)
    setName("")
    setDescription("")
    setNameError(null)
    onClose()
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t("quickStart.errorNameRequired"))
      return
    }
    setNameError(null)

    const newTaskId = await createProject(trimmed, description.trim() || undefined)
    if (newTaskId) {
      setSubmittedName(trimmed)
      setTaskId(newTaskId)
      onCreated?.(newTaskId)
    }
  }

  const showForm = run.status === "idle"
  const showProgress = run.status === "running"
  const showResult = run.status === "success"
  const showFailure = run.status === "error" || run.status === "cancelled"

  return (
    <PremiumModal
      open={open}
      onClose={handleClose}
      title={t("quickStart.title")}
      subtitle={t("quickStart.subtitle")}
      icon={<Sparkles size={22} strokeWidth={1.5} style={{ color: COLORS.accent }} />}
      maxWidth="md"
    >
      {showForm && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[13px] font-medium" style={{ color: COLORS.text }}>
              {t("quickStart.nameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("quickStart.namePlaceholder")}
              className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
              style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            />
            {nameError && (
              <p className="mt-1.5 text-[12px]" style={{ color: COLORS.red }}>
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label className="text-[13px] font-medium" style={{ color: COLORS.text }}>
              {t("quickStart.descriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("quickStart.descriptionPlaceholder")}
              rows={3}
              className="mt-1.5 w-full resize-none rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
              style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            />
          </div>

          {remaining !== undefined && limit !== undefined && (
            <p className="text-[12px]" style={{ color: noQuotaLeft ? COLORS.amber : COLORS.label }}>
              {noQuotaLeft ? t("quickStart.noRemainingGenerations") : t("quickStart.remainingGenerations", { remaining, limit })}
            </p>
          )}

          {createError && (
            <p className="text-[12px]" style={{ color: COLORS.red }}>
              {createError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || noQuotaLeft}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-medium transition-opacity disabled:opacity-60"
            style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
          >
            {submitting ? t("quickStart.creating") : t("quickStart.createButton")}
          </button>
        </div>
      )}

      {showProgress && (
        <GenerationProgress progress={run.progress} activeSteps={run.activeSteps} artifacts={run.artifacts} />
      )}

      {showResult && <GenerationResultCard name={submittedName} result={run.result} />}

      {showFailure && (
        <p className="text-[13px]" style={{ color: COLORS.red }}>
          {run.status === "cancelled" ? t("quickStart.cancelledMessage") : run.error || t("quickStart.errorTaskFailed")}
        </p>
      )}
    </PremiumModal>
  )
}
