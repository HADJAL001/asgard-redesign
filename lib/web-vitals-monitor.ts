import { track } from "@/lib/analytics"

type VitalName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB"

const sent = new Set<VitalName>()
const latest = new Map<VitalName, number>()

function supported(name: string): boolean {
  return typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes(name)
}

function send(name: VitalName, value: number) {
  if (Number.isFinite(value)) latest.set(name, value)
}

function flush() {
  for (const [name, value] of latest) {
    if (sent.has(name)) continue
    sent.add(name)
    track("web_vital", { name, value: Math.round(value * 100) / 100, path: window.location.pathname })
  }
}

export function startWebVitalsMonitor() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return

  if (supported("largest-contentful-paint")) {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1] as PerformanceEntry | undefined
      if (last) send("LCP", last.startTime)
    })
    observer.observe({ type: "largest-contentful-paint", buffered: true })
  }

  if (supported("layout-shift")) {
    let cls = 0
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[]) {
        if (!entry.hadRecentInput) cls += entry.value || 0
      }
      latest.set("CLS", cls)
    })
    observer.observe({ type: "layout-shift", buffered: true })
  }

  if (supported("event")) {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as (PerformanceEntry & { duration?: number; interactionId?: number })[]
      const longest = entries.reduce((max, entry) => Math.max(max, entry.duration || 0), 0)
      if (longest) latest.set("INP", Math.max(latest.get("INP") || 0, longest))
    })
    observer.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit)
  }

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
  if (navigation) send("TTFB", navigation.responseStart - navigation.requestStart)
  const paint = performance.getEntriesByName("first-contentful-paint")[0]
  if (paint) send("FCP", paint.startTime)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush() })
  window.addEventListener("pagehide", flush, { once: true })
  window.setTimeout(flush, 10_000)
}
