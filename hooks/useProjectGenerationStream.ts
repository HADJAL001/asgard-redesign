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
  /* --- Счётчик расхода (backend: lib/generation-telemetry). Подмешивается в КАЖДУЮ
     стадию, чтобы цифры не могли «отстать» от прогресса. --- */
  /** Сколько обращений к моделям сделано на этот момент. */
  aiCalls?: number
  /** Токенов отправлено моделям. */
  tokensIn?: number
  /** Токенов получено от моделей. */
  tokensOut?: number
  /** Сколько вызовов не отдали точный usage — оговорка к точности цифры. */
  tokensEstimated?: number
  /** true на терминале ready, если приложение заработало без единого ремонта. */
  firstTry?: boolean
  at: number
}

/** Тик живого счётчика расхода: приходит по факту каждого вызова модели,
 *  отдельно от стадий (самая долгая стадия `ai` — одна, и внутри неё
 *  десятки вызовов; иначе счётчик выглядел бы зависшим). */
export type GenerationMeterEvent = {
  type: "meter"
  projectId: number
  aiCalls: number
  tokensIn: number
  tokensOut: number
  tokensEstimated: number
  aiMs: number
  tokenLimit: number | null
  at: number
}

/** Расход генерации в том виде, в каком его показывает интерфейс. */
export type LiveMeter = {
  aiCalls: number
  tokensIn: number
  tokensOut: number
  totalTokens: number
  /** Сколько вызовов не отдали точный usage: >0 — цифру нельзя выдавать за точную. */
  estimated: number
  /** Сумма времени сетевых вызовов. null — тиков ещё не было. */
  aiMs: number | null
  tokenLimit: number | null
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
  /** Живой расход генерации. null — ни один вызов модели ещё не отчитался
   *  (важно отличать от «нуля потрачено»: шаблонная сборка может обойтись
   *  вообще без обращений к моделям, и это надо показать словами, а не нулём). */
  meter: LiveMeter | null
  /** true на терминале ready, если приложение заработало без единого ремонта. */
  firstTry: boolean | null
}

const INITIAL: StreamState = {
  stages: [],
  latest: null,
  progress: 0,
  done: false,
  meter: null,
  firstTry: null,
}

/** Поля счётчика в том виде, в каком они приходят и в стадии, и в тике.
 *  Описаны отдельной формой, а не пересечением событий: у тех конфликтует
 *  литерал `type` («stage» & «meter» = never), и пересечение обнуляло бы весь тип. */
type MeterFields = {
  aiCalls?: number
  tokensIn?: number
  tokensOut?: number
  tokensEstimated?: number
  aiMs?: number
  tokenLimit?: number | null
}

/** Собирает расход из полей события. Возвращает предыдущее значение, если счётчика
 *  в кадре нет: старый бэкенд без телеметрии не должен выглядеть как «0 токенов». */
function meterFrom(evt: MeterFields, prev: LiveMeter | null): LiveMeter | null {
  if (evt.aiCalls === undefined && evt.tokensIn === undefined && evt.tokensOut === undefined) {
    return prev
  }
  const tokensIn = evt.tokensIn ?? 0
  const tokensOut = evt.tokensOut ?? 0
  return {
    aiCalls: evt.aiCalls ?? 0,
    tokensIn,
    tokensOut,
    totalTokens: tokensIn + tokensOut,
    estimated: evt.tokensEstimated ?? 0,
    aiMs: evt.aiMs ?? prev?.aiMs ?? null,
    tokenLimit: evt.tokenLimit ?? prev?.tokenLimit ?? null,
  }
}

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
  // Обновляем ref в эффекте, а не на рендере: мутация ref во время рендера ломает
  // корректность при повторном/прерванном рендере (react-hooks/refs). Читают его
  // только асинхронные обработчики потока — то есть уже после коммита.
  const onTerminalRef = useRef(onTerminal)
  useEffect(() => {
    onTerminalRef.current = onTerminal
  }, [onTerminal])

  /* Сброс лога при смене подписки делаем НА РЕНДЕРЕ, а не в эффекте (документированный
     приём React «adjusting state when a prop changes»). Раньше эффект дважды звал
     setState(INITIAL) синхронно в теле — это лишний каскадный рендер на каждом
     подключении (react-hooks/set-state-in-effect). Семантика та же: новая подписка —
     чистый лист; реконнект внутри одной подписки лог не стирает. */
  const sessionKey = enabled && Number.isFinite(projectId) ? `on:${projectId}` : "off"
  const [activeKey, setActiveKey] = useState(sessionKey)
  if (activeKey !== sessionKey) {
    setActiveKey(sessionKey)
    setState(INITIAL)
  }

  useEffect(() => {
    if (!enabled || !Number.isFinite(projectId)) return

    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let closed = false
    let terminated = false
    let paused = typeof document !== "undefined" && document.visibilityState === "hidden"

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
          meter: meterFrom(evt, prev.meter),
          // firstTry приходит только на терминале ready; до него ответа нет.
          firstTry: evt.firstTry ?? prev.firstTry,
        }
      })

      if (isTerminalStage(evt.stage) && !terminated) {
        terminated = true
        onTerminalRef.current?.(evt)
      }
    }

    /* Тик счётчика: обновляет ТОЛЬКО расход. Стадию, прогресс и лог не трогает —
       иначе тик выглядел бы как шаг конвейера и ломал бы полосу прогресса. */
    const applyMeter = (evt: GenerationMeterEvent) => {
      setState((prev) => {
        const meter = meterFrom(evt, prev.meter)
        if (!meter) return prev
        return { ...prev, meter }
      })
    }

    const connect = () => {
      if (closed || terminated || paused) return
      source = new EventSource(`/api/projects/${projectId}/stream`, { withCredentials: true })

      source.onopen = () => {
        attempts = 0
      }

      source.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type?: string; status?: string } &
            Partial<Omit<GenerationStageEvent, "type">> &
            Partial<Omit<GenerationMeterEvent, "type">>
          if (msg.type === "stage" && msg.stage) {
            applyStage(msg as GenerationStageEvent)
          } else if (msg.type === "meter") {
            applyMeter(msg as GenerationMeterEvent)
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
        if (closed || terminated || paused) return
        attempts += 1
        // Back off quickly during outages and add jitter so many clients do not
        // reconnect in the same millisecond after a shared backend failure.
        const baseDelay = Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5))
        const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4))
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    const handleVisibilityChange = () => {
      paused = document.visibilityState === "hidden"
      if (paused) {
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = undefined
        source?.close()
        source = null
        return
      }
      if (!source && !terminated) connect()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    connect()

    return () => {
      closed = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      source?.close()
      source = null
    }
  }, [projectId, enabled])

  return state
}
