import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://osgardnewworld.com", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
