"use client"

/* ================================================================
   useDemoGenerate — тонкий React-хук поверх lib/demo-client.ts
   ----------------------------------------------------------------
   Единая точка входа в demo-generate флоу: используется и модалкой
   (DemoProjectModal), и (через неё) hero-формой лендинга — оба вызывающих
   места получают один и тот же session-стейт и поведение лимита.
   ================================================================ */

import { useState, useEffect, useCallback } from "react"
import {
  loadSession,
  saveSession,
  generateDemoProject,
  MAX_GENERATIONS,
  STORAGE_KEY,
  type DemoSessionV2,
  type DemoProject,
} from "@/lib/demo-client"

export interface UseDemoGenerateResult {
  session: DemoSessionV2
  remaining: number
  loading: boolean
  error: string | null
  lastResult: DemoProject | null
  generate: (name: string, hint: string) => Promise<void>
  reset: () => void
}

export interface UseDemoGenerateOptions {
  /** Колбэк когда достигнут лимит генераций (сразу или после результата) */
  onLimitReached: (session: DemoSessionV2) => void
}

export function useDemoGenerate({ onLimitReached }: UseDemoGenerateOptions): UseDemoGenerateResult {
  const [session, setSession] = useState<DemoSessionV2>(() => ({ projects: [], generationsUsed: 0, expiresAt: 0 }))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<DemoProject | null>(null)

  useEffect(() => {
    Promise.resolve().then(() => setSession(loadSession()))
  }, [])

  const remaining = MAX_GENERATIONS - session.generationsUsed

  const generate = useCallback(
    async (name: string, hint: string) => {
      if (remaining <= 0) { onLimitReached(session); return }

      setLoading(true)
      setError(null)

      const result = await generateDemoProject(name, hint)

      if (!result.ok) {
        if (result.limitReached) { onLimitReached(session); setLoading(false); return }
        setError(result.error)
        setLoading(false)
        return
      }

      const updated: DemoSessionV2 = {
        projects: [result.project, ...session.projects],
        generationsUsed: session.generationsUsed + 1,
        expiresAt: session.expiresAt > Date.now() ? session.expiresAt : Date.now() + 86400_000,
      }
      saveSession(updated)
      setSession(updated)
      setLastResult(result.project)
      setLoading(false)

      if (updated.generationsUsed >= MAX_GENERATIONS) {
        setTimeout(() => onLimitReached(updated), 1800)
      }
    },
    [remaining, session, onLimitReached],
  )

  const reset = useCallback(() => {
    const fresh: DemoSessionV2 = { projects: [], generationsUsed: 0, expiresAt: Date.now() + 86400_000 }
    try { localStorage.removeItem("osgard_demo_v2") } catch { /* ignore */ }
    setSession(fresh)
    setLastResult(null)
    setError(null)
  }, [])

  return { session, remaining, loading, error, lastResult, generate, reset }
}
