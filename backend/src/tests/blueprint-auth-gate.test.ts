import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const route = fs.readFileSync(path.resolve(__dirname, "../../../app/api/design/blueprint/route.ts"), "utf8")
const mutationRoutes = [
  "[id]/delivery/route.ts",
  "[id]/delivery/verify/route.ts",
  "[id]/edit/route.ts",
  "[id]/command/route.ts",
  "[id]/rollback/route.ts",
  "[id]/evidence/route.ts",
].map((relative) => fs.readFileSync(path.resolve(__dirname, "../../../app/api/design/blueprint", relative), "utf8"))

test("shadowed blueprint creation fails closed without a verified actor", () => {
  assert.match(route, /OSGARD_PRODUCT_SHADOW_WRITE === "true"/)
  assert.match(route, /requireBlueprintActor\(request\)/)
  assert.match(route, /error === "auth_required" \? 401 : 503/)
})

test("blueprint mutations require a verified actor before evidence-token writes", () => {
  for (const mutation of mutationRoutes) {
    assert.match(mutation, /requireBlueprintActor\(request\)/)
    assert.match(mutation, /error === "auth_required" \? 401 : 503/)
  }
})
