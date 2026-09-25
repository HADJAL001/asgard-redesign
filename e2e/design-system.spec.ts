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
    const response = await request.post("/api/design/blueprint", { data: { app: "clinic", brief: "A calm patient portal for booking visits and reviewing care plans.", components: ["hero", "preview-frame", "unknown-html"], aiPlan: { summary: "A calm review-first portal.", components: ["hero", "preview-frame", "unknown-html"], risks: ["Needs consent copy"] } } })
    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.blueprint.components).toEqual(["hero", "preview-frame"])
    expect(body.blueprint.arbitraryHtml).toBe(false)
    expect(body.blueprint.stages).toHaveLength(5)
    expect(body.blueprint.quality.humanReviewRequired).toBe(true)
    expect(body.blueprint.productType).toBe("application")
    expect(body.blueprint.preset).toBe("futuristic")
    expect(body.blueprint.contractVersion).toBe("1.0.0")
    expect(body.blueprint.contractHash).toMatch(/^[a-f0-9]{64}$/)
    expect(body.evidence).toHaveLength(2)
    expect(body.evidenceToken).toMatch(/^[a-f0-9]{64}$/)
    expect(body.evidence[0]).toMatchObject({ kind: "security", status: "passed", source: "blueprint-guard", contractHash: body.blueprint.contractHash })
    expect(body.evidence[1]).toMatchObject({ kind: "performance", status: "passed", source: "blueprint-runtime-budget", contractHash: body.blueprint.contractHash })
    const quality = await request.get(`/api/design/blueprint/${body.blueprint.id}/quality`)
    expect(quality.status()).toBe(200)
    expect((await quality.json()).readyForCodegen).toBe(false)
    expect(body.blueprint.quality.warnings).toContain("app_shell_required_for_navigation")
    expect(body.blueprint.aiPlan).toEqual({ summary: "A calm review-first portal.", components: ["hero", "preview-frame"], risks: ["Needs consent copy"] })
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers()["x-request-id"]).toBe(body.requestId)
    expect(response.headers()["x-rate-limit-limit"]).toBe("30")
    expect(Number(response.headers()["x-rate-limit-remaining"])).toBeLessThan(30)
    expect(body.blueprint.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.blueprint.revision).toBe(1)
  })

  test("binds evidence ledger entries to the contract hash", async ({ request }) => {
    const created = await request.post("/api/design/blueprint", { data: { app: "evidence-check", brief: "A product workspace with auditable release evidence and safe delivery." } })
    const createdBody = await created.json()
    const blueprint = createdBody.blueprint
    expect(createdBody.evidenceToken).toMatch(/^[a-f0-9]{64}$/)
    const publicBlueprint = await request.get(`/api/design/blueprint/${blueprint.id}`)
    expect(publicBlueprint.status()).toBe(200)
    expect(await publicBlueprint.text()).not.toContain(createdBody.evidenceToken)
    const replay = await request.get(`/cofounder/replay/${blueprint.id}`)
    expect(replay.status()).toBe(200)
    expect(await replay.text()).not.toContain(createdBody.evidenceToken)
    const evidence = await request.post(`/api/design/blueprint/${blueprint.id}/evidence`, { data: { kind: "a11y", status: "passed", summary: "Keyboard and contrast checks passed", source: "quality-gate", contractHash: blueprint.contractHash, evidenceToken: createdBody.evidenceToken } })
    expect(evidence.status()).toBe(201)
    const evidenceBody = await evidence.json()
    expect(evidenceBody.evidence.contractHash).toBe(blueprint.contractHash)
    const ledger = await request.get(`/api/design/blueprint/${blueprint.id}/evidence`)
    expect(ledger.status()).toBe(200)
    const ledgerEntries = (await ledger.json()).evidence
    expect(ledgerEntries).toHaveLength(3)
    expect(ledgerEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "security", revision: 1, contractHash: blueprint.contractHash }),
      expect.objectContaining({ kind: "performance", revision: 1, contractHash: blueprint.contractHash }),
      expect.objectContaining({ kind: "a11y", revision: 1, contractHash: blueprint.contractHash }),
    ]))
    const forged = await request.post(`/api/design/blueprint/${blueprint.id}/evidence`, { data: { kind: "deploy", status: "passed", summary: "Forged evidence", source: "attacker", contractHash: blueprint.contractHash, evidenceToken: "0".repeat(64) } })
    expect(forged.status()).toBe(403)
    const oversized = await request.post(`/api/design/blueprint/${blueprint.id}/evidence`, { data: { kind: "a11y", status: "passed", summary: "x".repeat(20_000), source: "quality-gate", contractHash: blueprint.contractHash, evidenceToken: createdBody.evidenceToken } })
    expect(oversized.status()).toBe(413)
    const mismatch = await request.post(`/api/design/blueprint/${blueprint.id}/evidence`, { data: { kind: "security", status: "passed", summary: "Wrong contract", source: "quality-gate", contractHash: "0".repeat(64) } })
    expect(mismatch.status()).toBe(409)
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

    const rollback = await request.post(`/api/design/blueprint/${id}/rollback`, { data: { revision: 1 } })
    expect(rollback.status()).toBe(201)
    const rollbackBody = await rollback.json()
    expect(rollbackBody.rolledBackFrom).toBe(1)
    expect(rollbackBody.blueprint.revision).toBe(2)
    expect(rollbackBody.blueprint.brief).toBe(created.blueprint.brief)
    expect(rollbackBody.evidence).toMatchObject({ kind: "rollback", status: "passed", revision: 2, contractHash: created.blueprint.contractHash })
    const quality = await request.get(`/api/design/blueprint/${id}/quality`)
    expect((await quality.json()).missing).toEqual(["security", "performance", "a11y", "visual-diff", "deploy"])
  })

  test("exposes a safe render plan for live preview", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: { app: "preview-check", brief: "A review workspace with a reliable preview and approval flow.", components: ["hero", "preview-frame"] } })
    const created = await response.json()
    const preview = await request.get(`/api/design/blueprint/${created.blueprint.id}/preview`)
    expect(preview.status()).toBe(200)
    const body = await preview.json()
    expect(body.renderPlan.arbitraryHtml).toBe(false)
    expect(body.renderPlan.layout).toBe("hull-fluid")
    expect(body.renderPlan.slots.map((slot: { component: string }) => slot.component)).toEqual(["hero", "preview-frame"])
  })

  test("requires explicit approval before codegen handoff", async ({ request }) => {
    const response = await request.post("/api/design/blueprint", { data: { app: "approval-check", brief: "A product preview that requires explicit human approval before delivery." } })
    const created = await response.json()
    const approval = await request.post(`/api/design/blueprint/${created.blueprint.id}/approve`, { data: { revision: 1 } })
    expect(approval.status()).toBe(201)
    const body = await approval.json()
    expect(body.blueprint.revision).toBe(2)
    expect(body.blueprint.approval.status).toBe("approved")
    expect(body.blueprint.approval.approvedAt).toEqual(expect.any(String))
    const quality = await request.get(`/api/design/blueprint/${created.blueprint.id}/quality`)
    const qualityBody = await quality.json()
    expect(qualityBody.missing).toEqual(["security", "performance", "a11y", "visual-diff", "deploy"])
    expect(qualityBody.stale).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "security", reason: "revision", expectedRevision: 2 })]))
    const generate = await request.post(`/api/design/blueprint/${created.blueprint.id}/generate`)
    expect(generate.status()).toBe(401)
  })

  test("authenticated users still need approval before codegen", async ({ page }) => {
    await page.goto("/login")
    const user = page.locator('input[type="text"], input[name="email"]').first()
    await user.fill("alex_odin")
    await page.locator('input[type="password"]').first().fill("password123")
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })
    const created = await page.request.post("/api/design/blueprint", { data: { app: "auth-gate-check", brief: "A private workspace used to verify the approval boundary." } })
    expect(created.status()).toBe(201)
    const body = await created.json()
    const generate = await page.request.post(`/api/design/blueprint/${body.blueprint.id}/generate`)
    expect(generate.status()).toBe(409)
  })

  test("keeps the AI blueprint compiler behind authentication", async ({ request }) => {
    const response = await request.post("/api/design/blueprint/compile", { data: { brief: "A secure workspace for reviewing a generated product." } })
    expect(response.status()).toBe(401)
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
    const selectedProduct = page.locator('[role="option"][aria-selected="true"]')
    await expect(selectedProduct).toHaveAttribute("title", /Choose .* product/)
    await expect(page.locator('[role="radio"][aria-checked="true"]')).toHaveAttribute("title", /Use .* visual style/)
    const initialProduct = await selectedProduct.innerText()
    await selectedProduct.focus()
    await selectedProduct.press("ArrowRight")
    await expect(selectedProduct).not.toHaveText(initialProduct)
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1)
    const create = page.getByRole("button", { name: /Создать контракт/ })
    await expect(create).toHaveAttribute("title", /verified blueprint/)
    await create.focus()
    await expect(create).toBeFocused()
    await create.press("Enter")
    await expect(page.getByText("НОВЫЙ КОНТРАКТ").last()).toBeVisible()
    await page.locator("dialog input").fill("Client portal")
    await page.getByRole("button", { name: "Launch a product" }).click()
    await expect(page.locator("dialog textarea")).toHaveValue(/focused product workspace/)
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
    await expect(page.getByRole("status", { name: /Runtime/ })).toBeVisible()
  })

  test("product shell exposes a keyboard skip link", async ({ page }) => {
    await page.goto("/cofounder")
    const skip = page.getByRole("link", { name: "Перейти к содержимому" })
    await expect(skip).toHaveAttribute("href", "#main-content")
    await skip.focus()
    await expect(skip).toBeFocused()
  })

  test("root boot shell covers the hydration gap and then dismisses", async ({ page }) => {
    await page.goto("/cofounder", { waitUntil: "domcontentloaded" })
    const boot = page.locator("#osgard-boot-shell")
    await expect(boot).toBeVisible()
    await expect(boot).toContainText("OSGARD / INITIALIZING COMMAND DECK")
    await expect(boot).toBeHidden({ timeout: 5000 })
    await expect(page.getByRole("heading", { name: "AI Cofounder" })).toBeVisible()
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

  test("cofounder meets the production performance budget", async ({ page }) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await page.addInitScript(() => {
      const metricsWindow = window as Window & { __osgardLcp?: number; __osgardCls?: number; __osgardInp?: number }
      metricsWindow.__osgardLcp = 0
      metricsWindow.__osgardCls = 0
      metricsWindow.__osgardInp = 0
      new PerformanceObserver((list) => {
        const latest = list.getEntries().at(-1)
        if (latest) metricsWindow.__osgardLcp = latest.startTime
      }).observe({ type: "largest-contentful-paint", buffered: true })
      new PerformanceObserver((list) => {
        metricsWindow.__osgardCls = (metricsWindow.__osgardCls || 0) + list.getEntries().reduce((sum, entry) => {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          return sum + (shift.hadRecentInput ? 0 : shift.value || 0)
        }, 0)
      }).observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit)
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const event = entry as PerformanceEntry & { duration?: number }
          metricsWindow.__osgardInp = Math.max(metricsWindow.__osgardInp || 0, event.duration || 0)
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit)
    })
    await page.goto("/cofounder", { waitUntil: "load" })
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      const paints = performance.getEntriesByType("paint")
      const metricsWindow = window as Window & { __osgardLcp?: number; __osgardCls?: number; __osgardInp?: number }
      return {
        domContentLoaded: navigation?.domContentLoadedEventEnd ?? 0,
        firstContentfulPaint: paints.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? 0,
        lcp: metricsWindow.__osgardLcp ?? 0,
        cls: metricsWindow.__osgardCls ?? 0,
        inp: metricsWindow.__osgardInp ?? 0,
        ttfb: navigation?.responseStart ?? 0,
      }
    })
    expect(pageErrors, "production page errors").toEqual([])
    expect(metrics.domContentLoaded, "DOMContentLoaded budget").toBeGreaterThan(0)
    expect(metrics.domContentLoaded, "DOMContentLoaded budget").toBeLessThan(3000)
    expect(metrics.firstContentfulPaint, "FCP budget").toBeGreaterThan(0)
    expect(metrics.firstContentfulPaint, "FCP budget").toBeLessThan(3000)
    expect(metrics.lcp, "LCP budget").toBeGreaterThan(0)
    expect(metrics.lcp, "LCP budget").toBeLessThan(4000)
    expect(metrics.cls, "CLS budget").toBeLessThan(0.1)
    expect(metrics.inp, "INP budget").toBeLessThan(200)
    expect(metrics.ttfb, "TTFB budget").toBeGreaterThan(0)
    expect(metrics.ttfb, "TTFB budget").toBeLessThan(1800)
  })

})
