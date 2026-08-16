import assert from "node:assert/strict"
import test from "node:test"
import { decideProjectRelease } from "../lib/project-release"

const defect = (severity: "error" | "warn") => ({
  rule: "test",
  severity,
  file: "app/page.tsx",
  message: "test defect",
  autoFixable: false,
})

test("only a clean passed or repaired verdict can be released", () => {
  assert.equal(decideProjectRelease({ verdict: "passed", defects: [] }).status, "ready")
  assert.equal(decideProjectRelease({ verdict: "repaired", defects: [defect("warn")] }).status, "ready")
  assert.equal(decideProjectRelease({ verdict: "broken", defects: [] }).status, "failed")
  assert.equal(decideProjectRelease({ verdict: "unverified", defects: [] }).status, "failed")
})

test("any remaining engineering error blocks release", () => {
  const result = decideProjectRelease({ verdict: "repaired", defects: [defect("error")] })
  assert.equal(result.status, "failed")
  assert.match(result.message ?? "", /blocking error/i)
})
