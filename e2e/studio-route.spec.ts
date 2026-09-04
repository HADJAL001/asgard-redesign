import { expect, test } from "@playwright/test"

test("the legacy studio URL opens the verified project creation flow", async ({ page }) => {
  const response = await page.goto("/studio")

  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('input[name="projectIdea"]:visible')).toBeVisible()
  expect(response?.headers()["cross-origin-embedder-policy"]).toBeUndefined()
  expect(response?.headers()["cross-origin-opener-policy"]).toBeUndefined()
})
