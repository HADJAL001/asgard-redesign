import { test } from "node:test"
import assert from "node:assert/strict"
import type { AppGenerationResult } from "../services/app-generator"
import { guestArchiveFilename, guestReleaseErrors, isGuestTaskId } from "../services/guest-code-store"

function result(files: AppGenerationResult["files"]): AppGenerationResult {
  return { files, source: "fallback", brief: {} as AppGenerationResult["brief"] }
}

const packageJson = JSON.stringify({
  scripts: { dev: "next dev" },
  dependencies: { next: "^14.2.0", react: "^18.3.0", "react-dom": "^18.3.0" },
})

test("guest release accepts a minimal runnable project", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: packageJson },
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
    { path: "package.json", content: packageJson },
    { path: "app/page.tsx", content: "x".repeat(512 * 1024 + 1) },
  ]))
  assert.ok(errors.some((error) => error.startsWith("file too large:")))
})

test("guest release rejects projects that cannot start", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: "{}" },
    { path: "app/page.tsx", content: "" },
  ]))
  assert.ok(errors.includes("unsupported dev script"))
  assert.ok(errors.includes("empty app/page.tsx"))
})

test("guest release rejects invalid package JSON", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: "{" },
    { path: "app/page.tsx", content: "export default function Page() { return null }" },
  ]))
  assert.ok(errors.includes("invalid package.json"))
})

test("guest release rejects a dev script that cannot boot the WebContainer preview", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: JSON.stringify({
      scripts: { dev: "echo ready" },
      dependencies: { next: "^14.2.0", react: "^18.3.0", "react-dom": "^18.3.0" },
    }) },
    { path: "app/page.tsx", content: "export default function Page() { return null }" },
  ]))
  assert.ok(errors.includes("unsupported dev script"))
})

test("guest release requires the Next and React runtime dependencies", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: '{"scripts":{"dev":"next dev"},"dependencies":{"next":"^14.2.0"}}' },
    { path: "app/page.tsx", content: "export default function Page() { return null }" },
  ]))
  assert.ok(errors.includes("missing runtime dependency: react"))
  assert.ok(errors.includes("missing runtime dependency: react-dom"))
})

test("guest release rejects duplicate and case-colliding paths", () => {
  const errors = guestReleaseErrors(result([
    { path: "package.json", content: packageJson },
    { path: "app/page.tsx", content: "export default function Page() { return null }" },
    { path: "/app/page.tsx", content: "export default function Duplicate() { return null }" },
    { path: "components/Card.tsx", content: "export function Card() { return null }" },
    { path: "components/card.tsx", content: "export function OtherCard() { return null }" },
  ]))
  assert.ok(errors.includes("duplicate file path: app/page.tsx"))
  assert.ok(errors.includes("case-colliding file paths: components/Card.tsx, components/card.tsx"))
})

test("guest archive filename is safe and stable", () => {
  assert.equal(guestArchiveFilename("My Client Portal", "12345678-abcd"), "my-client-portal.zip")
  assert.equal(guestArchiveFilename("Проект \"Мечта\"\r\n.zip", "A1B2-C3D4"), "osgard-project-a1b2c3d4.zip")
  assert.equal(guestArchiveFilename("Проект мечты", "A1B2-C3D4"), "osgard-project-a1b2c3d4.zip")
})

test("guest task IDs accept only UUIDs before any Redis lookup", () => {
  assert.equal(isGuestTaskId("002c6d83-5cb4-4f44-b1a9-8bbd226aba1d"), true)
  assert.equal(isGuestTaskId("../../osgard:guest-code:task:secret"), false)
  assert.equal(isGuestTaskId("not-a-task"), false)
})
