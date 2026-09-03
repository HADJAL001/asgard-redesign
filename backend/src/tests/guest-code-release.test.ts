import { test } from "node:test"
import assert from "node:assert/strict"
import type { AppGenerationResult } from "../services/app-generator"
import { guestReleaseErrors } from "../services/guest-code-store"

function result(files: AppGenerationResult["files"]): AppGenerationResult {
  return { files, source: "fallback", brief: {} as AppGenerationResult["brief"] }
}

test("guest release accepts a minimal runnable project", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: '{"scripts":{"dev":"next dev"}}' },
    { path: "app/page.tsx", content: "export default function Page() { return <main /> }" },
  ]))
  assert.deepEqual(errors, [])
})

test("guest release requires the runnable scaffold", () => {
  const errors = guestReleaseErrors(result([{ path: "README.md", content: "hello" }]))
  assert.ok(errors.includes("missing package.json"))
  assert.ok(errors.includes("missing app/page.tsx"))
})

test("guest release rejects oversized files", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: '{"scripts":{"dev":"next dev"}}' },
    { path: "app/page.tsx", content: "x".repeat(512 * 1024 + 1) },
  ]))
  assert.ok(errors.some((error) => error.startsWith("file too large:")))
})

test("guest release rejects projects that cannot start", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: "{}" },
    { path: "app/page.tsx", content: "" },
  ]))
  assert.ok(errors.includes("missing dev script"))
  assert.ok(errors.includes("empty app/page.tsx"))
})

test("guest release rejects invalid package JSON", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: "{" },
    { path: "app/page.tsx", content: "export default function Page() { return null }" },
  ]))
  assert.ok(errors.includes("invalid package.json"))
})
