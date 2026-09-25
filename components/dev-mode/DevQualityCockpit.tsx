"use client"

import { Activity, ArrowUpRight, Gauge, RefreshCw, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { track } from "@/lib/analytics"

type RuntimeState = { status: "checking" | "healthy" | "degraded"; latency?: number }
type BlueprintQuality = { id: string; revision: number; missing: string[]; required: string[]; readyForCodegen: boolean }
type GenerationSnapshot = { taskId: string; status: "queued" | "processing" | "completed" | "failed" | "cancelled"; progress: number; revision?: number; error?: string; result?: { appUrl?: string; previewUrl?: string; repoUrl?: string } }

function metric(value?: number) {
  return value === undefined ? "—" : `${Math.round(value)}ms`
}

export function DevQualityCockpit() {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: "checking" })
  const [frontend, setFrontend] = useState<{ lcp?: number; cls?: number }>({})
  const [blueprint, setBlueprint] = useState<BlueprintQuality | null>(null)
  const [generation, setGeneration] = useState<GenerationSnapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const started = performance.now()
    try {
      const response = await fetch("/api/health", { cache: "no-store" })
      setRuntime({ status: response.ok ? "healthy" : "degraded", latency: performance.now() - started })
      try {
        const storedGeneration = JSON.parse(window.localStorage.getItem("osgard-latest-generation") || "null") as GenerationSnapshot | null
        setGeneration(storedGeneration?.taskId ? storedGeneration : null)
        const history = JSON.parse(window.localStorage.getItem("osgard-blueprint-history") || "[]") as { id?: string; revision?: number }[]
        const latest = history[0]
        if (latest?.id && latest.revision) {
          const qualityResponse = await fetch(`/api/design/blueprint/${encodeURIComponent(latest.id)}/quality`, { cache: "no-store" })
          const quality = await qualityResponse.json().catch(() => null) as { revision?: number; missing?: string[]; required?: string[]; readyForCodegen?: boolean } | null
          if (qualityResponse.ok && quality && Array.isArray(quality.missing) && Array.isArray(quality.required)) setBlueprint({ id: latest.id, revision: quality.revision || latest.revision, missing: quality.missing, required: quality.required, readyForCodegen: Boolean(quality.readyForCodegen) })
          const generationResponse = await fetch(`/api/design/blueprint/${encodeURIComponent(latest.id)}/generation`, { cache: "no-store" })
          const generationData = await generationResponse.json().catch(() => null) as { generation?: GenerationSnapshot | null } | null
          if (generationResponse.ok && generationData?.generation) setGeneration(generationData.generation)
        }
      } catch {
        setBlueprint(null)
        setGeneration(null)
      }
      track("dev_runtime_health", { source: "quality-cockpit", status: response.ok ? "healthy" : "degraded", latencyMs: Math.round(performance.now() - started) })
    } catch {
      setRuntime({ status: "degraded" })
      track("dev_runtime_health", { source: "quality-cockpit", status: "degraded", reason: "network" })
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refresh(), 0)
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 15_000)
    const lcpObserver = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint") ? new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1)
      if (entry) setFrontend((current) => ({ ...current, lcp: entry.startTime }))
    }) : null
    const clsObserver = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("layout-shift") ? new PerformanceObserver((list) => {
      const value = list.getEntries().reduce((total, entry) => total + ((entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }).hadRecentInput ? 0 : ((entry as PerformanceEntry & { value?: number }).value || 0)), 0)
      setFrontend((current) => ({ ...current, cls: value }))
    }) : null
    lcpObserver?.observe({ type: "largest-contentful-paint", buffered: true })
    clsObserver?.observe({ type: "layout-shift", buffered: true })
    return () => { window.clearTimeout(refreshTimer); window.clearInterval(pollTimer); lcpObserver?.disconnect(); clsObserver?.disconnect() }
  }, [refresh])

  const runtimeColor = runtime.status === "healthy" ? "#86EFAC" : runtime.status === "degraded" ? "#FBBF24" : "#94A3B8"
  return <section className="dev-quality-cockpit" aria-labelledby="dev-quality-cockpit-title">
    <div className="dev-quality-cockpit__head"><div><span className="dev-utility">QUALITY COCKPIT / LIVE</span><h2 id="dev-quality-cockpit-title">Проверяем путь до результата</h2><p>Измеримые сигналы runtime и frontend рядом с рабочим процессом.</p></div><button type="button" className="dev-btn dev-btn--ghost" onClick={() => void refresh()} disabled={refreshing} aria-label="Обновить quality cockpit" title="Refresh quality signals"><RefreshCw size={14} className={refreshing ? "dev-quality-spin" : undefined} aria-hidden="true" /></button></div>
    <div className="dev-quality-cockpit__grid">
      <article><Activity size={16} aria-hidden="true" style={{ color: runtimeColor }} /><span>Runtime</span><strong style={{ color: runtimeColor }}>{runtime.status === "healthy" ? `Healthy ${metric(runtime.latency)}` : runtime.status === "degraded" ? "Degraded" : "Checking"}</strong><small>Target &lt; 800ms</small></article>
      <article><Gauge size={16} aria-hidden="true" /><span>Largest paint</span><strong>{metric(frontend.lcp)}</strong><small>Target &lt; 2.5s</small></article>
      <article><ShieldCheck size={16} aria-hidden="true" /><span>Layout stability</span><strong>{frontend.cls === undefined ? "—" : frontend.cls.toFixed(3)}</strong><small>Target &lt; 0.10 CLS</small></article>
      <article><ShieldCheck size={16} aria-hidden="true" /><span>Blueprint gates</span><strong>{blueprint ? `${blueprint.required.length - blueprint.missing.length}/${blueprint.required.length} passed` : "No blueprint"}</strong><small>{blueprint ? `Revision ${blueprint.revision}` : "Create a contract to inspect"}</small></article>
      <article><ArrowUpRight size={16} aria-hidden="true" /><span>Codegen</span><strong>{generation ? `${generation.status} ${Math.round(generation.progress || 0)}%` : "Not started"}</strong><small>{generation?.error || (generation?.revision ? `Revision ${generation.revision}` : "Approve a blueprint to begin")}</small><a href="/cofounder">Open verified builder</a></article>
    </div>
    {blueprint ? <div className="dev-quality-cockpit__links" aria-label="Blueprint lifecycle links"><span>Revision {blueprint.revision} lifecycle</span><a href={`/cofounder/replay/${encodeURIComponent(blueprint.id)}?revision=${blueprint.revision}`}>Open replay</a>{generation?.result?.previewUrl ? <a href={generation.result.previewUrl} target="_blank" rel="noreferrer">Preview</a> : null}{generation?.result?.appUrl ? <a href={generation.result.appUrl} target="_blank" rel="noreferrer">Open app</a> : null}{generation?.result?.repoUrl ? <a href={generation.result.repoUrl} target="_blank" rel="noreferrer">Repository</a> : null}</div> : null}
  </section>
}
