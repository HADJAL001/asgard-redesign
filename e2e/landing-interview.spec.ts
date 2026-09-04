import { expect, test } from "@playwright/test"

test("the landing page interviews the creator before generation", async ({ page }) => {
  let generationRequests = 0
  page.on("request", (request) => {
    if (request.url().includes("/projects/generate")) generationRequests += 1
  })

  await page.goto("/")
  await page.locator('input[name="projectIdea"]:visible').fill("Сервис бронирования столиков для кафе")
  await page.locator(".artifact-form button").click()

  const brief = page.locator(".project-brief-card")
  const next = brief.locator(".project-brief-actions button").last()
  await expect(brief.locator(".project-brief-progress")).toHaveText("1 / 4")
  await brief.locator("input").fill("Владельцы небольших кафе")
  await next.click()
  await brief.locator("input").fill("Гость бронирует столик за минуту")
  await next.click()
  await brief.locator("textarea").fill("Календарь, бронирования, уведомления")
  await next.click()

  await expect(brief.locator(".project-brief-progress")).toHaveText("4 / 4")
  await expect(next).toBeEnabled()
  expect(generationRequests).toBe(0)
})

test("the landing page hydrates cleanly for an English-language browser", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" })
  const page = await context.newPage()
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  expect(pageErrors.filter((message) => /hydration failed|server rendered text/i.test(message))).toEqual([])

  await context.close()
})
