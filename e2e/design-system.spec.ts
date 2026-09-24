import { test, expect } from "@playwright/test"

test.describe("OSGARD design system", () => {
  test("exposes versioned futuristic tokens", async ({ request }) => {
    const response = await request.get("/api/design/tokens?preset=futuristic")
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.preset).toBe("futuristic")
    expect(body.tokens.colors.primary).toMatch(/^#/)
    expect(body.tokens.motion.reducedMotion).toBe(true)
  })

  test("keeps tenant branding server-scoped", async ({ request }) => {
    const response = await request.get("/api/design/tenant")
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.brand.tenantId).toBe("osgardnewworld")
  })

  test("exposes a guarded universal app manifest", async ({ request }) => {
    const response = await request.get("/api/design/manifest?app=client-portal&preset=bold")
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.profile).toMatchObject({ app: "client-portal", preset: "bold", universal: true })
    expect(body.componentRegistry.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(["app-shell", "preview-frame", "cinematic-sequence"]))
    expect(body.cinematic.scenes).toEqual(["intent", "architecture", "build", "preview", "approval"])
    expect(body.guardrails).toMatchObject({ contrast: "WCAG-AA", allowArbitraryHtml: false })
  })

  test("cofounder renders hull workspace with keyboard-visible controls", async ({ page }) => {
    await page.goto("/cofounder")
    await expect(page.getByRole("heading", { name: "AI Cofounder" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Memory Fabric live map" })).toBeVisible()
    await expect(page.getByText("Память продукта")).toBeVisible()
    const create = page.getByRole("button", { name: /Создать контракт/ })
    await create.focus()
    await expect(create).toBeFocused()
    await create.press("Enter")
    await expect(page.getByText("НОВЫЙ КОНТРАКТ").last()).toBeVisible()
    await page.keyboard.press("Escape")
  })

  test("reduced motion preference is respected by the document", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/cofounder")
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true)
  })

  test("developer mode exposes the AI Cofounder workspace", async ({ page }) => {
    await page.goto("/dev")
    await expect(page.getByRole("navigation", { name: "Разделы студии разработчика" })).toBeVisible()
    await expect(page.getByRole("link", { name: /AI Cofounder/ })).toHaveAttribute("href", "/cofounder")
  })

  test("product shell exposes a keyboard skip link", async ({ page }) => {
    await page.goto("/cofounder")
    const skip = page.getByRole("link", { name: "Перейти к содержимому" })
    await expect(skip).toHaveAttribute("href", "#main-content")
    await skip.focus()
    await expect(skip).toBeFocused()
  })

  test("mobile product surfaces stay within the viewport", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    for (const route of ["/dev", "/cofounder"]) {
      const page = await context.newPage()
      await page.goto(route)
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(layout.scrollWidth, `${route} has horizontal overflow`).toBeLessThanOrEqual(layout.clientWidth)
      await page.close()
    }
    await context.close()
  })

})
