import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

const base = (process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com").replace(/\/$/, "")
const screenshotPath = path.resolve(process.env.DESIGN_SYSTEM_SCREENSHOT || "artifacts/design-system/cofounder.png")
const visualBaselineSha256 = (process.env.DESIGN_SYSTEM_VISUAL_BASELINE || "33d8d3b6dc4a0ac191b088ac755eabf6b99d22d0f0097c00cd28f619738dbbc2,4334546d2733739cd459352fb14ccc78acd021beb3ed1a8c8f54481d11f5bbea,86cd89cbde4babce41077f65626a77da5b7ea1b3f48aa79c90e646ecf6062423,9cc05935e251ea5dd5a75d4120e3857f6bc02a444ea632124c09d212f16caac0,29db5db17900094946024e8d40a463ff821d2e38b4ecfb46712dac9e82fcad17,b97599be34fdd5177d07cc8d85373daf11dadfeec7c9472f5ce140e05af0a0e5,29849fe413fadc016604182c5a14b5f830f244b4c497420fb1a44cf1f3ea3f3c,77034dba0099bb55479666b0e488236697b126047cfcd732383eba3787d85a00,9fad749ec03d583cd895fe050ef201613a4d0e8da3914b52cc52333f24af50e0,5bc2a02ea32c3624d995a4d676662ff62a5188943c2e7280223ce7e688d36410").split(",").map((value) => value.trim()).filter(Boolean)

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
const evidenceToken = created?.evidenceToken
if (!blueprint?.id || !blueprint.contractHash || !evidenceToken) throw new Error("blueprint contract or evidence token missing")

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  await page.goto(`${base}/cofounder`, { waitUntil: "networkidle" })
  const heading = page.getByRole("heading", { name: "AI Cofounder" })
  if (!(await heading.isVisible())) throw new Error("AI Cofounder heading is not visible")
  if (await page.locator('[data-primary-action="create-contract"]').count() !== 1) throw new Error("cofounder first-screen contract action is missing")
  // The Cofounder is an isolated command deck. Economy navigation belongs to
  // the global platform shell and must never leak into this focused workflow.
  if (await page.getByRole("contentinfo").count()) throw new Error("cofounder rendered the global platform footer")
  if (await page.locator('dialog a[href="/integrations"][target="_blank"]').count() !== 1) throw new Error("delivery wizard has no integration handoff")
  const interactiveCount = await page.locator("button, a, input, textarea, select").count()
  if (interactiveCount < 3) throw new Error(`interactive surface too small: ${interactiveCount}`)
  await page.locator(".ds-memory-orbit").waitFor({ state: "visible", timeout: 5000 })
  if (await page.locator(".ds-memory-layer").count() !== 4) throw new Error("memory orbit does not expose four layers")
  if (!(await page.locator('[data-primary-action="create-contract"]').isVisible())) throw new Error("liquid gold contract action is not visible")
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
  await motionPage.addInitScript(() => {
    const original = window.matchMedia
    window.matchMedia = (query) => {
      if (query === "(pointer: fine)") return { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } }
      return original(query)
    }
  })
  await motionPage.goto(`${base}/cofounder`, { waitUntil: "domcontentloaded" })
  await motionPage.locator(".ds-cosmic-cursor").waitFor({ state: "visible", timeout: 5000 })
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
  if (!(await replayPage.getByRole("heading", { name: "Delivery outcome" }).isVisible())) throw new Error("mission replay delivery outcome is not visible")
  if (!(await replayPage.getByRole("button", { name: "Share replay" }).isVisible())) throw new Error("mission replay share control is not visible")
  if (await replayPage.getByRole("contentinfo").count()) throw new Error("mission replay rendered the global platform footer")
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
    body: JSON.stringify({ kind: "a11y", status: "passed", summary: `Cofounder has named heading, ${interactiveCount} controls and focus; developer mode pulse/link/focus passed`, source: "playwright-browser-gate", contractHash: blueprint.contractHash, evidenceToken }),
  })
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "visual-diff", status: "passed", summary: `Visual baseline matched (sha256 ${screenshot.sha256.slice(0, 16)}, ${screenshot.bytes} bytes)`, source: "playwright-browser-gate", contractHash: blueprint.contractHash, evidenceToken }),
  })
  const healthStarted = performance.now()
  const healthResponse = await fetch(`${base}/api/health`, { cache: "no-store" })
  const healthLatencyMs = Math.round(performance.now() - healthStarted)
  if (!healthResponse.ok) throw new Error(`health returned ${healthResponse.status}`)
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "deploy", status: "passed", summary: `Production health returned HTTP ${healthResponse.status} in ${healthLatencyMs}ms`, source: "production-health-gate", contractHash: blueprint.contractHash, evidenceToken }),
  })
  await json(`${base}/api/design/blueprint/${blueprint.id}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "social-preview", status: "passed", summary: `Open Graph image returned image/png (${socialPreviewBytes} bytes)`, source: "social-preview-gate", contractHash: blueprint.contractHash, evidenceToken }),
  })
  console.log(JSON.stringify({ blueprintId: blueprint.id, a11y: "passed", visualDiff: "passed", deploy: "passed", replay: "passed", socialPreview: "passed", healthLatencyMs, developerLatencyMs, screenshot }, null, 2))
} finally {
  await browser.close()
}
