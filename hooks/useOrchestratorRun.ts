"use client"

/* ================================================================
   OSGARD · useOrchestratorRun
   ----------------------------------------------------------------
   Подписка на SSE-эндпоинт выполнения цепочки:
   GET /api/orchestrator/stream/:executionId
   Тот же origin, что и сайт → cookie авторизации уходит сама
   (withCredentials), кастомные заголовки EventSource не поддерживает.

   Бэкенд при коннекте к уже завершённому execution сразу шлёт
   chain_done/chain_error и закрывает поток — обрабатывается тем же
   onmessage-путём, что и live-события, отдельной логики не нужно.
   ================================================================ */

import { useEffect, useRef, useState } from "react"
import type { OrchestratorStreamEvent } from "@/lib/orchestrator/types"

export type OrchestratorRunStatus = "idle" | "running" | "success" | "error" | "cancelled"

export interface OrchestratorRunNodeState {
  id: string
  status: "pending" | "running" | "done" | "error"
  output?: string
  error?: string
}

export interface OrchestratorRunState {
  status: OrchestratorRunStatus
  nodes: OrchestratorRunNodeState[]
  output?: string
  error?: string
  progress: number
}

const MAX_RECONNECT_ATTEMPTS = 5

function initialNodes(nodeIds?: string[]): OrchestratorRunNodeState[] {
  return (nodeIds ?? []).map((id) => ({ id, status: "pending" as const }))
}

function computeProgress(nodes: OrchestratorRunNodeState[]): number {
  if (nodes.length === 0) return 0
  const finished = nodes.filter((n) => n.status === "done" || n.status === "error").length
  return Math.round((finished / nodes.length) * 100)
}

function upsertNode(
  nodes: OrchestratorRunNodeState[],
  id: string,
  patch: Partial<OrchestratorRunNodeState>,
): OrchestratorRunNodeState[] {
  const idx = nodes.findIndex((n) => n.id === id)
  if (idx === -1) return [...nodes, { id, status: "pending", ...patch }]
  const next = nodes.slice()
  next[idx] = { ...next[idx], ...patch }
  return next
}

/**
 * @param executionId  id запуска (из runChain). null — нет активного запуска.
 * @param nodeIds       опциональный список id узлов цепочки — сидирует nodes
 *                       статусом "pending" сразу, до первого SSE-события, чтобы
 *                       progress считался от точного знаменателя. Меняться после
 *                       старта запуска не должен (не входит в deps эффекта) —
 *                       это подсказка для сидирования, а не реактивный вход.
 */
export function useOrchestratorRun(executionId: number | null, nodeIds?: string[]): OrchestratorRunState {
  const [state, setState] = useState<OrchestratorRunState>({
    status: "idle",
    nodes: initialNodes(nodeIds),
    progress: 0,
  })

  const sourceRef = useRef<EventSource | null>(null)
  const attemptsRef = useRef(0)
  const prevExecutionIdRef = useRef<number | null>(null)

  useEffect(() => {
    const prevId = prevExecutionIdRef.current
    prevExecutionIdRef.current = executionId

    if (executionId === null) {
      sourceRef.current?.close()
      sourceRef.current = null
      // executionId ушёл в null, пока запуск ещё шёл (caller отменил/сбросил) -> cancelled.
      // Уже завершённый запуск (success/error) сбросом в null не перетирается.
      if (prevId !== null) {
        setState((prev) => (prev.status === "running" ? { ...prev, status: "cancelled" } : prev))
      }
      return
    }

    attemptsRef.current = 0
    setState({ status: "running", nodes: initialNodes(nodeIds), progress: 0 })

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      const source = new EventSource(`/api/orchestrator/stream/${executionId}`, { withCredentials: true })
      sourceRef.current = source

      source.onopen = () => {
        attemptsRef.current = 0
      }

      source.onmessage = (event) => {
        let payload: OrchestratorStreamEvent
        try {
          payload = JSON.parse(event.data)
        } catch {
          return
        }

        setState((prev) => {
          switch (payload.type) {
            case "node_start": {
              const nodes = upsertNode(prev.nodes, payload.nodeId, { status: "running" })
              return { ...prev, nodes, progress: computeProgress(nodes) }
            }
            case "node_done": {
              const nodes = upsertNode(prev.nodes, payload.nodeId, { status: "done", output: payload.output })
              return { ...prev, nodes, progress: computeProgress(nodes) }
            }
            case "node_error": {
              const nodes = upsertNode(prev.nodes, payload.nodeId, { status: "error", error: payload.error })
              return { ...prev, nodes, progress: computeProgress(nodes) }
            }
            case "chain_done":
              return { ...prev, status: "success", output: payload.output, progress: 100 }
            case "chain_error":
              return { ...prev, status: "error", error: payload.error }
            default:
              return prev
          }
        })

        if (payload.type === "chain_done" || payload.type === "chain_error") {
          source.close()
          sourceRef.current = null
        }
      }

      // Срабатывает и на реальный обрыв сети, и потенциально сразу после штатного
      // закрытия сервером — но штатное завершение (chain_done/chain_error) уже
      // закрывает source синхронно в onmessage выше, так что до onerror дело не
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId])

  return state
}
