import { chromium } from "playwright"

const base = (process.env.DESIGN_SYSTEM_BASE_URL || "https://osgardnewworld.com").replace(/\/$/, "")
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ reducedMotion: "reduce" })

try {
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(`${base}/cofounder`, { waitUntil: "networkidle", timeout: 30_000 })

  const result = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
    }
    const controls = [...document.querySelectorAll("button, a[href], [role='button'], [role='link']")].filter(visible)
    const unnamed = controls.filter((element) => {
      const labelledBy = element.getAttribute("aria-labelledby")
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ")
        : ""
      const name = element.getAttribute("aria-label") || labelledText || element.getAttribute("title") || element.textContent || ""
      return !name.trim()
    })
    const first = controls[0]
    first?.focus()
    const focusStyle = first ? getComputedStyle(first) : null
    const focusVisible = Boolean(first && (
      focusStyle?.outlineStyle !== "none" ||
      focusStyle?.boxShadow !== "none"
    ))
    return {
      lang: document.documentElement.getAttribute("lang"),
      controlCount: controls.length,
      unnamed: unnamed.map((element) => element.outerHTML.slice(0, 180)),
      focusVisible,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    }
  })

  if (errors.length) throw new Error(`runtime a11y: page errors: ${errors.join(" | ")}`)
  if (!result.lang) throw new Error("runtime a11y: document lang is missing")
  if (result.unnamed.length) throw new Error(`runtime a11y: unnamed controls: ${result.unnamed.join(" | ")}`)
  if (!result.focusVisible) throw new Error("runtime a11y: first interactive control has no visible focus style")
  if (!result.reducedMotion) throw new Error("runtime a11y: reduced-motion preference was not observable")
  console.log(`design-system:runtime-a11y:ok (${result.controlCount} controls, lang=${result.lang})`)
} finally {
  await browser.close()
}
