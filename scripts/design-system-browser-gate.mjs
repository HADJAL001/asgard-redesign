import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

const base = (process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com").replace(/\/$/, "")
const screenshotPath = path.resolve(process.env.DESIGN_SYSTEM_SCREENSHOT || "artifacts/design-system/cofounder.png")
const visualBaselineSha256 = (process.env.DESIGN_SYSTEM_VISUAL_BASELINE || "33d8d3b6dc4a0ac191b088ac755eabf6b99d22d0f0097c00cd28f619738dbbc2").split(",").map((value) => value.trim()).filter(Boolean)

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
  await page.locator(".ds-memory-orbit").waitFor({ state: "visible", timeout: 5000 })
  if (await page.locator(".ds-memory-layer").count() !== 4) throw new Error("memory orbit does not expose four layers")
  if (!(await page.locator(".ds-liquid-gold").isVisible())) throw new Error("liquid gold contract action is not visible")
  if (!(await page.locator(".ds-catalog-card[data-selected='true']").isVisible())) throw new Error("selected product holographic card is not visible")
  if (await page.locator(".ds-dna-preview").count() !== 5) throw new Error("visual DNA previews are incomplete")
  await page.keyboard.press("Tab")
  const focused = await page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement)) return false
    const style = getComputedStyle(element)
    return style.outlineStyle !== "none" || style.boxShadow !== "none"
  })
  if (!focused) throw new Error("keyboard focus indicator is not visible")
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
  await mobilePage.goto(`${base}/cofounder`, { waitUntil: "domcontentloaded" })
  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (mobileOverflow) throw new Error("cofounder overflows the mobile viewport")
  await mobilePage.close()
  const motionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" })
  await motionPage.goto(`${base}/cofounder`, { waitUntil: "domcontentloaded" })
  if (!(await motionPage.locator(".ds-cosmic-cursor").isVisible())) throw new Error("cosmic cursor is not available on fine pointer")
  await motionPage.mouse.move(400, 300)
  const cursorMoved = await motionPage.locator(".ds-cosmic-cursor").evaluate((element) => element.getBoundingClientRect().left > 0)
  if (!cursorMoved) throw new Error("cosmic cursor did not respond to pointer movement")
  await motionPage.close()

  const devPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const devStarted = performance.now()
  const devResponse = await devPage.goto(`${base}/dev`, { waitUntil: "domcontentloaded" })
  const developerLatencyMs = Math.round(performance.now() - devStarted)
  if (!devResponse?.ok() || developerLatencyMs > 2500) throw new Error(`developer mode response budget failed: ${devResponse?.status() || "no response"} in ${developerLatencyMs}ms`)
  const devCofounderLink = devPage.getByRole("link", { name: /AI Cofounder/ })
  await devCofounderLink.waitFor({ state: "visible", timeout: 5000 })
  const runtimePulse = devPage.locator('[role="status"][aria-label^="Runtime"]')
  await runtimePulse.waitFor({ state: "visible", timeout: 5000 })
  if (!(await runtimePulse.isVisible())) throw new Error("developer mode runtime pulse is not visible")
  await devPage.keyboard.press("Tab")
  const devFocused = await devPage.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement)) return false
    const style = getComputedStyle(element)
    return style.outlineStyle !== "none" || style.boxShadow !== "none"
  })
  if (!devFocused) throw new Error("developer mode keyboard focus indicator is not visible")
  await devPage.close()

  const replayPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const replayResponse = await replayPage.goto(`${base}/cofounder/replay/${blueprint.id}`, { waitUntil: "domcontentloaded" })
  if (!replayResponse?.ok()) throw new Error(`mission replay returned ${replayResponse?.status() || "no response"}`)
  const replayHtml = await (await fetch(`${base}/cofounder/replay/${blueprint.id}`)).text()
  if (replayHtml.includes("A cinematic AI product workspace with accessible, measurable delivery proof")) throw new Error("mission replay leaked the private brief")
  await replayPage.getByRole("heading", { name: "browser-quality-gate" }).waitFor({ state: "visible", timeout: 5000 })
  if (!(await replayPage.getByRole("heading", { name: "Evidence ledger" }).isVisible())) throw new Error("mission replay evidence ledger is not visible")
  if (!(await replayPage.getByRole("button", { name: "Share replay" }).isVisible())) throw new Error("mission replay share control is not visible")
  await replayPage.close()
  const socialPreviewResponse = await fetch(`${base}/cofounder/replay/${blueprint.id}/opengraph-image`)
  const socialPreviewType = socialPreviewResponse.headers.get("content-type") || ""
  const socialPreviewBytes = (await socialPreviewResponse.arrayBuffer()).byteLength
  if (!socialPreviewResponse.ok || !socialPreviewType.includes("image/png") || socialPreviewBytes < 1000) throw new Error(`social preview failed: ${socialPreviewResponse.status} ${socialPreviewType} ${socialPreviewBytes} bytes`)

  await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" })
  const screenshotHash = crypto.createHash("sha256").update(await fs.readFile(screenshotPath)).digest("hex")
  const screenshot = { sha256: screenshotHash, bytes: (await fs.stat(screenshotPath)).size }
  if (!visualBaselineSha256.includes(screenshotHash)) throw new Error(`visual baseline mismatch: expected one of ${visualBaselineSha256.join(", ")}, got ${screenshotHash}`)
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "a11y", status: "passed", summary: `Cofounder has named heading, ${interactiveCount} controls and focus; developer mode pulse/link/focus passed`, source: "playwright-browser-gate", contractHash: blueprint.contractHash }),
  })
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "visual-diff", status: "passed", summary: `Visual baseline matched (sha256 ${screenshot.sha256.slice(0, 16)}, ${screenshot.bytes} bytes)`, source: "playwright-browser-gate", contractHash: blueprint.contractHash }),
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
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "social-preview", status: "passed", summary: `Open Graph image returned image/png (${socialPreviewBytes} bytes)`, source: "social-preview-gate", contractHash: blueprint.contractHash }),
  })
  console.log(JSON.stringify({ blueprintId: blueprint.id, a11y: "passed", visualDiff: "passed", deploy: "passed", replay: "passed", socialPreview: "passed", healthLatencyMs, developerLatencyMs, screenshot }, null, 2))
} finally {
  await browser.close()
}
