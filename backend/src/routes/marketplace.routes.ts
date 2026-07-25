import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { logAudit } from "../lib/audit"
import { createActivityEvent } from "../lib/activity"

const router = Router()

const CURRENCIES = ["credits", "shards", "crystals", "timecoin", "cash_usd"]
const MARKET_FEE = 0.05 /* базовая комиссия маркетплейса при продаже, 5% с продавца */

/* Комиссия снижается тарифом подписки И активным стейком (привилегия стейкинга —
   «до 1% вместо 5%»). Берём наименьшую из двух ставок. */
const PLAN_FEE: Record<string, number> = { free: 0.05, pro: 0.04, supreme: 0.03, duo: 0.02, elite: 0.01 }
function marketFeeRateFor(sellerId: number): number {
  const u: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(sellerId)
  const staked: any = db
    .prepare(`SELECT COALESCE(SUM(amount_tc), 0) AS s FROM stakes WHERE user_id = ? AND status = 'active'`)
    .get(sellerId)
  let rate = PLAN_FEE[(u?.plan as string) || "free"] ?? MARKET_FEE
  const s = Number(staked?.s || 0)
  if (s >= 1000) rate = Math.min(rate, 0.01)
  else if (s >= 100) rate = Math.min(rate, 0.02)
  return rate
}

/* Buyback & burn: доля платформенной комиссии (в TimeCoin) сжигается — реальная
   дефляция от активности рынка (растит tc_market_state.burned честными числами). */
const BURN_SHARE_OF_FEE = 0.5

/* Реферальный revenue-share: пригласивший продавца получает долю комиссии с ЕГО
   продаж (в TimeCoin) — пассивный доход за приведённых активных креаторов, из
   платформенной части комиссии, а не из кармана продавца. */
const REFERRAL_REVSHARE_OF_FEE = 0.1

/* Порог «крупной продажи» для попадания в Зал Славы, per-currency
   (примерно эквивалент $50 по курсам из wallet.routes.ts RATE_TO_USD). */
const HOF_MIN_PRICE: Record<string, number> = {
  credits: 5000,
  shards: 500,
  crystals: 50,
  timecoin: 5,
  cash_usd: 50,
}

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

  res.set("Cache-Control", "public, max-age=3")
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
  const feeRate = marketFeeRateFor(listing.seller_id)
  const fee = listing.price * feeRate
  const sellerReceives = listing.price - fee
  const isLargeSale = listing.price >= (HOF_MIN_PRICE[currency] ?? Infinity)

  /* Гейт Зала Славы: попасть в него можно, только если продавец выполнил хотя бы
     один квест из walli_quests (миграция 012 сеет 5 стартовых типов при первом
     GET /walli/quests). Крупная продажа без выполненных квестов проходит как
     обычно — просто не попадает в Зал Славы. Читаем синхронно (better-sqlite3),
     до открытия транзакции. */
  const sellerHasCompletedQuest = !!db
    .prepare(`SELECT 1 FROM walli_quests WHERE user_id = ? AND completed = 1 LIMIT 1`)
    .get(listing.seller_id)
  const qualifiesForHof = isLargeSale && sellerHasCompletedQuest

  db.exec("BEGIN IMMEDIATE")
  try {
    /* Списываем у покупателя */
    db.prepare(
      `UPDATE wallets SET ${currency} = ${currency} - ?, updated_at = ? WHERE user_id = ?`,
    ).run(listing.price, now, req.user!.userId)

    /* Начисляем продавцу за вычетом комиссии */
    db.prepare(
      `UPDATE wallets SET ${currency} = ${currency} + ?, updated_at = ? WHERE user_id = ?`,
    ).run(sellerReceives, now, listing.seller_id)

    /* Buyback & burn: доля комиссии в TimeCoin сжигается → реальная дефляция. */
    if (currency === "timecoin") {
      const burn = fee * BURN_SHARE_OF_FEE
      if (burn > 0) db.prepare(`UPDATE tc_market_state SET burned = burned + ? WHERE id = 1`).run(burn)

      /* Реферальный revenue-share: пригласившему продавца — доля комиссии. */
      const seller: any = db.prepare(`SELECT referred_by FROM users WHERE id = ?`).get(listing.seller_id)
      const revShare = fee * REFERRAL_REVSHARE_OF_FEE
      if (seller?.referred_by && revShare > 0) {
        db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(revShare, now, seller.referred_by)
        db.prepare(
          `INSERT INTO referrals (referrer_id, referee_id, reward_amount, status) VALUES (?, ?, ?, 'active')
           ON CONFLICT(referrer_id, referee_id) DO UPDATE SET reward_amount = reward_amount + ?, status = 'active'`,
        ).run(seller.referred_by, listing.seller_id, Math.round(revShare), Math.round(revShare))
        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'referral', 'Реф-доход с продажи', ?, ?, 'timecoin', 'done')`,
        ).run(seller.referred_by, `Реферал #${listing.seller_id}`, revShare)
      }
    }

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

    /* Записываем в Зал Славы, только если продажа крупная (порог по валюте)
       И продавец выполнил хотя бы один квест (гейт по walli_quests). */
    if (qualifiesForHof) {
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
    }

    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }

  logAudit(req.user!.userId, "debit", listing.price, "marketplace_purchase", { listingId, artifactId: listing.artifact_id, currency })
  logAudit(listing.seller_id, "credit", sellerReceives, "marketplace_sale", { listingId, artifactId: listing.artifact_id, currency, fee })

  createActivityEvent({
    userId: listing.seller_id,
    type: "artifact_sold",
    entityType: "artifact",
    entityId: listing.artifact_id,
    text: `продал артефакт «${artifact.name}»`,
    metadata: { name: artifact.name, rarity: artifact.rarity, price: listing.price, currency },
  })

  if (qualifiesForHof) {
    createActivityEvent({
      userId: listing.seller_id,
      type: "hof_entry",
      entityType: "artifact",
      entityId: listing.artifact_id,
      text: `пополнил Зал Славы артефактом «${artifact.name}»`,
      metadata: { name: artifact.name, rarity: artifact.rarity, price: listing.price, currency },
    })
  }

  const updatedWallet = db
    .prepare(
      `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`,
    )
    .get(req.user!.userId)

  res.json({ wallet: updatedWallet, purchased: artifact.name, price: listing.price, currency })
})

export default router
