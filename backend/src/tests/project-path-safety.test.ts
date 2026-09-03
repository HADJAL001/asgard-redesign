import { test } from "node:test"
import assert from "node:assert/strict"
import { isSafeProjectPath, mergeGeneratedFiles } from "../services/app-generator"

test("project paths accept normal and dynamic-route files", () => {
  assert.equal(isSafeProjectPath("app/page.tsx"), true)
  assert.equal(isSafeProjectPath("app/api/invoices/[id]/route.ts"), true)
})

test("project paths normalize a leading slash but reject traversal and drive paths", () => {
  assert.equal(isSafeProjectPath("components/../../outside.ts"), false)
  assert.equal(isSafeProjectPath("/../../outside.ts"), false)
  assert.equal(isSafeProjectPath("/app/page.tsx"), true)
  assert.equal(isSafeProjectPath("C:\\temp\\file.ts"), false)
  assert.equal(isSafeProjectPath("components//Button.tsx"), false)
})

test("project merge drops unsafe provider output", () => {
  const files = mergeGeneratedFiles([
    { path: "app/page.tsx", content: "export default function Page() {}" },
    { path: "components/../../outside.ts", content: "secret" },
  ])
  assert.deepEqual(files.map((file) => file.path), ["app/page.tsx"])
})
