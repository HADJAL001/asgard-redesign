"use client"

/* ================================================================
   OSGARD · useGuestCodeGeneration — фронтенд гостевой live-генерации
   ----------------------------------------------------------------
   Клиентская обвязка над анонимным пайплайном генерации кода. Сам
   бэкенд-эндпоинт делает параллельная сессия A (см. PART3_STATUS.md).
   Чтобы не простаивать в ожидании, хук спроектирован на dependency
   injection: реальные start/poll/subscribe подставляются одной
   правкой (DEFAULT_ADAPTER ниже), когда контракт подтверждён.

   ВАЖНО: пока API нет — адаптер по умолчанию честно возвращает статус
   "unavailable" (никаких фейковых файлов). Это осознанно — второй раз
   создавать «бутафорию», выдающую себя за рабочую генерацию, нельзя.

   Предполагаемый контракт (сверяется с сессией A):
     POST /demo/code/start {name, hint}      → 202 {taskId}
     GET  /demo/code/:taskId                 → {status, result?, error?}
     GET  /demo/code/:taskId/stream (SSE)    → события пайплайна
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FileTree } from "@/lib/integrations/file-tree"

export type GuestGenPhase =
  | "idle"
  | "starting"
  | "running"
  | "done"
  | "error"
  | "unavailable"

export type GuestGenResult = { files: FileTree }

export type GuestGenProgress = { stage: string; message?: string; pct?: number }

export type GuestCodeInput = {
  name: string
  hint?: string
  /* Точка расширения под Part 3 (кеш итеративной разработки сессии A): когда
     появится API продолжения, сюда можно передать артефакты прошлой генерации
     / id задачи для resume. Сейчас не используется. */
  previousArtifacts?: FileTree
  resumeTaskId?: string
}

/** Адаптер к бэкенду. Реализуется, когда сессия A опубликует роуты. */
export type GuestCodeAdapter = {
  start: (input: GuestCodeInput) => Promise<{ taskId: string }>
  poll: (taskId: string) => Promise<{ status: string; result?: GuestGenResult; error?: string }>
  /** Опциональный SSE-стрим прогресса; возвращает функцию отписки. */
  subscribeStream?: (
    taskId: string,
    onProgress: (p: GuestGenProgress) => void,
  ) => () => void
}

/* Заглушка по умолчанию: контракт ещё не подтверждён сессией A. Кидает
   специальный маркер, который хук переводит в статус "unavailable" —
   честное «недоступно» вместо мока. */
const NOT_IMPLEMENTED = "GUEST_CODE_API_NOT_IMPLEMENTED"

export const DEFAULT_ADAPTER: GuestCodeAdapter = {
  async start() {
    throw new Error(NOT_IMPLEMENTED)
  },
  async poll() {
    throw new Error(NOT_IMPLEMENTED)
  },
}

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 5 * 60 * 1000

type State = {
  phase: GuestGenPhase
  progress: GuestGenProgress | null
  result: GuestGenResult | null
  error: string | null
}

const INITIAL: State = { phase: "idle", progress: null, result: null, error: null }

export function useGuestCodeGeneration(adapter: GuestCodeAdapter = DEFAULT_ADAPTER) {
  const [state, setState] = useState<State>(INITIAL)
  const cancelRef = useRef(false)
  const unsubRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    cancelRef.current = true
    if (unsubRef.current) {
      unsubRef.current()
      unsubRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  const reset = useCallback(() => {
    cleanup()
    cancelRef.current = false
    setState(INITIAL)
  }, [cleanup])

  const generate = useCallback(
    async (input: GuestCodeInput) => {
      cancelRef.current = false
      setState({ phase: "starting", progress: null, result: null, error: null })

      let taskId: string
      try {
        const started = await adapter.start(input)
        taskId = started.taskId
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === NOT_IMPLEMENTED) {
          setState({
            phase: "unavailable",
            progress: null,
            result: null,
            error: "Живая генерация кода ещё подключается — скоро будет доступна.",
          })
          return
        }
        setState({ phase: "error", progress: null, result: null, error: msg })
        return
      }

      if (adapter.subscribeStream) {
        unsubRef.current = adapter.subscribeStream(taskId, (p) => {
          if (cancelRef.current) return
          setState((s) => (s.phase === "running" || s.phase === "starting" ? { ...s, phase: "running", progress: p } : s))
        })
      }

      const deadline = Date.now() + POLL_TIMEOUT_MS
      setState((s) => ({ ...s, phase: "running" }))

      while (!cancelRef.current) {
        if (Date.now() > deadline) {
          setState((s) => ({ ...s, phase: "error", error: "Генерация заняла слишком много времени." }))
          break
        }

        let polled: { status: string; result?: GuestGenResult; error?: string }
        try {
          polled = await adapter.poll(taskId)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setState((s) => ({ ...s, phase: "error", error: msg }))
          break
        }

        if (cancelRef.current) break

        if (polled.status === "done" || polled.status === "completed") {
          setState((s) => ({ ...s, phase: "done", result: polled.result ?? { files: [] }, progress: null }))
          break
        }
        if (polled.status === "error" || polled.status === "failed") {
          setState((s) => ({ ...s, phase: "error", error: polled.error ?? "Ошибка генерации." }))
          break
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }

      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
    },
    [adapter],
  )

  return {
    phase: state.phase,
    progress: state.progress,
    result: state.result,
    error: state.error,
    isBusy: state.phase === "starting" || state.phase === "running",
    generate,
    reset,
  }
}
