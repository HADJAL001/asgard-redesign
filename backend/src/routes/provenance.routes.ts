import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

/* ================================================================
   OSGARD · Провенанс и «Хранилище» — витрина доверия (read-only)
   ----------------------------------------------------------------
   Премиум = доверие. Защита на бэке РЕАЛЬНАЯ (threat-defense,
   write-backpressure, audit_log, AES-шифрование 2FA-секретов), но
   пользователь её не видит. Здесь — честная поверхность НАД уже
   существующими данными, без «security theatre» и без выдуманных
   цифр: если истории нет — так и говорим.

   Строим ПОВЕРХ слоя авторства из миграции 080 (`artifacts.creator_id`,
   Claude A / #52): происхождение честно показывает первого кузнеца.
   Ничего не пишем и не мигрируем — только читаем activity_events,
   artifacts, users, audit_log.
   ================================================================ */

const router = Router()

/** Нормализует любой timestamp к ISO-8601 (UTC).
 *  В БД разнобой: artifacts.created_at / marketplace.*_at — миллисекунды (INTEGER),
 *  activity_events.created_at — строка SQLite datetime ("YYYY-MM-DD HH:MM:SS", UTC). */
function toIso(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return Number.isFinite(v) ? new Date(v).toISOString() : null
  const s = String(v).trim()
  if (s === "") return null
  if (/^\d+$/.test(s)) return new Date(Number(s)).toISOString()
  // SQLite CURRENT_TIMESTAMP — UTC без таймзоны; помечаем как Z, чтобы фронт не сдвинул.
  return s.includes("T") ? s : s.replace(" ", "T") + "Z"
}

type ArtifactRow = {
  id: number
  name: string
  type: string
  rarity: string
  level: number
  source: string | null
  project_id: number | null
  owner_id: number
  creator_id: number | null
  created_at: number | string | null
  project_name: string | null
  creator_username: string | null
  creator_display_name: string | null
}

type EventRow = {
  id: number
  type: string
  text: string
  metadata: string | null
  created_at: string | number | null
  username: string
  display_name: string | null
}

/* ---------------- GET /provenance/artifact/:id ----------------
   Реальный леджер жизни артефакта поверх activity_events (канонический
   лог платформы — тот же, что питает глобальную ленту). Только владелец;
   чужой/несуществующий → 404 (не раскрываем существование чужих артефактов). */
router.get("/artifact/:id", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Некорректный идентификатор артефакта" })
  }

  const row = db
    .prepare(
      `SELECT a.id, a.name, a.type, a.rarity, a.level, a.source,
              a.project_id, a.owner_id, a.creator_id, a.created_at,
              p.name AS project_name,
              cu.username AS creator_username, cu.display_name AS creator_display_name
       FROM artifacts a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN users cu ON cu.id = a.creator_id
       WHERE a.id = ?`,
    )
    .get(id) as ArtifactRow | undefined

  // 404 и для отсутствующего, и для чужого — чтобы не подтверждать существование чужого артефакта.
  if (!row || row.owner_id !== req.user!.userId) {
    return res.status(404).json({ error: "Артефакт не найден" })
  }

  const createdByYou = row.creator_id != null && row.creator_id === row.owner_id

  const origin = {
    at: toIso(row.created_at),
    source: row.source || "forge",
    projectId: row.project_id,
    projectName: row.project_name,
    creator: row.creator_id
      ? { name: row.creator_display_name || row.creator_username || "Архитектор", isYou: createdByYou }
      : null, // creator_id может быть NULL у исторически торгованных артефактов (честно — «неизвестен»)
  }

  const eventRows = db
    .prepare(
      `SELECT e.id, e.type, e.text, e.metadata, e.created_at,
              u.username, u.display_name
       FROM activity_events e
       JOIN users u ON u.id = e.user_id
       WHERE e.entity_type = 'artifact' AND e.entity_id = ?
       ORDER BY e.created_at ASC, e.id ASC`,
    )
    .all(id) as EventRow[]

  const ledger = eventRows.map((e) => {
    let meta: Record<string, unknown> | null = null
    if (e.metadata) {
      try {
        meta = JSON.parse(e.metadata)
      } catch {
        meta = null
      }
    }
    return {
      kind: e.type,
      at: toIso(e.created_at),
      text: e.text,
      actor: e.display_name || e.username,
      meta,
    }
  })

  res.json({
    success: true,
    artifact: {
      id: row.id,
      name: row.name,
      type: row.type,
      rarity: row.rarity,
      level: row.level,
    },
    origin,
    ledger, // может быть пустым — честно, без синтетических записей
  })
})

/* ---------------- GET /provenance/vault ----------------
   Сводка «состояние вашей вселенной»: сколько артефактов, сколько выковано
   лично (creator_id === owner, из #52), честный статус шифрования/2FA и
   последние СОБСТВЕННЫЕ события пользователя. Никаких выдуманных цифр:
   пусто → пусто. */
router.get("/vault", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM artifacts WHERE owner_id = ?`).get(userId) as { n: number }
  ).n

  const createdByYou = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM artifacts WHERE owner_id = ? AND creator_id = ?`)
      .get(userId, userId) as { n: number }
  ).n

  const rarityRows = db
    .prepare(
      `SELECT rarity, COUNT(*) AS n FROM artifacts WHERE owner_id = ? GROUP BY rarity`,
    )
    .all(userId) as Array<{ rarity: string; n: number }>
  const byRarity: Record<string, number> = {}
  for (const r of rarityRows) byRarity[r.rarity] = r.n

  // Реальный статус безопасности — не декорация.
  const twofa = db.prepare(`SELECT twofa_enabled FROM users WHERE id = ?`).get(userId) as
    | { twofa_enabled: number | null }
    | undefined
  const security = {
    twoFactorEnabled: !!(twofa && twofa.twofa_enabled),
    // Дефолтный ключ из кода = «не сконфигурирован». На проде задаётся в Railway → Variables.
    encryptionConfigured: !!process.env.ENCRYPTION_KEY,
    encryptionAlgorithm: "AES-256",
    protects: ["2FA-секреты"] as string[],
  }

  // Последние СОБСТВЕННЫЕ события пользователя (его действия), из того же канонического лога.
  const recentRows = db
    .prepare(
      `SELECT e.id, e.type, e.text, e.created_at
       FROM activity_events e
       WHERE e.user_id = ?
       ORDER BY e.id DESC
       LIMIT 12`,
    )
    .all(userId) as Array<{ id: number; type: string; text: string; created_at: string | number | null }>
  const recent = recentRows.map((e) => ({
    kind: e.type,
    text: e.text,
    at: toIso(e.created_at),
  }))

  res.json({
    success: true,
    vault: {
      artifacts: { total, createdByYou, byRarity },
      security,
      recent, // честный пустой массив, если событий ещё нет
      at: new Date().toISOString(),
    },
  })
})

export default router
