"use client"

/* ================================================================
   useProjectGenerationStream — живой лог генерации проекта (SSE)
   ----------------------------------------------------------------
   Подписка на GET /api/projects/:id/stream (прокси → бэкенд
   projects.routes.ts). Фоновый джоб генерации приложения эмитит
   стадии («Анализирую замысел» → «Генерирую код»/«Адаптирую шаблон»
   → «Проверяю N файлов» → «Записываю файлы» → готово/ошибка). Хук
   держит одно EventSource, копит стадии и на терминальной (ready/
   failed) дёргает onTerminal (страница подтягивает свежий проект +
   артефакты через fetchProject). Опрос статуса остаётся резервом.

   Особенности:
   • Стадии буферизуются на бэкенде (см. lib/generation-events.ts),
     поэтому поздний подписчик (после навигации на /projects/:id)
     получит уже отыгравшие стадии, а не пустоту.
   • Реконнект с линейным бэкоффом (как notifications-store), но
     ТОЛЬКО пока не пришёл терминал: сервер сам закрывает поток на
     ready/failed — реконнектиться после этого не нужно.
   ================================================================ */

import { useEffect, useRef, useState } from "react"

export type GenerationStage =
  | "analyzing"
  | "designing"
  | "template"
  | "ai"
  | "validating"
  | "building"
  | "repairing"
  | "writing"
  | "ready"
  | "failed"

export type GenerationStageEvent = {
  type: "stage"
  projectId: number
  stage: GenerationStage
  label: string
  progress: number
  fileCount?: number
  source?: string
  error?: string
  /** Сколько инженерных дефектов известно на стадиях building/repairing. */
  defects?: number
  /** Инженерный вердикт на терминале ready: passed | repaired | broken | unverified. */
  verdict?: string
  at: number
}

export function isTerminalStage(stage: GenerationStage): boolean {
  return stage === "ready" || stage === "failed"
}

type StreamState = {
  /** Накопленные стадии в порядке прихода (с дедупом по stage — последняя одноимённая побеждает). */
  stages: GenerationStageEvent[]
  /** Последняя пришедшая стадия (текущий шаг). */
  latest: GenerationStageEvent | null
  /** Прогресс 0..1 последней стадии. */
  progress: number
  /** Поток дошёл до терминальной стадии (ready/failed). */
  done: boolean
}

const INITIAL: StreamState = { stages: [], latest: null, progress: 0, done: false }

/**
 * @param projectId  проект, чью генерацию слушаем
 * @param enabled    подключаться ли (обычно: статус проекта === 'generating')
 * @param onTerminal колбэк при ready/failed — страница подтягивает свежий проект/артефакты
 */
export function useProjectGenerationStream(
  projectId: number,
  enabled: boolean,
  onTerminal?: (stage: GenerationStageEvent) => void,
): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL)

  // onTerminal держим в ref, чтобы не пересоздавать EventSource при смене колбэка.
  const onTerminalRef = useRef(onTerminal)
  onTerminalRef.current = onTerminal

  useEffect(() => {
    if (!enabled || !Number.isFinite(projectId)) {
      setState(INITIAL)
      return
    }

    // Новый проект/переподключение — начинаем лог с чистого листа.
    setState(INITIAL)

    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let closed = false
    let terminated = false

    const applyStage = (evt: GenerationStageEvent) => {
      setState((prev) => {
        // Дедуп по имени стадии: одноимённую заменяем (прогресс может уточниться).
        const others = prev.stages.filter((s) => s.stage !== evt.stage)
        const stages = [...others, evt].sort((a, b) => a.at - b.at)
        return {
          stages,
          latest: evt,
          progress: evt.progress,
          done: isTerminalStage(evt.stage),
        }
      })

      if (isTerminalStage(evt.stage) && !terminated) {
        terminated = true
        onTerminalRef.current?.(evt)
      }
    }

    const connect = () => {
      source = new EventSource(`/api/projects/${projectId}/stream`, { withCredentials: true })

      source.onopen = () => {
        attempts = 0
      }

      source.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type?: string; status?: string } & Partial<GenerationStageEvent>
          if (msg.type === "stage" && msg.stage) {
            applyStage(msg as GenerationStageEvent)
          }
          // snapshot ({type:"snapshot", status}) не несёт стадии — игнорируем, статус берём из стора.
        } catch {
          /* игнорируем некорректный кадр */
        }
      }

      source.onerror = () => {
        source?.close()
        source = null
        // Сервер закрывает поток после терминала — это НЕ ошибка, не реконнектимся.
        if (closed || terminated) return
        attempts += 1
        const delay = Math.min(30_000, 1000 * attempts)
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      source?.close()
      source = null
    }
  }, [projectId, enabled])

  return state
}
