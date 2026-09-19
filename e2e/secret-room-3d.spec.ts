import { expect, test } from "@playwright/test"

test("renders the Secret Room headquarters canvas", async ({ page }) => {
  await page.route("**/api/secret-room/events", async (route) => route.fulfill({ json: { events: [] } }))
  await page.route("**/api/secret-room/activity", async (route) => route.fulfill({ json: { activity: [] } }))
  await page.route("**/api/secret-room", async (route) => route.fulfill({ json: {
    hasAccess: true,
    isOwner: true,
    room: {
      id: 1, name: "OSGARD HQ", background: "aurora", friendSlots: 3, active: true, accessUntil: 1_893_456_000_000,
      avatarGltf: null,
      items: [{ type: "lamp", x: 15, y: 20 }, { type: "throne", x: 75, y: 65 }, { type: "aquarium", x: 18, y: 58 }, { type: "painting", x: 55, y: 25 }, { type: "crystal", x: 80, y: 26 }],
    },
    members: [], pricing: { entryUsd: 99, monthlyUsd: 9, extraFriendUsd: 49, freeFriendSlots: 3, periodDays: 30 },
  } }))

  await page.goto("/room")
  const canvas = page.locator("canvas")
  await expect(canvas).toBeVisible()
  const dimensions = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement
    return { width: canvasElement.width, height: canvasElement.height }
  })
  expect(dimensions.width).toBeGreaterThan(0)
  expect(dimensions.height).toBeGreaterThan(0)
  const screenshot = await page.screenshot({ fullPage: true })
  expect(screenshot.length).toBeGreaterThan(10_000)
})
