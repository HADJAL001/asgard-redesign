import db from "./db"

/* ================================================================
   OSGARD · TimeCoin Matching Engine
   ----------------------------------------------------------------
   Реальный limit-order matching engine поверх SQLite.
   - Заявки хранятся в tc_orders (side: 'buy' | 'sell', status: 'open'|'filled'|'cancelled'|'partial')
   - При создании новой заявки сразу пытаемся исполнить её против
     противоположной стороны книги (price-time priority):
       * buy  матчится с asks у которых price <= лимит покупателя, от самой дешёвой
       * sell матчится с bids у которых price >= лимит продавца, от самой дорогой
   - Каждое совпадение создаёт запись в tc_trades и двигает last-trade price
     рынка (tc_market_state.price = цена последней сделки).
   - Остаток заявки (если не исполнен полностью) остаётся в стакане (status='open'/'partial').
   ================================================================ */

export type OrderSide = "buy" | "sell"

export interface OrderRow {
  id: number
  user_id: number
  side: OrderSide
  price: number
  amount: number
  filled_amount: number
  status: "open" | "partial" | "filled" | "cancelled"
  created_at: number
  updated_at: number
}

export interface TradeResult {
  id: number
  ts: number
  price: number
  amount: number
  side: OrderSide // сторона тейкера (инициатора)
  makerOrderId: number
  takerOrderId: number
  buyerId: number
  sellerId: number
}

export interface MatchResult {
  order: OrderRow
  trades: TradeResult[]
  remaining: number
}

function getWallet(userId: number): any {
  return db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId)
}

/** Списывает TC с продавца при постановке ask-заявки (эскроу), либо cash при постановке buy лимитки. */
function reserveForOrder(userId: number, side: OrderSide, price: number, amount: number) {
  const wallet: any = getWallet(userId)
  if (!wallet) throw new Error("Кошелёк не найден")
  if (side === "sell") {
    if (wallet.timecoin < amount) throw new Error("Недостаточно TimeCoin для продажи")
    db.prepare(`UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`).run(
      amount,
      Date.now(),
      userId,
    )
  } else {
    const cost = price * amount
    if (wallet.cash_usd < cost) throw new Error("Недостаточно средств ($) для покупки")
    db.prepare(`UPDATE wallets SET cash_usd = cash_usd - ?, updated_at = ? WHERE user_id = ?`).run(
      cost,
      Date.now(),
      userId,
    )
  }
}

/** Возвращает неиспользованный резерв при отмене / частичной отмене заявки. */
function releaseReserve(userId: number, side: OrderSide, price: number, amount: number) {
  if (amount <= 0) return
  const now = Date.now()
  if (side === "sell") {
    db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(amount, now, userId)
  } else {
    db.prepare(`UPDATE wallets SET cash_usd = cash_usd + ?, updated_at = ? WHERE user_id = ?`).run(
      price * amount,
      now,
      userId,
    )
  }
}

function settleTrade(buyerId: number, sellerId: number, price: number, amount: number, buyOrderPrice: number) {
  const now = Date.now()
  /* Покупатель: резерв был по цене его лимитки (buyOrderPrice); если сделка прошла
     по более выгодной (меньшей) цене мейкера — возвращаем разницу в cash_usd,
     а TC начисляем по фактической цене сделки. */
  const refund = (buyOrderPrice - price) * amount
  if (refund > 0.0000001) {
    db.prepare(`UPDATE wallets SET cash_usd = cash_usd + ?, updated_at = ? WHERE user_id = ?`).run(
      refund,
      now,
      buyerId,
    )
  }
  db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(amount, now, buyerId)
  db.prepare(`UPDATE wallets SET cash_usd = cash_usd + ?, updated_at = ? WHERE user_id = ?`).run(
    price * amount,
    now,
    sellerId,
  )
}

function insertTrade(
  buyerId: number,
  sellerId: number,
  price: number,
  amount: number,
  takerSide: OrderSide,
  makerOrderId: number,
  takerOrderId: number,
): TradeResult {
  const now = Date.now()
  const info = db
    .prepare(
      `INSERT INTO tc_trades (user_id, ts, price, amount, side, maker_order_id, taker_order_id, buyer_id, seller_id, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'orderbook')`,
    )
    .run(
      takerSide === "buy" ? buyerId : sellerId,
      now,
      price,
      amount,
      takerSide,
      makerOrderId,
      takerOrderId,
      buyerId,
      sellerId,
    )

  db.prepare(`UPDATE tc_market_state SET price = ? WHERE id = 1`).run(price)
  db.prepare(`INSERT INTO tc_price_history (ts, price) VALUES (?, ?)`).run(now, price)

  return {
    id: Number(info.lastInsertRowid),
    ts: now,
    price,
    amount,
    side: takerSide,
    makerOrderId,
    takerOrderId,
    buyerId,
    sellerId,
  }
}

/**
 * Разместить новую заявку и немедленно попытаться сматчить её с
 * противоположной стороной стакана (price-time priority).
 */
export function placeOrder(userId: number, side: OrderSide, price: number, amount: number): MatchResult {
  if (!price || price <= 0) throw new Error("Некорректная цена заявки")
  if (!amount || amount <= 0) throw new Error("Некорректный объём заявки")

  reserveForOrder(userId, side, price, amount)

  const now = Date.now()
  const info = db
    .prepare(
      `INSERT INTO tc_orders (user_id, side, price, amount, filled_amount, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 'open', ?, ?)`,
    )
    .run(userId, side, price, amount, now, now)

  const orderId = Number(info.lastInsertRowid)
  const trades: TradeResult[] = []
  let remaining = amount

  // Противоположная сторона книги, отсортированная по price-time priority
  const oppositeSide: OrderSide = side === "buy" ? "sell" : "buy"
  const priceCmp = side === "buy" ? "<=" : ">="
  const orderDir = side === "buy" ? "ASC" : "DESC" // buy матчит с самыми дешёвыми asks; sell — с самыми дорогими bids

  while (remaining > 0.0000001) {
    const counter: any = db
      .prepare(
        `SELECT * FROM tc_orders
         WHERE side = ? AND status IN ('open','partial') AND price ${priceCmp} ? AND user_id != ?
         ORDER BY price ${orderDir}, created_at ASC
         LIMIT 1`,
      )
      .get(oppositeSide, price, userId)

    if (!counter) break

    const counterRemaining = counter.amount - counter.filled_amount
    const tradeAmount = Math.min(remaining, counterRemaining)
    const tradePrice = counter.price // цена мейкера (заявка уже стоящая в стакане)

    const buyerId = side === "buy" ? userId : counter.user_id
    const sellerId = side === "buy" ? counter.user_id : userId
    const buyOrderPrice = side === "buy" ? price : counter.price

    settleTrade(buyerId, sellerId, tradePrice, tradeAmount, buyOrderPrice)

    const trade = insertTrade(buyerId, sellerId, tradePrice, tradeAmount, side, counter.id, orderId)
    trades.push(trade)

    const newCounterFilled = counter.filled_amount + tradeAmount
    const counterStatus = newCounterFilled >= counter.amount - 0.0000001 ? "filled" : "partial"
    db.prepare(`UPDATE tc_orders SET filled_amount = ?, status = ?, updated_at = ? WHERE id = ?`).run(
      newCounterFilled,
      counterStatus,
      Date.now(),
      counter.id,
    )

    remaining -= tradeAmount
  }

  const filled = amount - remaining
  const status = filled <= 0.0000001 ? "open" : remaining <= 0.0000001 ? "filled" : "partial"
  db.prepare(`UPDATE tc_orders SET filled_amount = ?, status = ?, updated_at = ? WHERE id = ?`).run(
    filled,
    status,
    Date.now(),
    orderId,
  )

  const order = db.prepare(`SELECT * FROM tc_orders WHERE id = ?`).get(orderId) as unknown as OrderRow

  return { order, trades, remaining }
}

/** Отменяет открытую/частично исполненную заявку и возвращает резерв владельцу. */
export function cancelOrder(userId: number, orderId: number): OrderRow {
  const order: any = db.prepare(`SELECT * FROM tc_orders WHERE id = ?`).get(orderId)
  if (!order) throw new Error("Заявка не найдена")
  if (order.user_id !== userId) throw new Error("Нет доступа к этой заявке")
  if (order.status === "filled" || order.status === "cancelled") {
    throw new Error("Заявка уже закрыта")
  }

  const remaining = order.amount - order.filled_amount
  releaseReserve(userId, order.side, order.price, remaining)

  db.prepare(`UPDATE tc_orders SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(Date.now(), orderId)

  return db.prepare(`SELECT * FROM tc_orders WHERE id = ?`).get(orderId) as unknown as OrderRow
}

/** Агрегированный стакан заявок (bids/asks), сгруппированный по цене. */
export function getOrderBook(depth = 20): {
  bids: { price: number; amount: number; total: number }[]
  asks: { price: number; amount: number; total: number }[]
} {
  const bidsRaw: any[] = db
    .prepare(
      `SELECT price, SUM(amount - filled_amount) as amount
       FROM tc_orders WHERE side = 'buy' AND status IN ('open','partial')
       GROUP BY price ORDER BY price DESC LIMIT ?`,
    )
    .all(depth)

  const asksRaw: any[] = db
    .prepare(
      `SELECT price, SUM(amount - filled_amount) as amount
       FROM tc_orders WHERE side = 'sell' AND status IN ('open','partial')
       GROUP BY price ORDER BY price ASC LIMIT ?`,
    )
    .all(depth)

  let bidTotal = 0
  const bids = bidsRaw.map((r) => {
    bidTotal += r.amount
    return { price: r.price, amount: r.amount, total: Math.round(bidTotal * 100) / 100 }
  })

  let askTotal = 0
  const asks = asksRaw.map((r) => {
    askTotal += r.amount
    return { price: r.price, amount: r.amount, total: Math.round(askTotal * 100) / 100 }
  })

  return { bids, asks }
}
