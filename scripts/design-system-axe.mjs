import axe from "axe-core"
import { chromium } from "playwright"

const base = (process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com").replace(/\/$/, "")
const paths = ["/cofounder", "/dev"]
const browser = await chromium.launch({ headless: true })

try {
  for (const path of paths) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
    await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 30_000 })
    await page.addScriptTag({ content: axe.source })
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })
      return result.violations.map((item) => ({
        id: item.id,
        impact: item.impact,
        targets: item.nodes.map((node) => node.target.join(" ")).slice(0, 5),
      }))
    })
    await page.close()
    if (violations.length) throw new Error(`axe ${path}: ${JSON.stringify(violations)}`)
    console.log(`design-system:axe:ok ${path}`)
  }
} finally {
  await browser.close()
}
