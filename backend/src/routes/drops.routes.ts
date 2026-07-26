import { Router } from "express"
import db from "../lib/db"
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/authMiddleware"
import { logAudit } from "../lib/audit"
import { createActivityEvent } from "../lib/activity"
import { runEconomyOp, EconomyError, normalizeIdemKey } from "../lib/economy-tx"

/* ================================================================
   OSGARD · Сезонные дропы маркетплейса (/drops)
   ----------------------------------------------------------------
   Лимитированные по времени и тиражу предложения. Клейм честный:
   тираж и окно проверяются внутри транзакции BEGIN IMMEDIATE,
   повторный клейм отсекается UNIQUE(drop_id, user_id).
   ================================================================ */

const router = Router()

const CURRENCIES = ["credits", "shards", "crystals", "timecoin", "cash_usd"]
const LIST_CURRENCY_BY_RARITY: Record<string, string> = {
  common: "credits",
  rare: "shards",
  epic: "shards",
  legendary: "crystals",
  mythic: "timecoin",
}

type DropRow = {
  id: number
  season: string
  title: string
  description: string
  artifact_name: string
  type: string
  rarity: string
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  price: number
  currency: string
  total_supply: number
  claimed: number
  per_user_limit: number
  starts_at: number
  ends_at: number
  status: string
}

function serializeDrop(d: DropRow, claimedByMe: boolean) {
  const remaining = Math.max(0, d.total_supply - d.claimed)
  return {
    id: d.id,
    season: d.season,
    title: d.title,
    description: d.description,
    artifactName: d.artifact_name,
    type: d.type,
    rarity: d.rarity,
    level: d.level,
    power: d.power,
    defense: d.defense,
    magic: d.magic,
    speed: d.speed,
    price: d.price,
    currency: d.currency,
    totalSupply: d.total_supply,
    claimed: d.claimed,
    remaining,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    claimedByMe,
    soldOut: remaining <= 0,
  }
}

/* ---------------- GET /drops ----------------
   Активные дропы (в окне, статус active). Публичный — гость видит витрину,
   claimedByMe считается только для авторизованных. */
router.get("/", optionalAuth, (req: AuthRequest, res) => {
  const now = Date.now()
  const rows = db
    .prepare(
      `SELECT * FROM market_drops
       WHERE status = 'active' AND starts_at <= ? AND ends_at > ?
       ORDER BY ends_at ASC`,
    )
    .all(now, now) as DropRow[]

  const userId = req.user?.userId
  const claimedIds = new Set<number>()
  if (userId && rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const placeholders = ids.map(() => "?").join(",")
    const claims = db
      .prepare(`SELECT drop_id FROM market_drop_claims WHERE user_id = ? AND drop_id IN (${placeholders})`)
      .all(userId, ...ids) as { drop_id: number }[]
    for (const c of claims) claimedIds.add(c.drop_id)
  }

  res.json({ drops: rows.map((d) => serializeDrop(d, claimedIds.has(d.id))), serverTime: now })
})

/* ---------------- POST /drops/:id/claim ----------------
   Забрать дроп: списать цену, сминтить артефакт, увеличить тираж. */
router.post("/:id/claim", requireAuth, (req: AuthRequest, res) => {
  const dropId = Number(req.params.id)
  const userId = req.user!.userId
  const now = Date.now()

  const drop = db.prepare(`SELECT * FROM market_drops WHERE id = ?`).get(dropId) as DropRow | undefined
  if (!drop) return res.status(404).json({ error: "Дроп не найден" })
  if (drop.status !== "active") return res.status(400).json({ error: "Дроп неактивен" })
  if (drop.starts_at > now) return res.status(400).json({ error: "Дроп ещё не начался" })
  if (drop.ends_at <= now) return res.status(400).json({ error: "Дроп завершён", code: "DROP_ENDED" })
  if (!CURRENCIES.includes(drop.currency)) return res.status(400).json({ error: "Некорректная валюта дропа" })

  const already = db
    .prepare(`SELECT 1 FROM market_drop_claims WHERE drop_id = ? AND user_id = ?`)
    .get(dropId, userId)
  if (already) return res.status(400).json({ error: "Вы уже забрали этот дроп", code: "ALREADY_CLAIMED" })

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if ((wallet[drop.currency] ?? 0) < drop.price) {
    logAudit(userId, "rejected", drop.price, "insufficient_balance", { action: "drop_claim", dropId })
    return res.status(400).json({ error: `Недостаточно средств (${drop.currency})` })
  }

  const listCurrency = LIST_CURRENCY_BY_RARITY[drop.rarity] || "credits"
  const idemKey = normalizeIdemKey(req.header("Idempotency-Key") ?? (req.body as any)?.idempotencyKey)
  let artifactId = 0

  try {
    const opResult = runEconomyOp({
      userId,
      scope: "drop_claim",
      idemKey,
      mutate: () => {
        /* Тираж и повторный клейм проверяем ВНУТРИ транзакции — защита от гонки при sold-out. */
        const fresh = db.prepare(`SELECT claimed, total_supply FROM market_drops WHERE id = ?`).get(dropId) as
          | { claimed: number; total_supply: number }
          | undefined
        if (!fresh || fresh.claimed >= fresh.total_supply) {
          throw new EconomyError("Тираж дропа исчерпан", 400, { code: "SOLD_OUT" })
        }
        const alreadyInner = db
          .prepare(`SELECT 1 FROM market_drop_claims WHERE drop_id = ? AND user_id = ?`)
          .get(dropId, userId)
        if (alreadyInner) {
          throw new EconomyError("Вы уже забрали этот дроп", 400, { code: "ALREADY_CLAIMED" })
        }

        const debit = db
          .prepare(`UPDATE wallets SET ${drop.currency} = ${drop.currency} - ?, updated_at = ? WHERE user_id = ? AND ${drop.currency} >= ?`)
          .run(drop.price, now, userId, drop.price)
        if (debit.changes !== 1) {
          throw new EconomyError(`Недостаточно средств (${drop.currency})`, 400)
        }

        const info = db
          .prepare(
            `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed,
                    status, views_24h, supply, price, list_currency)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'kept', 0, 1, ?, ?)`,
          )
          .run(
            userId,
            drop.artifact_name,
            drop.type,
            drop.rarity,
            drop.level,
            drop.power,
            drop.defense,
            drop.magic,
            drop.speed,
            drop.price,
            listCurrency,
          )
        artifactId = Number(info.lastInsertRowid)

        db.prepare(`UPDATE market_drops SET claimed = claimed + 1 WHERE id = ?`).run(dropId)
        db.prepare(
          `INSERT INTO market_drop_claims (drop_id, user_id, artifact_id, claimed_at) VALUES (?, ?, ?, ?)`,
        ).run(dropId, userId, artifactId, now)

        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'drop_claim', ?, ?, ?, ?, 'done')`,
        ).run(userId, drop.artifact_name, `Сезон «${drop.season}»`, drop.price, drop.currency)

        const artifact = db
          .prepare(
            `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
                    status, views_24h as views24h, supply, price, list_currency as listCurrency, created_at as createdAt
             FROM artifacts WHERE id = ?`,
          )
          .get(artifactId)

        const updatedWallet = db
          .prepare(`SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`)
          .get(userId)

        const updatedDrop = db.prepare(`SELECT * FROM market_drops WHERE id = ?`).get(dropId) as DropRow

        return { artifact, wallet: updatedWallet, drop: serializeDrop(updatedDrop, true) }
      },
    })

    if (!opResult.replayed) {
      logAudit(userId, "debit", drop.price, "drop_claim", { dropId, artifactId, currency: drop.currency })
      createActivityEvent({
        userId,
        type: "drop_claimed",
        entityType: "artifact",
        entityId: artifactId,
        text: `забрал сезонный дроп «${drop.artifact_name}»`,
        metadata: { name: drop.artifact_name, rarity: drop.rarity, season: drop.season },
      })
    }

    return res.status(201).json(opResult.result)
  } catch (err) {
    if (err instanceof EconomyError) {
      const body: Record<string, unknown> = { error: err.message }
      if (err.payload && typeof err.payload === "object") Object.assign(body, err.payload)
      return res.status(err.status).json(body)
    }
    throw err
  }
})

export default router
