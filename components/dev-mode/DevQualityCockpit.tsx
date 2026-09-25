"use client"

import { Activity, ArrowUpRight, Gauge, RefreshCw, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { track } from "@/lib/analytics"

type RuntimeState = { status: "checking" | "healthy" | "degraded"; latency?: number }

function metric(value?: number) {
  return value === undefined ? "—" : `${Math.round(value)}ms`
}

export function DevQualityCockpit() {
  const [runtime, setRuntime] = useState<RuntimeState>({ status: "checking" })
  const [frontend, setFrontend] = useState<{ lcp?: number; cls?: number }>({})
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const started = performance.now()
    try {
      const response = await fetch("/api/health", { cache: "no-store" })
      setRuntime({ status: response.ok ? "healthy" : "degraded", latency: performance.now() - started })
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
    return () => { window.clearTimeout(refreshTimer); lcpObserver?.disconnect(); clsObserver?.disconnect() }
  }, [refresh])

  const runtimeColor = runtime.status === "healthy" ? "#86EFAC" : runtime.status === "degraded" ? "#FBBF24" : "#94A3B8"
  return <section className="dev-quality-cockpit" aria-labelledby="dev-quality-cockpit-title">
    <div className="dev-quality-cockpit__head"><div><span className="dev-utility">QUALITY COCKPIT / LIVE</span><h2 id="dev-quality-cockpit-title">Проверяем путь до результата</h2><p>Измеримые сигналы runtime и frontend рядом с рабочим процессом.</p></div><button type="button" className="dev-btn dev-btn--ghost" onClick={() => void refresh()} disabled={refreshing} aria-label="Обновить quality cockpit" title="Refresh quality signals"><RefreshCw size={14} className={refreshing ? "dev-quality-spin" : undefined} aria-hidden="true" /></button></div>
    <div className="dev-quality-cockpit__grid">
      <article><Activity size={16} aria-hidden="true" style={{ color: runtimeColor }} /><span>Runtime</span><strong style={{ color: runtimeColor }}>{runtime.status === "healthy" ? `Healthy ${metric(runtime.latency)}` : runtime.status === "degraded" ? "Degraded" : "Checking"}</strong><small>Target &lt; 800ms</small></article>
      <article><Gauge size={16} aria-hidden="true" /><span>Largest paint</span><strong>{metric(frontend.lcp)}</strong><small>Target &lt; 2.5s</small></article>
      <article><ShieldCheck size={16} aria-hidden="true" /><span>Layout stability</span><strong>{frontend.cls === undefined ? "—" : frontend.cls.toFixed(3)}</strong><small>Target &lt; 0.10 CLS</small></article>
      <article><ArrowUpRight size={16} aria-hidden="true" /><span>Next action</span><strong>AI Cofounder</strong><a href="/cofounder">Open verified builder</a></article>
    </div>
  </section>
}
