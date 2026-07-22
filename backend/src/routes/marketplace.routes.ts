import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { logAudit } from "../lib/audit"

const router = Router()

const CURRENCIES = ["credits", "shards", "crystals", "timecoin", "cash_usd"]
const MARKET_FEE = 0.05 /* комиссия маркетплейса при продаже, 5% с продавца */

/* ---------------- GET /marketplace/listings ---------------- */
router.get("/listings", (_req, res) => {
  const listings = db
    .prepare(
      `SELECT
         l.id, l.artifact_id as artifactId, l.seller_id as sellerId, l.price, l.currency,
         l.status, l.listed_at as listedAt,
         a.name as artifactName, a.type as artifactType, a.rarity, a.level, a.power, a.defense, a.magic, a.speed,
         u.username as sellerUsername, u.display_name as sellerDisplayName
       FROM marketplace_listings l
       JOIN artifacts a ON a.id = l.artifact_id
       JOIN users u ON u.id = l.seller_id
       WHERE l.status = 'active'
       ORDER BY l.listed_at DESC`,
    )
    .all()

  res.json({ listings })
})

/* ---------------- POST /marketplace/list ---------------- */
router.post("/list", requireAuth, (req: AuthRequest, res) => {
  const { artifactId, price, currency } = req.body || {}

  const id = Number(artifactId)
  const listPrice = Number(price)
  const listCurrency = currency || "credits"

  if (!id) return res.status(400).json({ error: "Укажите artifactId" })
  if (!listPrice || listPrice <= 0) {
    return res.status(400).json({ error: "Некорректная цена" })
  }
  if (!CURRENCIES.includes(listCurrency)) {
    return res.status(400).json({ error: "Некорректная валюта" })
  }

  const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id)
  if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })
  if (artifact.owner_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому артефакту" })
  }
  if (artifact.status === "listed") {
    return res.status(400).json({ error: "Артефакт уже выставлен на продажу" })
  }

  const now = Date.now()

  db.prepare(`UPDATE artifacts SET status = 'listed' WHERE id = ?`).run(id)

  const info = db
    .prepare(
      `INSERT INTO marketplace_listings (artifact_id, seller_id, price, currency, status, listed_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
    )
    .run(id, req.user!.userId, listPrice, listCurrency, now)

  const listing = db
    .prepare(
      `SELECT id, artifact_id as artifactId, seller_id as sellerId, price, currency, status, listed_at as listedAt
       FROM marketplace_listings WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))

  res.status(201).json({ listing })
})

/* ---------------- POST /marketplace/:id/buy ---------------- */
router.post("/:id/buy", requireAuth, (req: AuthRequest, res) => {
  const listingId = Number(req.params.id)
  const listing: any = db.prepare(`SELECT * FROM marketplace_listings WHERE id = ?`).get(listingId)

  if (!listing) return res.status(404).json({ error: "Лот не найден" })
  if (listing.status !== "active") {
    return res.status(400).json({ error: "Лот уже продан или снят с продажи" })
  }
  if (listing.seller_id === req.user!.userId) {
    return res.status(400).json({ error: "Нельзя купить собственный лот" })
  }

  const buyerWallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!buyerWallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })

  const currency = listing.currency
  if (buyerWallet[currency] < listing.price) {
    logAudit(req.user!.userId, "rejected", listing.price, "insufficient_balance", { listingId, currency })
    return res.status(400).json({ error: `Недостаточно средств (${currency})` })
  }

  const artifact: any = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(listing.artifact_id)
  if (!artifact) return res.status(404).json({ error: "Артефакт не найден" })

  const now = Date.now()
  const fee = listing.price * MARKET_FEE
  const sellerReceives = listing.price - fee

  /* Списываем у покупателя */
  db.prepare(
    `UPDATE wallets SET ${currency} = ${currency} - ?, updated_at = ? WHERE user_id = ?`,
  ).run(listing.price, now, req.user!.userId)

  logAudit(req.user!.userId, "debit", listing.price, "marketplace_purchase", { listingId, artifactId: listing.artifact_id, currency })

  /* Начисляем продавцу за вычетом комиссии */
  db.prepare(
    `UPDATE wallets SET ${currency} = ${currency} + ?, updated_at = ? WHERE user_id = ?`,
  ).run(sellerReceives, now, listing.seller_id)
  logAudit(listing.seller_id, "credit", sellerReceives, "marketplace_sale", { listingId, artifactId: listing.artifact_id, currency, fee })

  /* Передаём артефакт покупателю */
  db.prepare(`UPDATE artifacts SET owner_id = ?, status = 'kept' WHERE id = ?`).run(
    req.user!.userId,
    listing.artifact_id,
  )

  db.prepare(
    `UPDATE marketplace_listings SET status = 'sold', sold_at = ?, buyer_id = ? WHERE id = ?`,
  ).run(now, req.user!.userId, listingId)

  /* Транзакции для обеих сторон */
  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'purchase', ?, ?, ?, ?, 'done')`,
  ).run(req.user!.userId, artifact.name, `Продавец #${listing.seller_id}`, listing.price, currency)

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'sale', ?, ?, ?, ?, 'done')`,
  ).run(listing.seller_id, artifact.name, `Покупатель #${req.user!.userId}`, sellerReceives, currency)

  /* Записываем в Зал Славы, если продажа крупная (эвристика: топ по цене) */
  db.prepare(
    `INSERT INTO hall_of_fame (artifact_id, artifact_name, type, rarity, architect, price, achieved_at)
     SELECT ?, ?, ?, ?, u.username, ?, ?
     FROM users u WHERE u.id = ?`,
  ).run(
    artifact.id,
    artifact.name,
    artifact.type,
    artifact.rarity,
    listing.price,
    now,
    listing.seller_id,
  )

  const updatedWallet = db
    .prepare(
      `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`,
    )
    .get(req.user!.userId)

  res.json({ wallet: updatedWallet, purchased: artifact.name, price: listing.price, currency })
})

export default router
