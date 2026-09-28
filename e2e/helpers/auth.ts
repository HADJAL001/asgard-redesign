import { expect, type Page } from "@playwright/test"

/**
 * Uses the same browser session as the product, so API calls made with
 * page.request exercise the real authenticated boundary rather than a mocked
 * header or a stored cookie fixture.
 */
export async function signInAsReviewUser(page: Page) {
  await page.goto("/login")
  await page.locator('input[type="text"], input[name="email"]').first().fill("alex_odin")
  await page.locator('input[type="password"]').first().fill("password123")
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })
  await expect(page).not.toHaveURL(/\/login/)
}
