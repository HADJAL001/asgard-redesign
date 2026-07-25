import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { collectProblems } from "../lib/security-preflight"

/* ================================================================
   OSGARD · Юнит-тест: security-preflight (проверка секретов)
   ================================================================ */

const KEYS = ["JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"] as const
const saved: Record<string, string | undefined> = {}
for (const k of KEYS) saved[k] = process.env[k]

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

test("сильные секреты → нет проблем", () => {
  process.env.JWT_SECRET = "a".repeat(32)
  process.env.JWT_REFRESH_SECRET = "b".repeat(32)
  process.env.ENCRYPTION_KEY = "c".repeat(32)
  assert.deepEqual(collectProblems(), [])
})

test("небезопасный дефолт детектируется", () => {
  process.env.JWT_SECRET = "default_secret"
  process.env.JWT_REFRESH_SECRET = "b".repeat(32)
  process.env.ENCRYPTION_KEY = "c".repeat(32)
  const problems = collectProblems()
  assert.equal(problems.length, 1)
  assert.match(problems[0], /JWT_SECRET.*дефолт/)
})

test("незаданный секрет детектируется", () => {
  delete process.env.JWT_SECRET
  process.env.JWT_REFRESH_SECRET = "b".repeat(32)
  process.env.ENCRYPTION_KEY = "c".repeat(32)
  assert.match(collectProblems().find((p) => p.startsWith("JWT_SECRET"))!, /не задан/)
})

test("слишком короткий секрет детектируется", () => {
  process.env.JWT_SECRET = "short"
  process.env.JWT_REFRESH_SECRET = "b".repeat(32)
  process.env.ENCRYPTION_KEY = "c".repeat(32)
  assert.match(collectProblems().find((p) => p.startsWith("JWT_SECRET"))!, /короткий/)
})

test("значение секрета не попадает в текст проблемы", () => {
  process.env.JWT_SECRET = "default_secret"
  process.env.JWT_REFRESH_SECRET = "b".repeat(32)
  process.env.ENCRYPTION_KEY = "c".repeat(32)
  for (const p of collectProblems()) {
    assert.equal(p.includes("default_secret") && p.includes("="), false)
  }
})
