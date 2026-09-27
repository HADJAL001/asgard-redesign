import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const route = fs.readFileSync(path.resolve(__dirname, "../routes/service-bridge.routes.ts"), "utf8")
const cloudflareAction = fs.readFileSync(path.resolve(__dirname, "../services/service-bridge/connector-registry.ts"), "utf8")

test("Supabase project verification is authenticated, read-only, and connector-bound", () => {
  const endpoint = route.split("POST /integrations/:id/verify-project")[1]?.split("POST /integrations/:id/verify-domain")[0] || ""
  assert.match(endpoint, /requireAuth/)
  assert.match(endpoint, /integration\.connector_id !== "supabase-management"/)
  assert.match(endpoint, /runIntegrationAction\(integration, "get_project".*\{ isTest: true \}/)
  assert.match(endpoint, /returnedRef\.toLowerCase\(\) === projectRef\.toLowerCase\(\)/)
})

test("Cloudflare domain verification checks the owned zone and exact DNS record without mutations", () => {
  const endpoint = route.split("POST /integrations/:id/verify-domain")[1]?.split("POST /integrations/:id/execute")[0] || ""
  assert.match(endpoint, /requireAuth/)
  assert.match(endpoint, /integration\.connector_id !== "cloudflare"/)
  assert.match(endpoint, /runIntegrationAction\(integration, "list_zones".*\{ isTest: true \}/)
  assert.match(endpoint, /runIntegrationAction\(integration, "list_dns_records".*\{ isTest: true \}/)
  assert.match(endpoint, /domain\.endsWith\(`\.\$\{item\.name\.toLowerCase\(\)\}`\)/)
  assert.match(endpoint, /item\.name\.toLowerCase\(\) === domain/)
  assert.match(cloudflareAction, /id: "list_zones"[\s\S]*key: "per_page"/)
})
