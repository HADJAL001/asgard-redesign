import { Router } from "express"
import {
  listPublicRegistry,
  countPublicRegistry,
  getCertificateBySerial,
  serializePublicCertificate,
  holderNameOf,
} from "../lib/certificate"

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
router.get("/", (req, res) => {
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
router.get("/:serial", (req, res) => {
  const serial = String(req.params.serial || "").trim().toUpperCase()
  if (!serial) {
    return res.status(400).json({ found: false, error: "Пустой serial" })
  }

  const row = getCertificateBySerial(serial)
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

export default router
