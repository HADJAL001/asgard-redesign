import { test } from "node:test"
import assert from "node:assert/strict"
import type { Request } from "express"
import { getClientIp } from "../lib/admin-audit"

function request(forwarded: string | string[] | undefined, ip = "198.51.100.23"): Request {
  return {
    headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded },
    ip,
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as Request
}

test("client IP uses the first normalized forwarded address", () => {
  assert.equal(getClientIp(request(" 203.0.113.7\t\r\n, 70.41.3.18")), "203.0.113.7")
  assert.equal(getClientIp(request(["203.0.113.8, 70.41.3.18"])), "203.0.113.8")
})

test("client IP falls back when forwarded value is blank", () => {
  assert.equal(getClientIp(request("   ")), "198.51.100.23")
})

test("client IP bounds untrusted forwarded keys", () => {
  assert.equal(getClientIp(request("x".repeat(100)))?.length, 64)
})
