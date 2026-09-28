import { test, expect } from "@playwright/test"

test.describe("Authenticated blueprint workflow", () => {
  test("allows a signed-in reviewer to approve and comment before codegen", async ({ page }) => {
    await page.goto("/login")
    await page.locator('input[type="text"], input[name="email"]').first().fill("alex_odin")
    await page.locator('input[type="password"]').first().fill("password123")
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })

    const created = await page.request.post("/api/design/blueprint", {
      data: { app: "authenticated-e2e", brief: "A private product workspace for reviewing a verified release." },
    })
    expect(created.status()).toBe(201)
    const body = await created.json()

    const approval = await page.request.post(`/api/design/blueprint/${body.blueprint.id}/approve`, { data: { revision: 1 } })
    expect(approval.status()).toBe(201)
    expect((await approval.json()).blueprint.approval.status).toBe("approved")

    const comment = await page.request.post(`/api/design/blueprint/${body.blueprint.id}/comments`, {
      data: { revision: 1, comment: "Approved after reviewing the storyboard and evidence gates.", author: "E2E reviewer", evidenceToken: body.evidenceToken },
    })
    expect(comment.status()).toBe(201)
    expect((await comment.json()).comment.author).toBe("Alex Odin")

    const generate = await page.request.post(`/api/design/blueprint/${body.blueprint.id}/generate`)
    expect(generate.status()).toBe(409)
  })
})
