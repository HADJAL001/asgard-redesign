"use client"

/* ================================================================
   OSGARD · useTaskStatus
   ----------------------------------------------------------------
   Подписка на SSE-эндпоинт статуса генерации:
   GET /api/task/:taskId/stream
   Тот же origin, что и сайт → cookie авторизации уходит сама
   (withCredentials), кастомные заголовки EventSource не поддерживает.

   Структурная копия hooks/useOrchestratorRun.ts — тот же
   EventSource+useRef+backoff-реконнект, адаптированный под события
   generate-project.routes.ts (task_start/step_start/step_done/
   task_done/task_error/task_cancelled) вместо оркестраторских.

   Бэкенд при коннекте к уже завершённой задаче сразу шлёт
   task_done/task_error и закрывает поток — обрабатывается тем же
   onmessage-путём, что и live-события, отдельной логики не нужно.
   ================================================================ */

import { useEffect, useRef, useState } from "react"
import type { Artifact, GenerationStreamEvent, TaskStatus } from "@/lib/generation/types"
import { PIPELINE_STAGES } from "@/lib/generation/stage-meta"

export type GenerationRunStatus = "idle" | "running" | "success" | "error" | "cancelled"

export interface GenerationRunState {
  status: GenerationRunStatus
  progress: number
  /** Может содержать больше одного шага одновременно — optimized+security
   *  выполняются параллельной стадией на бэкенде (chain-manager.ts), поэтому
   *  вместо одиночного currentStep фронт держит множество активных шагов. */
  activeSteps: string[]
  artifacts: Artifact[]
  result?: TaskStatus["result"]
  error?: string
}

const MAX_RECONNECT_ATTEMPTS = 5
const TOTAL_STAGES = PIPELINE_STAGES.length

function computeProgress(artifacts: Artifact[]): number {
  if (TOTAL_STAGES === 0) return 0
  return Math.round((artifacts.length / TOTAL_STAGES) * 100)
}

const INITIAL_STATE: GenerationRunState = {
  status: "idle",
  progress: 0,
  activeSteps: [],
  artifacts: [],
}

/**
 * @param taskId  id задачи (из useCreateProject). null — нет активной генерации.
 */
export function useTaskStatus(taskId: string | null): GenerationRunState {
  const [state, setState] = useState<GenerationRunState>(INITIAL_STATE)

  const sourceRef = useRef<EventSource | null>(null)
  const attemptsRef = useRef(0)
  const prevTaskIdRef = useRef<string | null>(null)

  useEffect(() => {
    const prevId = prevTaskIdRef.current
    prevTaskIdRef.current = taskId

    if (taskId === null) {
      sourceRef.current?.close()
      sourceRef.current = null
      // taskId ушёл в null, пока генерация ещё шла (caller отменил/сбросил) -> cancelled.
      // Уже завершённая генерация (success/error) сбросом в null не перетирается.
      if (prevId !== null) {
        setState((prev) => (prev.status === "running" ? { ...prev, status: "cancelled" } : prev))
      }
      return
    }

    attemptsRef.current = 0
    Promise.resolve().then(() => setState({ ...INITIAL_STATE, status: "running" }))

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      const source = new EventSource(`/api/task/${taskId}/stream`, { withCredentials: true })
      sourceRef.current = source

      source.onopen = () => {
        attemptsRef.current = 0
      }

      source.onmessage = (event) => {
        let payload: GenerationStreamEvent
        try {
          payload = JSON.parse(event.data)
        } catch {
          return
        }

        setState((prev) => {
          switch (payload.type) {
            case "task_start":
              return { ...prev, activeSteps: PIPELINE_STAGES[0] ? [PIPELINE_STAGES[0].type] : [] }
            case "step_start":
              return prev.activeSteps.includes(payload.step)
                ? prev
                : { ...prev, activeSteps: [...prev.activeSteps, payload.step] }
            case "step_done": {
              const artifacts = [...prev.artifacts, payload.artifact]
              const activeSteps = prev.activeSteps.filter((s) => s !== payload.step)
              return { ...prev, artifacts, activeSteps, progress: computeProgress(artifacts) }
            }
            case "task_done":
              return { ...prev, status: "success", result: payload.result, progress: 100 }
            case "task_error":
              return { ...prev, status: "error", error: payload.error }
            case "task_cancelled":
              return { ...prev, status: "cancelled" }
            default:
              return prev
          }
        })

        if (
          payload.type === "task_done" ||
          payload.type === "task_error" ||
          payload.type === "task_cancelled"
        ) {
          source.close()
          sourceRef.current = null
        }
      }

      // Срабатывает и на реальный обрыв сети, и потенциально сразу после штатного
      // закрытия сервером — но штатное завершение (task_done/task_error/task_cancelled)
      // уже закрывает source синхронно в onmessage выше, так что до onerror дело не
      // доходит. Сюда попадают только настоящие сетевые сбои/реконнекты.
      source.onerror = () => {
        source.close()
        sourceRef.current = null

        attemptsRef.current += 1
        if (attemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
          setState((prev) =>
            prev.status === "running" ? { ...prev, status: "error", error: "Соединение потеряно" } : prev,
          )
          return
        }
        reconnectTimer = setTimeout(connect, Math.min(1000 * attemptsRef.current, 5000))
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [taskId])

  return state
}
