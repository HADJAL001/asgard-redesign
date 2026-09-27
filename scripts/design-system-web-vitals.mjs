import { chromium } from "playwright"

const base = (process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com").replace(/\/$/, "")
const targets = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
]
const limits = { fcp: 2_500, lcp: 2_500, cls: 0.1 }
const browser = await chromium.launch({ headless: true })

try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: target.viewport, reducedMotion: "reduce" })
    await page.addInitScript(() => {
      window.__osgardVitals = { fcp: 0, lcp: 0, cls: 0 }
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if (entry.name === "first-contentful-paint") window.__osgardVitals.fcp = entry.startTime
        }
      }).observe({ type: "paint", buffered: true })
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) window.__osgardVitals.lcp = entry.startTime
      }).observe({ type: "largest-contentful-paint", buffered: true })
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if (!entry.hadRecentInput) window.__osgardVitals.cls += entry.value
        }
      }).observe({ type: "layout-shift", buffered: true })
    })
    await page.goto(`${base}/cofounder`, { waitUntil: "networkidle", timeout: 30_000 })
    await page.waitForTimeout(500)
    const vitals = await page.evaluate(() => window.__osgardVitals)
    await page.close()
    if (!vitals.fcp || !vitals.lcp || vitals.fcp > limits.fcp || vitals.lcp > limits.lcp || vitals.cls > limits.cls) {
      throw new Error(`web-vitals ${target.name}: ${JSON.stringify({ vitals, limits })}`)
    }
    console.log(`design-system:web-vitals:ok ${target.name} ${JSON.stringify(vitals)}`)
  }
} finally {
  await browser.close()
}
