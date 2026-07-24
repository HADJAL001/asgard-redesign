// Форсируем in-memory-путь (без Redis) ДО импорта модуля — детерминизм теста.
process.env.REDIS_URL = ""

import { test } from "node:test"
import assert from "node:assert/strict"
import { recordOffense, isBlocked, honeypotHandler, HONEYPOT_PATHS } from "../middleware/threat-defense"

/* ================================================================
   OSGARD · Юнит-тест: активная кибероборона (threat-defense)
   ----------------------------------------------------------------
   Проверяем скоринг → авто-блокировку на in-memory хранилище.
   Уникальные IP на каждый кейс, чтобы состояние не перетекало.
   ================================================================ */

test("свежий IP не заблокирован", async () => {
  assert.equal(await isBlocked("198.51.100.1"), false)
})

test("попадание в honeypot (вес 10) мгновенно блокирует IP", async () => {
  const ip = "198.51.100.2"
  await recordOffense(ip, "honeypot:/.env", 10)
  assert.equal(await isBlocked(ip), true)
})

test("накопление ниже порога не блокирует, пересечение — блокирует", async () => {
  const ip = "198.51.100.3"
  for (let i = 0; i < 9; i++) await recordOffense(ip, "probe", 1)
  assert.equal(await isBlocked(ip), false)
  await recordOffense(ip, "probe", 1) // 10-е очко — порог достигнут
  assert.equal(await isBlocked(ip), true)
})

test("recordOffense игнорирует null IP без ошибок", async () => {
  await recordOffense(null, "noop", 10)
  // Просто не должно бросить исключение.
  assert.ok(true)
})

test("honeypotHandler отвечает нейтральным 404", () => {
  // recordOffense внутри — fire-and-forget void, на проверку ответа не влияет.
  let statusCode = 0
  let body: any = null
  const res: any = {
    status(c: number) {
      statusCode = c
      return this
    },
    json(b: any) {
      body = b
      return this
    },
  }
  honeypotHandler({ path: "/.env", headers: {}, socket: {} } as any, res)
  assert.equal(statusCode, 404)
  assert.deepEqual(body, { error: "Not found" })
})

test("список honeypot-путей включает типовые цели сканеров", () => {
  assert.ok(HONEYPOT_PATHS.includes("/.env"))
  assert.ok(HONEYPOT_PATHS.includes("/wp-login.php"))
  assert.ok(HONEYPOT_PATHS.length >= 8)
})
