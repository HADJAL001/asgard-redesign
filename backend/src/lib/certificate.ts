import crypto from "crypto"
import db from "./db"
import type { AcademyTier } from "./academy"
import { computeEligibility, type EligibilityResult } from "./certification"

/* ================================================================
   OSGARD · Academy — Credential «OSGARD Certified Vibecoder»
   ----------------------------------------------------------------
   Инкапсуляция всей логики сертификата: генерация публичного serial,
   выпуск (issue), отзыв (revoke), верификация по serial, публичный
   реестр. Модель — как выданный/отзываемый ключ (api-keys.ts), но
   без секрета: serial ПУБЛИЧЕН (его и проверяют), скрывать нечего.

   Таблица academy_certificates (миграция 084). Один активный credential
   на пользователя гарантируется partial-unique индексом; повторная
   выдача после отзыва разрешена.

   snapshot_json замораживает craft/тир/проекты на момент выдачи —
   печать сертификата остаётся честной и стабильной во времени.
   ================================================================ */

export type CertificateStatus = "issued" | "revoked"

export type CertificateRow = {
  id: number
  user_id: number
  serial: string
  tier: AcademyTier
  status: CertificateStatus
  snapshot_json: string
  issued_at: number
  revoked_at: number | null
  revoked_by: number | null
  revoke_reason: string | null
  created_at: number
}

/** Замороженный на момент выдачи снимок достижений (для честной печати). */
export type CertificateSnapshot = {
  tier: AcademyTier
  holderName: string
  metCount: number
  totalCount: number
  criteria: EligibilityResult["criteria"]
}

/* --- Crockford base32 (без I/L/O/U — не путаются визуально) для serial --- */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function base32Group(bytes: Buffer): string {
  let out = ""
  for (const b of bytes) out += CROCKFORD[b % 32]
  return out
}

/** Публичный serial вида OSGARD-VC-XXXX-XXXX-XXXX (14 значащих символов). */
function makeSerialCandidate(): string {
  const raw = crypto.randomBytes(12)
  const g1 = base32Group(raw.subarray(0, 4))
  const g2 = base32Group(raw.subarray(4, 8))
  const g3 = base32Group(raw.subarray(8, 12))
  return `OSGARD-VC-${g1}-${g2}-${g3}`
}

/** Генерирует serial, гарантированно отсутствующий в таблице (retry на коллизии). */
export function generateSerial(): string {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = makeSerialCandidate()
    const existing = db
      .prepare(`SELECT 1 FROM academy_certificates WHERE serial = ?`)
      .get(candidate)
    if (!existing) return candidate
  }
  // Практически недостижимо (32^12 пространство). Финальный запас — с временной солью.
  return `OSGARD-VC-${base32Group(crypto.randomBytes(4))}-${base32Group(crypto.randomBytes(4))}-${base32Group(
    crypto.randomBytes(4),
  )}`
}

export function getActiveCertificate(userId: number): CertificateRow | undefined {
  return db
    .prepare(`SELECT * FROM academy_certificates WHERE user_id = ? AND status = 'issued'`)
    .get(userId) as CertificateRow | undefined
}

export function getCertificateById(id: number): CertificateRow | undefined {
  return db.prepare(`SELECT * FROM academy_certificates WHERE id = ?`).get(id) as CertificateRow | undefined
}

export function getCertificateBySerial(serial: string): CertificateRow | undefined {
  return db
    .prepare(`SELECT * FROM academy_certificates WHERE serial = ?`)
    .get(serial) as CertificateRow | undefined
}

/**
 * Выпускает новый credential пользователю. Вызывающая сторона ОБЯЗАНА заранее
 * проверить двойной guard (активная запись в программе + eligibility) — здесь
 * фиксируется снимок и делается INSERT. Возвращает готовую строку.
 *
 * `tier` — тир записи в программе (для «Circle»-печати на credential).
 * Идемпотентность на уровне БД: partial-unique index не даст второй активный.
 */
export function issueCertificate(userId: number, tier: AcademyTier, holderName: string): CertificateRow {
  const eligibility = computeEligibility(userId)
  const snapshot: CertificateSnapshot = {
    tier,
    holderName,
    metCount: eligibility.metCount,
    totalCount: eligibility.totalCount,
    criteria: eligibility.criteria,
  }
  const serial = generateSerial()
  const now = Date.now()

  const info = db
    .prepare(
      `INSERT INTO academy_certificates (user_id, serial, tier, status, snapshot_json, issued_at, created_at)
       VALUES (?, ?, ?, 'issued', ?, ?, ?)`,
    )
    .run(userId, serial, tier, JSON.stringify(snapshot), now, now)

  return getCertificateById(Number(info.lastInsertRowid))!
}

/** Отзыв credential (админ). Идемпотентно: повторный отзыв — no-op, возвращает строку. */
export function revokeCertificate(id: number, adminId: number, reason?: string): CertificateRow | undefined {
  const row = getCertificateById(id)
  if (!row) return undefined
  if (row.status === "revoked") return row
  db.prepare(
    `UPDATE academy_certificates SET status = 'revoked', revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?`,
  ).run(Date.now(), adminId, reason ?? null, id)
  return getCertificateById(id)
}

function parseSnapshot(row: CertificateRow): CertificateSnapshot | null {
  try {
    return JSON.parse(row.snapshot_json) as CertificateSnapshot
  } catch {
    return null
  }
}

/** Приватная сериализация (владельцу/админу — с полным снимком). */
export function serializeCertificate(row: CertificateRow, holderName?: string) {
  const snap = parseSnapshot(row)
  return {
    id: row.id,
    serial: row.serial,
    tier: row.tier,
    status: row.status,
    holderName: holderName ?? snap?.holderName ?? null,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    snapshot: snap,
  }
}

/** Публичная сериализация (реестр/верификация — БЕЗ PII сверх display-имени). */
export function serializePublicCertificate(row: CertificateRow, holderName: string) {
  return {
    serial: row.serial,
    tier: row.tier,
    status: row.status,
    holderName,
    issuedAt: row.issued_at,
    revokedAt: row.status === "revoked" ? row.revoked_at : null,
  }
}

export type PublicCertificate = ReturnType<typeof serializePublicCertificate>

/**
 * Публичный реестр действительных credential (только issued), новейшие сверху.
 * Джойн на users ради display-имени (username). Без PII сверх имени/serial/тира/дат.
 */
export function listPublicRegistry(limit = 100, offset = 0): PublicCertificate[] {
  const rows = db
    .prepare(
      `SELECT c.*, u.username AS holder_name
       FROM academy_certificates c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = 'issued'
       ORDER BY c.issued_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as Array<CertificateRow & { holder_name: string }>
  return rows.map((r) => serializePublicCertificate(r, r.holder_name))
}

export function countPublicRegistry(): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM academy_certificates WHERE status = 'issued'`)
    .get() as { n: number }
  return row?.n ?? 0
}

/** Имя владельца по user_id (username — гарантированная публичная колонка). */
export function holderNameOf(userId: number): string {
  const row = db.prepare(`SELECT username FROM users WHERE id = ?`).get(userId) as
    | { username: string }
    | undefined
  return row?.username ?? "Vibecoder"
}
