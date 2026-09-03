import { test } from "node:test"
import assert from "node:assert/strict"
import type { AppGenerationResult } from "../services/app-generator"
import { guestReleaseErrors } from "../services/guest-code-store"

function result(files: AppGenerationResult["files"]): AppGenerationResult {
  return { files, source: "fallback", brief: {} as AppGenerationResult["brief"] }
}

test("guest release accepts a minimal runnable project", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: "{}" },
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
    { path: "package.json", content: "{}" },
    { path: "app/page.tsx", content: "x".repeat(512 * 1024 + 1) },
  ]))
  assert.ok(errors.some((error) => error.startsWith("file too large:")))
})
