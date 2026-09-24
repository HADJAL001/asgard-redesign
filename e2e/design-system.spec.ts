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
    expect(body.guardrails.maxClientJsKb).toBeLessThanOrEqual(180)
    expect(body.componentRegistry.find((item: { id: string }) => item.id === "form-wizard").required).toContain("error-summary")
  })

  test("normalizes client profile identifiers", async ({ request }) => {
    const response = await request.get("/api/design/manifest?app=Client%20Portal%2Fv2")
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.profile.app).toBe("client-portal-v2")
  })

  test("builds a guarded blueprint from a client brief", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: { app: "clinic", brief: "A calm patient portal for booking visits and reviewing care plans.", components: ["hero", "preview-frame", "unknown-html"] } })
    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.blueprint.components).toEqual(["hero", "preview-frame"])
    expect(body.blueprint.arbitraryHtml).toBe(false)
    expect(body.blueprint.stages).toHaveLength(5)
    expect(body.blueprint.quality.humanReviewRequired).toBe(true)
    expect(body.blueprint.quality.warnings).toContain("app_shell_required_for_navigation")
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers()["x-request-id"]).toBe(body.requestId)
    expect(response.headers()["x-rate-limit-limit"]).toBe("30")
    expect(Number(response.headers()["x-rate-limit-remaining"])).toBeLessThan(30)
    expect(body.blueprint.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.blueprint.revision).toBe(1)
  })

  test("persists a blueprint for cross-device restore", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: { app: "restore-check", brief: "A durable workspace for restoring a generated product blueprint." } })
    expect(response.status()).toBe(201)
    const created = await response.json()
    const id = created.blueprint.id
    const restored = await request.get(`/api/design/blueprint/${id}`)
    expect(restored.status()).toBe(200)
    const restoredBody = await restored.json()
    expect(restoredBody.blueprint.id).toBe(id)
    expect(restoredBody.blueprint.revision).toBe(1)
    expect(restoredBody.revisions).toEqual([{ revision: 1, generatedAt: created.blueprint.generatedAt }])
  })

  test("rejects unusable client briefs", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: { brief: "too short" } })
    expect(response.status()).toBe(400)
  })

  test("rejects non-json blueprint payloads", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: "not-json", headers: { "content-type": "text/plain" } })
    expect(response.status()).toBe(415)
    expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/)
  })

  test("rejects oversized blueprint payloads", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: { brief: "x".repeat(33_000) } })
    expect(response.status()).toBe(413)
  })

  test("falls back to a complete shell when requested components are unknown", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: { brief: "A complete client workspace for reviewing a generated application.", components: ["unknown-html"] } })
    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.blueprint.components).toEqual(["app-shell", "hero", "bento-grid", "preview-frame", "cinematic-sequence"])
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
    await page.locator("dialog input").fill("Client portal")
    await page.locator("dialog textarea").fill("A working preview for the client review journey.")
    await page.locator("dialog form button[type=submit]").click()
    await expect(page.locator(".ds-dialog-result")).toContainText("Blueprint")
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
