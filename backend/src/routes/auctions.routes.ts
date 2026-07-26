import { Router } from "express"
import { EventEmitter } from "node:events"
import db from "../lib/db"
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/authMiddleware"
import { logAudit } from "../lib/audit"
import { createActivityEvent } from "../lib/activity"
import { MARKET_CURRENCIES, creditSellerWithFees } from "../lib/market-fees"

/* ================================================================
   OSGARD · Аукционы артефактов (/auctions)
   ----------------------------------------------------------------
   Состязательный сбыт с реальным эскроу: ставка списывает средства
   покупателя в удержание сразу и мгновенно возвращает предыдущему
   лидеру. Победитель не может оказаться неплатёжеспособным на
   момент расчёта. Все денежные переходы — внутри BEGIN IMMEDIATE.

   GET /auctions/stream — SSE-поток живого списка (перебитые ставки,
   новые лоты, расчёт по истечении), взамен ручного обновления
   страницы. Паттерн повторяет routes/tcmarket.routes.ts (GET /stream):
   снапшот на каждое событие "update", без пер-лотового буфера — список
   активных аукционов сам по себе компактный снапшот.
   ================================================================ */

const router = Router()

const MIN_DURATION_H = 1
const MAX_DURATION_H = 168 /* 7 дней */

const auctionEvents = new EventEmitter()
auctionEvents.setMaxListeners(0)

type AuctionRow = {
  id: number
  artifact_id: number
  seller_id: number
  start_price: number
  min_increment: number
  currency: string
  current_bid: number | null
  current_bidder_id: number | null
  bid_count: number
  status: string
  starts_at: number
  ends_at: number
  settled_at: number | null
  winner_id: number | null
}

/** Минимально допустимая следующая ставка. */
function minNextBid(a: AuctionRow): number {
  return a.current_bid == null ? a.start_price : a.current_bid + a.min_increment
}

function serializeAuction(a: AuctionRow, extra?: Record<string, unknown>) {
  return {
    id: a.id,
    artifactId: a.artifact_id,
    sellerId: a.seller_id,
    startPrice: a.start_price,
    minIncrement: a.min_increment,
    currency: a.currency,
    currentBid: a.current_bid,
    currentBidderId: a.current_bidder_id,
    bidCount: a.bid_count,
    status: a.status,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    settledAt: a.settled_at,
    winnerId: a.winner_id,
    minNextBid: minNextBid(a),
    ...extra,
  }
}

/**
 * Завершает аукцион, у которого истекло окно, но статус ещё active.
 * Победитель (если ставки были) получает артефакт, продавец — выручку
 * за вычетом комиссии; удержанные средства лидера уже списаны при
 * ставке, поэтому здесь их повторно НЕ трогаем. Без ставок — возврат
 * артефакта продавцу. Идемпотентно: на уже завершённых ничего не делает.
 * Возвращает свежую строку аукциона.
 */
function settleIfEnded(auctionId: number): AuctionRow {
  const now = Date.now()
  const a = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(auctionId) as AuctionRow
  if (!a || a.status !== "active" || a.ends_at > now) return a

  const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(a.artifact_id)

  db.exec("BEGIN IMMEDIATE")
  try {
    /* Перечитываем внутри транзакции — защита от гонки двойного расчёта. */
    const fresh = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(auctionId) as AuctionRow
    if (!fresh || fresh.status !== "active" || fresh.ends_at > now) {
      db.exec("ROLLBACK")
      return fresh
    }

    if (fresh.current_bidder_id && fresh.current_bid != null) {
      /* Есть победитель: платим продавцу (эскроу уже удержан у победителя). */
      const { fee, sellerReceives } = creditSellerWithFees({
        sellerId: fresh.seller_id,
        price: fresh.current_bid,
        currency: fresh.currency,
        now,
      })

      db.prepare(`UPDATE artifacts SET owner_id = ?, status = 'kept' WHERE id = ?`).run(
        fresh.current_bidder_id,
        fresh.artifact_id,
      )

      db.prepare(
        `UPDATE auctions SET status = 'settled', settled_at = ?, winner_id = ? WHERE id = ?`,
      ).run(now, fresh.current_bidder_id, auctionId)

      if (artifact) {
        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'purchase', ?, ?, ?, ?, 'done')`,
        ).run(fresh.current_bidder_id, artifact.name, `Аукцион · продавец #${fresh.seller_id}`, fresh.current_bid, fresh.currency)
        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'sale', ?, ?, ?, ?, 'done')`,
        ).run(fresh.seller_id, artifact.name, `Аукцион · победитель #${fresh.current_bidder_id}`, sellerReceives, fresh.currency)
      }

      db.exec("COMMIT")

      logAudit(fresh.current_bidder_id, "debit", fresh.current_bid, "auction_win", { auctionId, artifactId: fresh.artifact_id, currency: fresh.currency })
      logAudit(fresh.seller_id, "credit", sellerReceives, "auction_sale", { auctionId, artifactId: fresh.artifact_id, currency: fresh.currency, fee })
      if (artifact) {
        createActivityEvent({
          userId: fresh.seller_id,
          type: "artifact_sold",
          entityType: "artifact",
          entityId: fresh.artifact_id,
          text: `продал артефакт «${artifact.name}» на аукционе`,
          metadata: { name: artifact.name, rarity: artifact.rarity, price: fresh.current_bid, currency: fresh.currency, auction: true },
        })
      }
    } else {
      /* Ставок не было — возвращаем артефакт продавцу. */
      db.prepare(`UPDATE artifacts SET status = 'kept' WHERE id = ?`).run(fresh.artifact_id)
      db.prepare(`UPDATE auctions SET status = 'expired', settled_at = ? WHERE id = ?`).run(now, auctionId)
      db.exec("COMMIT")
    }
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }

  auctionEvents.emit("update")
  return db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(auctionId) as AuctionRow
}

/** Активные аукционы (лениво закрыв истёкшие) для GET / и SSE-снапшота GET /stream. */
function listActiveAuctions(userId?: number) {
  const now = Date.now()

  const ended = db
    .prepare(`SELECT id FROM auctions WHERE status = 'active' AND ends_at <= ?`)
    .all(now) as { id: number }[]
  for (const e of ended) settleIfEnded(e.id)

  const rows = db
    .prepare(
      `SELECT a.*, ar.name as artifactName, ar.type as artifactType, ar.rarity, ar.level,
              ar.power, ar.defense, ar.magic, ar.speed,
              u.username as sellerUsername, u.display_name as sellerDisplayName
       FROM auctions a
       JOIN artifacts ar ON ar.id = a.artifact_id
       JOIN users u ON u.id = a.seller_id
       WHERE a.status = 'active' AND a.starts_at <= ? AND a.ends_at > ?
       ORDER BY a.ends_at ASC`,
    )
    .all(now, now) as (AuctionRow & Record<string, unknown>)[]

  const auctions = rows.map((r) =>
    serializeAuction(r, {
      artifact: {
        name: r.artifactName,
        type: r.artifactType,
        rarity: r.rarity,
        level: r.level,
        power: r.power,
        defense: r.defense,
        magic: r.magic,
        speed: r.speed,
      },
      seller: { username: r.sellerUsername, displayName: r.sellerDisplayName },
      isSeller: userId ? r.seller_id === userId : false,
      isTopBidder: userId ? r.current_bidder_id === userId : false,
    }),
  )

  return { auctions, serverTime: now }
}

/* ---------------- GET /auctions ----------------
   Активные аукционы. Перед выдачей лениво закрываем истёкшие. */
router.get("/", optionalAuth, (req: AuthRequest, res) => {
  res.json(listActiveAuctions(req.user?.userId))
})

/* ---------------- GET /auctions/stream ----------------
   SSE: снапшот активных аукционов, проталкивается заново при любом
   изменении (новая ставка, новый лот, расчёт). Публичный маршрут, как
   GET / — auctionEvents.emit("update") после create/bid/settle/cancel. */
router.get("/stream", optionalAuth, (req: AuthRequest, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  const userId = req.user?.userId
  const send = () => {
    res.write(`data: ${JSON.stringify({ type: "snapshot", ...listActiveAuctions(userId) })}\n\n`)
  }

  send()

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000)
  const cleanup = () => {
    clearInterval(heartbeat)
    auctionEvents.off("update", send)
  }
  auctionEvents.on("update", send)
  req.on("close", cleanup)
})

/* ---------------- GET /auctions/:id ----------------
   Детали одного аукциона + история ставок. */
router.get("/:id", optionalAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  settleIfEnded(id)

  const a = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(id) as AuctionRow | undefined
  if (!a) return res.status(404).json({ error: "Аукцион не найден" })

  const artifact = db
    .prepare(
      `SELECT id, name, type, rarity, level, power, defense, magic, speed FROM artifacts WHERE id = ?`,
    )
    .get(a.artifact_id)

  const bids = db
    .prepare(
      `SELECT b.amount, b.created_at as createdAt, u.username, u.display_name as displayName
       FROM auction_bids b JOIN users u ON u.id = b.bidder_id
       WHERE b.auction_id = ? ORDER BY b.created_at DESC LIMIT 30`,
    )
    .all(id)

  const userId = req.user?.userId
  res.json({
    auction: serializeAuction(a, {
      artifact,
      bids,
      isSeller: userId ? a.seller_id === userId : false,
      isTopBidder: userId ? a.current_bidder_id === userId : false,
    }),
    serverTime: Date.now(),
  })
})

/* ---------------- POST /auctions/create ----------------
   Выставить собственный артефакт на аукцион. */
router.post("/create", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { artifactId, startPrice, currency, durationHours, minIncrement } = req.body || {}

  const id = Number(artifactId)
  const start = Number(startPrice)
  const cur = currency || "credits"
  const hours = Number(durationHours) || 24
  const inc = minIncrement != null ? Number(minIncrement) : Math.max(1, Math.round(start * 0.05))

  if (!id) return res.status(400).json({ error: "Укажите artifactId" })
  if (!start || start <= 0) return res.status(400).json({ error: "Некорректная стартовая цена" })
  if (!MARKET_CURRENCIES.includes(cur)) return res.status(400).json({ error: "Некорректная валюта" })
  if (hours < MIN_DURATION_H || hours > MAX_DURATION_H) {
    return res.status(400).json({ error: `Длительность от ${MIN_DURATION_H} до ${MAX_DURATION_H} ч` })
  }
  if (inc <= 0) return res.status(400).json({ error: "Некорректный шаг ставки" })

  const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id)
  if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })
  if (artifact.owner_id !== userId) return res.status(403).json({ error: "Нет доступа к этому артефакту" })
  if (artifact.status === "listed") return res.status(400).json({ error: "Артефакт уже выставлен" })

  const now = Date.now()
  const endsAt = now + hours * 60 * 60 * 1000

  let auctionId = 0
  db.exec("BEGIN IMMEDIATE")
  try {
    /* Перепроверяем статус внутри транзакции. */
    const fresh: any = db.prepare(`SELECT owner_id, status FROM artifacts WHERE id = ?`).get(id)
    if (!fresh || fresh.owner_id !== userId || fresh.status === "listed") {
      db.exec("ROLLBACK")
      return res.status(400).json({ error: "Артефакт недоступен для выставления" })
    }
    db.prepare(`UPDATE artifacts SET status = 'listed' WHERE id = ?`).run(id)
    const info = db
      .prepare(
        `INSERT INTO auctions (artifact_id, seller_id, start_price, min_increment, currency,
                current_bid, current_bidder_id, bid_count, status, starts_at, ends_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, 'active', ?, ?, ?)`,
      )
      .run(id, userId, start, inc, cur, now, endsAt, now)
    auctionId = Number(info.lastInsertRowid)
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  auctionEvents.emit("update")

  const a = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(auctionId) as AuctionRow
  res.status(201).json({ auction: serializeAuction(a) })
})

/* ---------------- POST /auctions/:id/bid ----------------
   Поставить ставку: удержать средства, вернуть прежнему лидеру. */
router.post("/:id/bid", requireAuth, (req: AuthRequest, res) => {
  const auctionId = Number(req.params.id)
  const userId = req.user!.userId
  const amount = Number(req.body?.amount)
  const now = Date.now()

  const a = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(auctionId) as AuctionRow | undefined
  if (!a) return res.status(404).json({ error: "Аукцион не найден" })
  if (a.status !== "active") return res.status(400).json({ error: "Аукцион неактивен" })
  if (a.ends_at <= now) {
    settleIfEnded(auctionId)
    return res.status(400).json({ error: "Аукцион завершён", code: "AUCTION_ENDED" })
  }
  if (a.seller_id === userId) return res.status(400).json({ error: "Нельзя ставить на собственный лот" })
  if (a.current_bidder_id === userId) return res.status(400).json({ error: "Вы уже лидируете", code: "ALREADY_TOP" })

  const need = minNextBid(a)
  if (!amount || amount < need) {
    return res.status(400).json({ error: `Ставка должна быть не меньше ${need}`, code: "BID_TOO_LOW", minNextBid: need })
  }

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if ((wallet[a.currency] ?? 0) < amount) {
    logAudit(userId, "rejected", amount, "insufficient_balance", { action: "auction_bid", auctionId, currency: a.currency })
    return res.status(400).json({ error: `Недостаточно средств (${a.currency})` })
  }

  let refundedBidder: number | null = null
  let refundedAmount = 0
  db.exec("BEGIN IMMEDIATE")
  try {
    /* Перечитываем аукцион внутри транзакции — защита от гонки ставок. */
    const fresh = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(auctionId) as AuctionRow
    if (!fresh || fresh.status !== "active" || fresh.ends_at <= now) {
      db.exec("ROLLBACK")
      return res.status(400).json({ error: "Аукцион завершён", code: "AUCTION_ENDED" })
    }
    const needNow = minNextBid(fresh)
    if (amount < needNow) {
      db.exec("ROLLBACK")
      return res.status(400).json({ error: `Ставку перебили, минимум ${needNow}`, code: "BID_TOO_LOW", minNextBid: needNow })
    }

    /* Возвращаем удержание предыдущему лидеру. */
    if (fresh.current_bidder_id && fresh.current_bid != null) {
      db.prepare(`UPDATE wallets SET ${fresh.currency} = ${fresh.currency} + ?, updated_at = ? WHERE user_id = ?`).run(
        fresh.current_bid,
        now,
        fresh.current_bidder_id,
      )
      refundedBidder = fresh.current_bidder_id
      refundedAmount = fresh.current_bid
    }

    /* Удерживаем средства нового лидера. */
    db.prepare(`UPDATE wallets SET ${fresh.currency} = ${fresh.currency} - ?, updated_at = ? WHERE user_id = ?`).run(
      amount,
      now,
      userId,
    )

    db.prepare(
      `UPDATE auctions SET current_bid = ?, current_bidder_id = ?, bid_count = bid_count + 1 WHERE id = ?`,
    ).run(amount, userId, auctionId)

    db.prepare(
      `INSERT INTO auction_bids (auction_id, bidder_id, amount, created_at) VALUES (?, ?, ?, ?)`,
    ).run(auctionId, userId, amount, now)

    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  auctionEvents.emit("update")

  logAudit(userId, "debit", amount, "auction_bid_hold", { auctionId, currency: a.currency })
  if (refundedBidder) {
    logAudit(refundedBidder, "credit", refundedAmount, "auction_outbid_refund", { auctionId, currency: a.currency })
  }

  const updated = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(auctionId) as AuctionRow
  const wallet2 = db
    .prepare(`SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`)
    .get(userId)
  res.status(201).json({ auction: serializeAuction(updated, { isTopBidder: true }), wallet: wallet2 })
})

/* ---------------- POST /auctions/:id/settle ----------------
   Явно инициировать расчёт истёкшего аукциона (идемпотентно). */
router.post("/:id/settle", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const a = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(id) as AuctionRow | undefined
  if (!a) return res.status(404).json({ error: "Аукцион не найден" })
  if (a.status !== "active") return res.json({ auction: serializeAuction(a) })
  if (a.ends_at > Date.now()) return res.status(400).json({ error: "Аукцион ещё идёт", code: "NOT_ENDED" })

  const settled = settleIfEnded(id)
  res.json({ auction: serializeAuction(settled) })
})

/* ---------------- POST /auctions/:id/cancel ----------------
   Отменить собственный аукцион — только пока не было ни одной ставки. */
router.post("/:id/cancel", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const userId = req.user!.userId
  const a = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(id) as AuctionRow | undefined
  if (!a) return res.status(404).json({ error: "Аукцион не найден" })
  if (a.seller_id !== userId) return res.status(403).json({ error: "Это не ваш аукцион" })
  if (a.status !== "active") return res.status(400).json({ error: "Аукцион уже завершён" })
  if (a.bid_count > 0) return res.status(400).json({ error: "Нельзя отменить аукцион со ставками", code: "HAS_BIDS" })

  const now = Date.now()
  db.exec("BEGIN IMMEDIATE")
  try {
    const fresh = db.prepare(`SELECT bid_count, status FROM auctions WHERE id = ?`).get(id) as
      | { bid_count: number; status: string }
      | undefined
    if (!fresh || fresh.status !== "active" || fresh.bid_count > 0) {
      db.exec("ROLLBACK")
      return res.status(400).json({ error: "Аукцион недоступен для отмены" })
    }
    db.prepare(`UPDATE artifacts SET status = 'kept' WHERE id = ?`).run(a.artifact_id)
    db.prepare(`UPDATE auctions SET status = 'cancelled', settled_at = ? WHERE id = ?`).run(now, id)
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  auctionEvents.emit("update")

  const updated = db.prepare(`SELECT * FROM auctions WHERE id = ?`).get(id) as AuctionRow
  res.json({ auction: serializeAuction(updated) })
})

export default router
