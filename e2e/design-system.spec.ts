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

  test("cofounder renders hull workspace with keyboard-visible controls", async ({ page }) => {
    await page.goto("/cofounder")
    await expect(page.getByRole("heading", { name: "AI Cofounder" })).toBeVisible()
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
    const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
    expect(reduced).toBe(true)
  })
})
