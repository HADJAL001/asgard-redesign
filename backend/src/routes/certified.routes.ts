import crypto from "crypto"
import { Router } from "express"
import {
  listPublicRegistry,
  countPublicRegistry,
  getCertificateBySerial,
  serializePublicCertificate,
  holderNameOf,
} from "../lib/certificate"
import { renderBadgeSvg, type BadgeStatus } from "../lib/certificate-badge"
import { rateLimit } from "../middleware/rateLimiter"
import { track } from "../lib/analytics"

/* ================================================================
   OSGARD · Публичный реестр «OSGARD Certified Vibecoder»  (/certified)
   ----------------------------------------------------------------
   Верифицируемость credential = публичность. Любой (без авторизации)
   может:
     • GET /certified          — реестр действительных сертификатов
     • GET /certified/:serial  — проверить один serial (действителен/
                                 отозван/не найден)

   Отдаём ТОЛЬКО публично-безопасные поля (display-имя, serial, тир,
   даты, статус) — никакого PII сверх имени. Реестр показывает лишь
   действительные (issued); верификация по serial честно раскрывает
   и отозванные (в этом и смысл проверки — узнать, что отозван).

   Монтируется ОТДЕЛЬНО на /certified (не под /academy), т.к. публичный
   и без requireAuth. Только чтение.
   ================================================================ */

const router = Router()

/* ================================================================
   GET /certified          — публичный реестр (только действительные)
   query: ?limit=&offset=  (limit 1..100, по умолчанию 60)
   ================================================================ */
router.get("/", rateLimit(60_000, 60), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60))
  const offset = Math.max(0, Number(req.query.offset) || 0)

  const certificates = listPublicRegistry(limit, offset)
  const total = countPublicRegistry()

  res.json({ certificates, total, limit, offset })
})

/* ================================================================
   GET /certified/:serial  — верификация одного credential
   Возвращает { found, certificate }. Для отозванного found=true,
   certificate.status='revoked' — верификатор узнаёт правду.
   ================================================================ */
router.get("/:serial", rateLimit(60_000, 60), (req, res) => {
  const serial = String(req.params.serial || "").trim().toUpperCase()
  res.set("Cache-Control", "no-store")

  if (!serial) {
    return res.status(400).json({ found: false, error: "Пустой serial" })
  }

  const row = getCertificateBySerial(serial)
  track("certificate_verify_view", { meta: { serial, found: !!row, status: row?.status ?? null } })

  if (!row) {
    return res.status(404).json({
      found: false,
      serial,
      message: "Такой credential не найден в реестре OSGARD.",
    })
  }

  res.json({
    found: true,
    certificate: serializePublicCertificate(row, holderNameOf(row.user_id)),
  })
})

/* ================================================================
   GET /certified/:serial/badge.svg  — embeddable-бейдж credential
   Всегда 200 (даже для несуществующего/отозванного serial) — битая
   иконка <img> в README хуже, чем честный нейтральный бейдж.
   Короткий TTL (60с) — чтобы revoke долетал до встроенных бейджей
   быстро; сам бейдж — витрина, доказательство даёт живой /certified/:serial.
   ================================================================ */
router.get("/:serial/badge.svg", rateLimit(60_000, 60), (req, res) => {
  const serial = String(req.params.serial || "").trim().toUpperCase()
  const row = serial ? getCertificateBySerial(serial) : undefined

  const status: BadgeStatus = !row ? "not-found" : row.status === "revoked" ? "revoked" : "issued"

  const etag = `"${crypto
    .createHash("sha256")
    .update(`${serial}:${status}:${row?.revoked_at ?? ""}`)
    .digest("hex")
    .slice(0, 16)}"`

  track("certificate_badge_view", { meta: { serial, status } })

  res.set({
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=60, must-revalidate",
    ETag: etag,
  })

  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end()
  }

  res.send(renderBadgeSvg(status, row?.tier ?? null))
})

export default router
