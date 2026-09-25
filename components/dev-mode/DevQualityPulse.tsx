"use client"

import { Gauge } from "lucide-react"
import { useEffect, useState } from "react"

type QualityMetrics = { ttfb?: number; fcp?: number; lcp?: number; cls?: number }

function formatMs(value?: number) {
  return value === undefined ? "—" : `${Math.round(value)}ms`
}

export function DevQualityPulse() {
  const [metrics, setMetrics] = useState<QualityMetrics>({})

  useEffect(() => {
    let cancelled = false
    let cls = 0
    const update = (patch: QualityMetrics) => { if (!cancelled) setMetrics((current) => ({ ...current, ...patch })) }
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    if (navigation) update({ ttfb: navigation.responseStart - navigation.requestStart })
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]
    if (fcp) update({ fcp: fcp.startTime })
    const observers: PerformanceObserver[] = []
    if (PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
      const observer = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1)
        if (last) update({ lcp: last.startTime })
      })
      observer.observe({ type: "largest-contentful-paint", buffered: true })
      observers.push(observer)
    }
    if (PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[]) {
          if (!entry.hadRecentInput) cls += entry.value || 0
        }
        update({ cls })
      })
      observer.observe({ type: "layout-shift", buffered: true })
      observers.push(observer)
    }
    const timer = window.setTimeout(() => observers.forEach((observer) => observer.disconnect()), 4000)
    return () => { cancelled = true; window.clearTimeout(timer); observers.forEach((observer) => observer.disconnect()) }
  }, [])

  const measured = Object.keys(metrics).length > 0
  const degraded = (metrics.ttfb !== undefined && metrics.ttfb > 1800) || (metrics.fcp !== undefined && metrics.fcp > 1800) || (metrics.lcp !== undefined && metrics.lcp > 2500) || (metrics.cls !== undefined && metrics.cls > .1)
  const label = !measured ? "Frontend quality checking" : degraded ? "Frontend quality degraded" : "Frontend quality ready"
  const color = !measured ? "#94A3B8" : degraded ? "#FBBF24" : "#86EFAC"
  const details = `TTFB ${formatMs(metrics.ttfb)} · FCP ${formatMs(metrics.fcp)} · LCP ${formatMs(metrics.lcp)} · CLS ${metrics.cls === undefined ? "—" : metrics.cls.toFixed(3)}`

  return <span className="hidden items-center gap-1.5 text-[11px] md:inline-flex" role="status" aria-label={`${label}: ${details}`} title={details}><Gauge size={14} aria-hidden="true" style={{ color }} /><span style={{ color }}>{degraded ? "UX degraded" : measured ? "UX ready" : "UX checking"}</span></span>
}
