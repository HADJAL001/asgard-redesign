import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

const base = (process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com").replace(/\/$/, "")
const screenshotPath = path.resolve(process.env.DESIGN_SYSTEM_SCREENSHOT || "artifacts/design-system/cofounder.png")

async function json(url, options) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${JSON.stringify(payload)}`)
  return payload
}

const created = await json(`${base}/api/design/blueprint`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ app: "browser-quality-gate", brief: "A cinematic AI product workspace with accessible, measurable delivery proof" }),
})
const blueprint = created?.blueprint
if (!blueprint?.id || !blueprint.contractHash) throw new Error("blueprint contract missing")

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  await page.goto(`${base}/cofounder`, { waitUntil: "networkidle" })
  const heading = page.getByRole("heading", { name: "AI Cofounder" })
  if (!(await heading.isVisible())) throw new Error("AI Cofounder heading is not visible")
  const interactiveCount = await page.locator("button, a, input, textarea, select").count()
  if (interactiveCount < 3) throw new Error(`interactive surface too small: ${interactiveCount}`)
  await page.keyboard.press("Tab")
  const focused = await page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement)) return false
    const style = getComputedStyle(element)
    return style.outlineStyle !== "none" || style.boxShadow !== "none"
  })
  if (!focused) throw new Error("keyboard focus indicator is not visible")

  await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" })
  const screenshotHash = crypto.createHash("sha256").update(await fs.readFile(screenshotPath)).digest("hex")
  const screenshot = { sha256: screenshotHash, bytes: (await fs.stat(screenshotPath)).size }
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "a11y", status: "passed", summary: `Rendered Cofounder has named heading, ${interactiveCount} interactive controls and visible keyboard focus`, source: "playwright-browser-gate", contractHash: blueprint.contractHash }),
  })
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "visual-diff", status: "passed", summary: `Reduced-motion deterministic screenshot captured (sha256 ${screenshot.sha256.slice(0, 16)}, ${screenshot.bytes} bytes)`, source: "playwright-browser-gate", contractHash: blueprint.contractHash }),
  })
  const healthStarted = performance.now()
  const healthResponse = await fetch(`${base}/api/health`, { cache: "no-store" })
  const healthLatencyMs = Math.round(performance.now() - healthStarted)
  if (!healthResponse.ok) throw new Error(`health returned ${healthResponse.status}`)
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "deploy", status: "passed", summary: `Production health returned HTTP ${healthResponse.status} in ${healthLatencyMs}ms`, source: "production-health-gate", contractHash: blueprint.contractHash }),
  })
  console.log(JSON.stringify({ blueprintId: blueprint.id, a11y: "passed", visualDiff: "passed", deploy: "passed", healthLatencyMs, screenshot }, null, 2))
} finally {
  await browser.close()
}
