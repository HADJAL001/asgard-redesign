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

export type GuestGenResult = { files: FileTree; source?: "ai" | "fallback"; taskId?: string }

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
  start: (input: GuestCodeInput, signal?: AbortSignal) => Promise<{ taskId: string }>
  poll: (taskId: string, signal?: AbortSignal) => Promise<{ status: string; result?: GuestGenResult; error?: string }>
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
const ACTIVE_TASK_KEY = "osgard_guest_code_task"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function rememberTask(taskId: string | null) {
  try {
    if (taskId) sessionStorage.setItem(ACTIVE_TASK_KEY, taskId)
    else sessionStorage.removeItem(ACTIVE_TASK_KEY)
  } catch { /* storage is optional */ }
}

type State = {
  phase: GuestGenPhase
  progress: GuestGenProgress | null
  result: GuestGenResult | null
  error: string | null
  recoverable: boolean
}

const INITIAL: State = { phase: "idle", progress: null, result: null, error: null, recoverable: false }

export function useGuestCodeGeneration(adapter: GuestCodeAdapter = DEFAULT_ADAPTER) {
  const [state, setState] = useState<State>(INITIAL)
  const cancelRef = useRef(false)
  const generationIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const activeTaskIdRef = useRef<string | null>(null)

  const cleanup = useCallback(() => {
    cancelRef.current = true
    generationIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    if (unsubRef.current) {
      unsubRef.current()
      unsubRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  const reset = useCallback(() => {
    cleanup()
    rememberTask(null)
    activeTaskIdRef.current = null
    cancelRef.current = false
    setState(INITIAL)
  }, [cleanup])

  const generate = useCallback(
    async (input: GuestCodeInput) => {
      cleanup()
      const generationId = ++generationIdRef.current
      const controller = new AbortController()
      abortRef.current = controller
      cancelRef.current = false
      setState({ phase: "starting", progress: null, result: null, error: null, recoverable: false })

      let taskId: string
      try {
        if (input.resumeTaskId) {
          taskId = input.resumeTaskId
        } else {
          const started = await adapter.start(input, controller.signal)
          if (cancelRef.current || generationId !== generationIdRef.current) return
          taskId = started.taskId
          rememberTask(taskId)
        }
        activeTaskIdRef.current = taskId
      } catch (err) {
        if (abortRef.current === controller) abortRef.current = null
        if (cancelRef.current || generationId !== generationIdRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === NOT_IMPLEMENTED) {
          setState({
            phase: "unavailable",
            progress: null,
            result: null,
            error: "Живая генерация кода ещё подключается — скоро будет доступна.",
            recoverable: false,
          })
          return
        }
        setState({ phase: "error", progress: null, result: null, error: msg, recoverable: false })
        return
      }

      let unsubscribe: (() => void) | null = null
      if (adapter.subscribeStream) {
        unsubscribe = adapter.subscribeStream(taskId, (p) => {
          if (cancelRef.current || generationId !== generationIdRef.current) return
          setState((s) => (s.phase === "running" || s.phase === "starting" ? { ...s, phase: "running", progress: p } : s))
        })
        unsubRef.current = unsubscribe
      }

      const deadline = Date.now() + POLL_TIMEOUT_MS
      let consecutivePollErrors = 0
      if (generationId !== generationIdRef.current) return
      setState((s) => ({ ...s, phase: "running" }))

      while (!cancelRef.current && generationId === generationIdRef.current) {
        if (Date.now() > deadline) {
          setState((s) => ({
            ...s,
            phase: "error",
            error: "Проверка заняла больше пяти минут. Генерация могла продолжиться на сервере.",
            recoverable: true,
          }))
          break
        }

        let polled: { status: string; result?: GuestGenResult; error?: string }
        try {
          polled = await adapter.poll(taskId, controller.signal)
          consecutivePollErrors = 0
        } catch (err) {
          if (cancelRef.current || generationId !== generationIdRef.current) break
          consecutivePollErrors += 1
          if (consecutivePollErrors < 3) {
            setState((s) => ({
              ...s,
              phase: "running",
              progress: { stage: "reconnecting", message: "Восстанавливаю связь с генератором..." },
            }))
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * consecutivePollErrors))
            continue
          }
          setState((s) => ({
            ...s,
            phase: "error",
            error: "Связь с генератором прервалась. Проект мог продолжить собираться на сервере.",
            recoverable: true,
          }))
          break
        }

        if (cancelRef.current || generationId !== generationIdRef.current) break

        if (polled.status === "done" || polled.status === "completed") {
          rememberTask(null)
          activeTaskIdRef.current = null
          setState((s) => ({
            ...s,
            phase: "done",
            result: { ...(polled.result ?? { files: [] }), taskId },
            progress: null,
            recoverable: false,
          }))
          break
        }
        if (polled.status === "error" || polled.status === "failed") {
          rememberTask(null)
          activeTaskIdRef.current = null
          setState((s) => ({
            ...s,
            phase: "error",
            error: polled.error ?? "Ошибка генерации.",
            recoverable: false,
          }))
          break
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }

      if (unsubscribe && unsubRef.current === unsubscribe) {
        unsubscribe()
        unsubRef.current = null
      }
      if (abortRef.current === controller) abortRef.current = null
    },
    [adapter, cleanup],
  )

  const resume = useCallback(() => {
    const taskId = activeTaskIdRef.current
    if (!taskId || state.phase !== "error" || !state.recoverable) return
    void generate({ name: "", resumeTaskId: taskId })
  }, [generate, state.phase, state.recoverable])

  useEffect(() => {
    let cancelled = false
    let taskId: string | null = null
    try { taskId = sessionStorage.getItem(ACTIVE_TASK_KEY) } catch { /* storage is optional */ }
    if (!taskId) return () => { cancelled = true }
    if (!UUID_RE.test(taskId)) {
      rememberTask(null)
      return () => { cancelled = true }
    }
    Promise.resolve().then(() => {
      if (!cancelled) void generate({ name: "", resumeTaskId: taskId! })
    })
    return () => { cancelled = true }
  }, [generate])

  return {
    phase: state.phase,
    progress: state.progress,
    result: state.result,
    error: state.error,
    canResume: state.phase === "error" && state.recoverable,
    isBusy: state.phase === "starting" || state.phase === "running",
    generate,
    resume,
    reset,
  }
}
