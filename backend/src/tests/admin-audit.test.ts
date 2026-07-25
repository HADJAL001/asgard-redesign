import { test } from "node:test"
import assert from "node:assert/strict"
import type { Request } from "express"
import { getClientIp, getUserAgent } from "../lib/admin-audit"

/* ================================================================
   OSGARD · Юнит-тест: извлечение источника для аудита админ-действий
   ----------------------------------------------------------------
   Приложение стоит за прокси (Railway), поэтому реальный клиентский IP —
   левый адрес в X-Forwarded-For, а не req.ip (адрес прокси).
   ================================================================ */

function mockReq(headers: Record<string, any>, ip?: string): Request {
  return { headers, ip, socket: { remoteAddress: "10.0.0.1" } } as unknown as Request
}

test("getClientIp берёт первый адрес из X-Forwarded-For", () => {
  const req = mockReq({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }, "10.0.0.99")
  assert.equal(getClientIp(req), "203.0.113.7")
})

test("getClientIp обрабатывает XFF-заголовок в виде массива", () => {
  const req = mockReq({ "x-forwarded-for": ["203.0.113.7, 70.41.3.18"] }, "10.0.0.99")
  assert.equal(getClientIp(req), "203.0.113.7")
})

test("getClientIp падает обратно на req.ip без XFF", () => {
  const req = mockReq({}, "198.51.100.23")
  assert.equal(getClientIp(req), "198.51.100.23")
})

test("getClientIp падает на socket.remoteAddress без req.ip и XFF", () => {
  const req = mockReq({})
  assert.equal(getClientIp(req), "10.0.0.1")
})

test("getUserAgent возвращает строку и обрезает слишком длинную", () => {
  assert.equal(getUserAgent(mockReq({ "user-agent": "Mozilla/5.0" })), "Mozilla/5.0")
  const long = "x".repeat(1000)
  assert.equal(getUserAgent(mockReq({ "user-agent": long }))!.length, 500)
  assert.equal(getUserAgent(mockReq({})), null)
})
