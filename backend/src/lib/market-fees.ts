import db from "./db"

/* ================================================================
   OSGARD · Общие правила комиссий вторичного рынка
   ----------------------------------------------------------------
   Единый источник ставок и констант для маркетплейса и аукционов,
   чтобы экономика продаж не расходилась между двумя путями сбыта.
   ================================================================ */

export const MARKET_CURRENCIES = ["credits", "shards", "crystals", "timecoin", "cash_usd"] as const

/** Базовая комиссия рынка с продавца (5%), снижается тарифом и стейком. */
export const MARKET_FEE = 0.05

/** Доля платформенной комиссии (в TimeCoin), которая сжигается → дефляция. */
export const BURN_SHARE_OF_FEE = 0.5

/** Доля комиссии (в TimeCoin), уходящая пригласившему продавца, — реф-revshare. */
export const REFERRAL_REVSHARE_OF_FEE = 0.1

const PLAN_FEE: Record<string, number> = { free: 0.05, pro: 0.04, supreme: 0.03, duo: 0.02, elite: 0.01 }

/** Итоговая ставка комиссии для продавца: минимум из тарифа и привилегии стейка. */
export function marketFeeRateFor(sellerId: number): number {
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

/**
 * Начисляет продавцу выручку за вычетом комиссии и применяет TimeCoin-эффекты
 * (buyback&burn + реферальный revenue-share). ВЫЗЫВАТЬ ВНУТРИ уже открытой
 * транзакции (BEGIN IMMEDIATE). Возвращает разбивку по деньгам.
 */
export function creditSellerWithFees(params: {
  sellerId: number
  price: number
  currency: string
  now: number
}): { fee: number; sellerReceives: number; burned: number; revShare: number } {
  const { sellerId, price, currency, now } = params
  const feeRate = marketFeeRateFor(sellerId)
  const fee = price * feeRate
  const sellerReceives = price - fee

  db.prepare(`UPDATE wallets SET ${currency} = ${currency} + ?, updated_at = ? WHERE user_id = ?`).run(
    sellerReceives,
    now,
    sellerId,
  )

  let burned = 0
  let revShare = 0
  if (currency === "timecoin") {
    burned = fee * BURN_SHARE_OF_FEE
    if (burned > 0) db.prepare(`UPDATE tc_market_state SET burned = burned + ? WHERE id = 1`).run(burned)

    const seller: any = db.prepare(`SELECT referred_by FROM users WHERE id = ?`).get(sellerId)
    revShare = fee * REFERRAL_REVSHARE_OF_FEE
    if (seller?.referred_by && revShare > 0) {
      db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(
        revShare,
        now,
        seller.referred_by,
      )
      db.prepare(
        `INSERT INTO referrals (referrer_id, referee_id, reward_amount, status) VALUES (?, ?, ?, 'active')
         ON CONFLICT(referrer_id, referee_id) DO UPDATE SET reward_amount = reward_amount + ?, status = 'active'`,
      ).run(seller.referred_by, sellerId, Math.round(revShare), Math.round(revShare))
      db.prepare(
        `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
         VALUES (?, 'referral', 'Реф-доход с продажи', ?, ?, 'timecoin', 'done')`,
      ).run(seller.referred_by, `Реферал #${sellerId}`, revShare)
    }
  }

  return { fee, sellerReceives, burned, revShare }
}
