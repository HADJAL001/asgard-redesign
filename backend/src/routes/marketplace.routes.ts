import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { logAudit } from "../lib/audit"
import { createActivityEvent } from "../lib/activity"
import { createNotification } from "../lib/notifications"
import { addArchitectXp } from "../lib/architect-progression"
import { computeCreatorRoyalty } from "../lib/creator-royalty"
import { runEconomyOp, EconomyError, normalizeIdemKey } from "../lib/economy-tx"

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
         a.creator_id as creatorId,
         u.username as sellerUsername, u.display_name as sellerDisplayName,
         cu.username as creatorUsername, cu.display_name as creatorDisplayName
       FROM marketplace_listings l
       JOIN artifacts a ON a.id = l.artifact_id
       JOIN users u ON u.id = l.seller_id
       LEFT JOIN users cu ON cu.id = a.creator_id
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
  const buyerId = req.user!.userId
  const idemKey = normalizeIdemKey(req.header("Idempotency-Key") ?? (req.body as any)?.idempotencyKey)

  const listing: any = db.prepare(`SELECT * FROM marketplace_listings WHERE id = ?`).get(listingId)

  /* Дешёвые предпроверки без открытия транзакции (быстрый отказ + понятные 404).
     Авторитетные гарантии — «захват» лота и условное списание — внутри mutate. */
  if (!listing) return res.status(404).json({ error: "Лот не найден" })
  if (listing.status !== "active") {
    return res.status(400).json({ error: "Лот уже продан или снят с продажи" })
  }
  if (listing.seller_id === buyerId) {
    return res.status(400).json({ error: "Нельзя купить собственный лот" })
  }

  const buyerWallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(buyerId)
  if (!buyerWallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })

  const currency = listing.currency
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

  /* Роялти творцу считаем до транзакции (чистая функция), выплачиваем внутри.
     Фиксируем факт выплаты для пост-коммит аудита/ленты (null на повторе).
     Держим в поле holder-объекта, а не в let: присваивание идёт внутри замыкания
     mutate, и TS-анализ потока схлопнул бы внешний let до never; доступ к свойству
     он не сужает. */
  const post: { royaltyPaid: { creatorId: number; amount: number } | null } = { royaltyPaid: null }

  try {
    const opResult = runEconomyOp({
      userId: buyerId,
      scope: "market_buy",
      idemKey,
      mutate: () => {
        /* АВТОРИТЕТНЫЙ захват лота: перевод active→sold — единственный, атомарный.
           WHERE status='active' закрывает TOCTOU: параллельный двойной buy или
           повторный клик даст changes=0 → 409, деньги не тронуты. Заменяет прежнее
           отдельное «UPDATE ... SET status='sold'» в конце транзакции. */
        const claim = db
          .prepare(
            `UPDATE marketplace_listings SET status = 'sold', sold_at = ?, buyer_id = ?
             WHERE id = ? AND status = 'active'`,
          )
          .run(now, buyerId, listingId)
        if (claim.changes !== 1) {
          throw new EconomyError("Лот уже продан или снят с продажи", 409)
        }

        /* Условное списание у покупателя: WHERE balance >= price. changes=0 →
           недостаточно средств (авторитетно, без гонки с чтением баланса). */
        const debit = db
          .prepare(
            `UPDATE wallets SET ${currency} = ${currency} - ?, updated_at = ?
             WHERE user_id = ? AND ${currency} >= ?`,
          )
          .run(listing.price, now, buyerId, listing.price)
        if (debit.changes !== 1) {
          throw new EconomyError(`Недостаточно средств (${currency})`, 400)
        }

        /* Начисляем продавцу за вычетом комиссии */
        db.prepare(
          `UPDATE wallets SET ${currency} = ${currency} + ?, updated_at = ? WHERE user_id = ?`,
        ).run(sellerReceives, now, listing.seller_id)

        /* Creator-роялти: первому кузнецу артефакта — доля комиссии при перепродаже.
           Из платформенной части fee (net продавца и цена покупателя не меняются).
           Anti-wash: роялти < комиссии, круговая перепродажа убыточна. Не платится,
           если творец — сам продавец/покупатель, либо его кошелёк уже удалён. */
        const royalty = computeCreatorRoyalty(fee, {
          creatorId: artifact.creator_id,
          sellerId: listing.seller_id,
          buyerId,
        })
        if (royalty) {
          const creatorWallet: any = db.prepare(`SELECT user_id FROM wallets WHERE user_id = ?`).get(royalty.creatorId)
          if (creatorWallet) {
            db.prepare(
              `UPDATE wallets SET ${currency} = ${currency} + ?, updated_at = ? WHERE user_id = ?`,
            ).run(royalty.amount, now, royalty.creatorId)
            db.prepare(
              `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
               VALUES (?, 'royalty', ?, ?, ?, ?, 'done')`,
            ).run(royalty.creatorId, artifact.name, `Роялти · продавец #${listing.seller_id}`, royalty.amount, currency)
            post.royaltyPaid = { creatorId: royalty.creatorId, amount: royalty.amount }
          }
        }

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
          buyerId,
          listing.artifact_id,
        )

        /* Транзакции для обеих сторон */
        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'purchase', ?, ?, ?, ?, 'done')`,
        ).run(buyerId, artifact.name, `Продавец #${listing.seller_id}`, listing.price, currency)

        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'sale', ?, ?, ?, ?, 'done')`,
        ).run(listing.seller_id, artifact.name, `Покупатель #${buyerId}`, sellerReceives, currency)

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

        const updatedWallet = db
          .prepare(
            `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`,
          )
          .get(buyerId)

        return { wallet: updatedWallet, purchased: artifact.name, price: listing.price, currency }
      },
    })

    /* Пост-коммит телеметрия — вне транзакции и только для НАСТОЯЩЕЙ покупки
       (не повтор по идемпотентному ключу), иначе двойной клик задвоит ленту/аудит. */
    if (!opResult.replayed) {
      logAudit(buyerId, "debit", listing.price, "marketplace_purchase", { listingId, artifactId: listing.artifact_id, currency })
      logAudit(listing.seller_id, "credit", sellerReceives, "marketplace_sale", { listingId, artifactId: listing.artifact_id, currency, fee })

      createActivityEvent({
        userId: listing.seller_id,
        type: "artifact_sold",
        entityType: "artifact",
        entityId: listing.artifact_id,
        text: `продал артефакт «${artifact.name}»`,
        metadata: { name: artifact.name, rarity: artifact.rarity, price: listing.price, currency },
      })
      createNotification({
        userId: listing.seller_id,
        actorId: buyerId,
        type: "marketplace_sale",
        entityType: "artifact",
        entityId: listing.artifact_id,
        text: `Ваш артефакт «${artifact.name}» продан за ${sellerReceives} ${currency}.`,
      })
      addArchitectXp(listing.seller_id, "artifact_sold")

      const rp = post.royaltyPaid
      if (rp) {
        logAudit(rp.creatorId, "credit", rp.amount, "creator_royalty", {
          listingId,
          artifactId: listing.artifact_id,
          currency,
        })
        createActivityEvent({
          userId: rp.creatorId,
          type: "royalty_earned",
          entityType: "artifact",
          entityId: listing.artifact_id,
          text: `получил роялти за свою ковку «${artifact.name}»`,
          metadata: { name: artifact.name, rarity: artifact.rarity, amount: rp.amount, currency },
        })
        createNotification({
          userId: rp.creatorId,
          type: "marketplace_royalty",
          entityType: "artifact",
          entityId: listing.artifact_id,
          text: `Роялти за перепродажу вашей ковки «${artifact.name}»: ${rp.amount} ${currency}.`,
        })
      }

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
    }

    return res.json(opResult.result)
  } catch (err) {
    if (err instanceof EconomyError) {
      if (err.status === 400) {
        logAudit(buyerId, "rejected", listing.price, "insufficient_balance", { listingId, currency })
      }
      return res.status(err.status).json({ error: err.message })
    }
    throw err
  }
})

export default router
