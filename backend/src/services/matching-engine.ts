import db from "../lib/db"

/* ================================================================
   OSGARD · Matching Engine Service (Этап 1.2)
   ----------------------------------------------------------------
   Полностью атомарный limit-order matching engine поверх SQLite.
   Все операции выполняются внутри BEGIN IMMEDIATE / COMMIT / ROLLBACK.
   ================================================================ */

export type OrderSide = "buy" | "sell"
export type OrderStatus = "open" | "partial" | "filled" | "cancelled"

export interface OrderRow {
  id: number
  user_id: number
  side: OrderSide
  price: number
  amount: number
  filled_amount: number
  status: OrderStatus
  created_at: number
  updated_at: number
}

export interface WalletRow {
  user_id: number
  credits: number
  shards: number
  crystals: number
  timecoin: number
  cash_usd: number
  updated_at: number
}

export interface TradeRow {
  id: number
  user_id: number
  ts: number
  price: number
  amount: number
  side: OrderSide
  maker_order_id: number
  taker_order_id: number
  buyer_id: number
  seller_id: number
  origin: string
}

export interface MatchResult {
  order: OrderRow
  trades: TradeRow[]
  remaining: number
}

const EPS = 1e-9

function now(): number {
  return Date.now()
}

function beginImmediate() {
  db.exec("BEGIN IMMEDIATE")
}

function commit() {
  db.exec("COMMIT")
}

function rollback() {
  try {
    db.exec("ROLLBACK")
  } catch {
    /* если транзакция уже закрыта — игнорируем */
  }
}

function getWallet(userId: number): WalletRow | undefined {
  return db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId) as WalletRow | undefined
}

function getOrder(orderId: number): OrderRow | undefined {
  return db.prepare(`SELECT * FROM tc_orders WHERE id = ?`).get(orderId) as OrderRow | undefined
}

/* ================================================================
   ЭСКРОУ: заморозка / возврат средств при постановке / отмене заявки
   ================================================================ */

/** Замораживает средства пользователя под заявку. Бросает ошибку, если баланса недостаточно. */
function escrowForOrder(userId: number, side: OrderSide, price: number, amount: number) {
  const wallet = getWallet(userId)
  if (!wallet) throw new Error("Кошелёк не найден")

  if (side === "sell") {
    if (wallet.timecoin + EPS < amount) {
      throw new Error("Недостаточно TimeCoin для продажи")
    }
    db.prepare(`UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`).run(
      amount,
      now(),
      userId,
    )
  } else {
    const cost = price * amount
    if (wallet.cash_usd + EPS < cost) {
      throw new Error("Недостаточно средств ($) для покупки")
    }
    db.prepare(`UPDATE wallets SET cash_usd = cash_usd - ?, updated_at = ? WHERE user_id = ?`).run(
      cost,
      now(),
      userId,
    )
  }
}

/** Возвращает неиспользованный эскроу владельцу заявки (при отмене / остатке). */
function releaseEscrow(userId: number, side: OrderSide, price: number, amount: number) {
  if (amount <= EPS) return
  if (side === "sell") {
    db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(
      amount,
      now(),
      userId,
    )
  } else {
    db.prepare(`UPDATE wallets SET cash_usd = cash_usd + ?, updated_at = ? WHERE user_id = ?`).run(
      price * amount,
      now(),
      userId,
    )
  }
}

/* ================================================================
   1. createLimitOrder — создать лимитную заявку с эскроу + запуск матчинга
   ================================================================ */
export function createLimitOrder(
  userId: number,
  side: OrderSide,
  price: number,
  amount: number,
): MatchResult {
  if (!price || price <= 0) throw new Error("Некорректная цена заявки")
  if (!amount || amount <= 0) throw new Error("Некорректный объём заявки")

  beginImmediate()
  try {
    // 1. Проверка баланса + эскроу (внутри транзакции)
    escrowForOrder(userId, side, price, amount)

    // 2. Создаём заявку в БД
    const ts = now()
    const info = db
      .prepare(
        `INSERT INTO tc_orders (user_id, side, price, amount, filled_amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 'open', ?, ?)`,
      )
      .run(userId, side, price, amount, ts, ts)

    const orderId = Number(info.lastInsertRowid)
    let order = getOrder(orderId)!

    // 3. Запуск матчинга против противоположной стороны книги
    const { trades, remaining } = matchOrder(order)

    order = getOrder(orderId)!

    commit()
    return { order, trades, remaining }
  } catch (err) {
    rollback()
    throw err
  }
}

/* ================================================================
   2. matchOrder — поиск встречных заявок (price-time priority) и
      исполнение сделок. Предполагается, что вызывается внутри уже
      открытой транзакции (см. createLimitOrder).
   ================================================================ */
export function matchOrder(order: OrderRow): { trades: TradeRow[]; remaining: number } {
  const trades: TradeRow[] = []
  let remaining = order.amount - order.filled_amount

  const oppositeSide: OrderSide = order.side === "buy" ? "sell" : "buy"
  const priceCmp = order.side === "buy" ? "<=" : ">=" // buy матчится с ask <= лимита, sell — с bid >= лимита
  const orderDir = order.side === "buy" ? "ASC" : "DESC" // приоритет по лучшей цене мейкера

  while (remaining > EPS) {
    const counter = db
      .prepare(
        `SELECT * FROM tc_orders
         WHERE side = ? AND status IN ('open','partial') AND price ${priceCmp} ? AND user_id != ?
         ORDER BY price ${orderDir}, created_at ASC, id ASC
         LIMIT 1`,
      )
      .get(oppositeSide, order.price, order.user_id) as OrderRow | undefined

    if (!counter) break

    const counterRemaining = counter.amount - counter.filled_amount
    const tradeQuantity = Math.min(remaining, counterRemaining)
    if (tradeQuantity <= EPS) break

    const buyOrder = order.side === "buy" ? order : counter
    const sellOrder = order.side === "buy" ? counter : order

    // Цена сделки — цена мейкера (заявка уже стоящая в стакане)
    const tradePrice = counter.price

    executeTrade(buyOrder, sellOrder, tradeQuantity, tradePrice, /* takerOrderId */ order.id)

    remaining -= tradeQuantity

    // Обновляем локальную копию order.filled_amount, чтобы цикл видел актуальный remaining
    order = getOrder(order.id)!
  }

  return { trades: collectTradesForOrder(order.id), remaining }
}

/** Достаёт сделки, созданные в рамках данного тейкер-ордера (для возврата вызывающему коду). */
function collectTradesForOrder(takerOrderId: number): TradeRow[] {
  return db
    .prepare(`SELECT * FROM tc_trades WHERE taker_order_id = ? ORDER BY id ASC`)
    .all(takerOrderId) as unknown as TradeRow[]
}

/* ================================================================
   3. executeTrade — создание сделки + обновление балансов + ордеров
   ================================================================
   buyOrder / sellOrder — актуальные строки заявок (buy/sell), quantity —
   исполняемый объём, price — цена сделки (обычно цена мейкера),
   takerOrderId — id заявки-инициатора (тейкера) для записи в tc_trades.
   ================================================================ */
export function executeTrade(
  buyOrder: OrderRow,
  sellOrder: OrderRow,
  quantity: number,
  price: number,
  takerOrderId: number,
): TradeRow {
  if (quantity <= 0) throw new Error("Некорректное количество для исполнения сделки")
  if (price <= 0) throw new Error("Некорректная цена сделки")

  const ts = now()
  const buyerId = buyOrder.user_id
  const sellerId = sellOrder.user_id
  const makerOrderId = takerOrderId === buyOrder.id ? sellOrder.id : buyOrder.id

  /* ---- Обновление балансов ---- */
  // Покупатель резервировал cash_usd по цене СВОЕЙ лимитки (buyOrder.price).
  // Если сделка исполнилась по более выгодной (меньшей) цене мейкера —
  // возвращаем разницу покупателю. TC начисляем по фактической цене сделки.
  const refund = (buyOrder.price - price) * quantity
  if (refund > EPS) {
    db.prepare(`UPDATE wallets SET cash_usd = cash_usd + ?, updated_at = ? WHERE user_id = ?`).run(
      refund,
      ts,
      buyerId,
    )
  }

  // buyer: -USD (уже списано эскроу при постановке заявки), +TC
  db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(
    quantity,
    ts,
    buyerId,
  )

  // seller: -TC (уже списано эскроу при постановке заявки), +USD по цене сделки
  db.prepare(`UPDATE wallets SET cash_usd = cash_usd + ?, updated_at = ? WHERE user_id = ?`).run(
    price * quantity,
    ts,
    sellerId,
  )

  /* ---- Создание записи сделки ---- */
  const takerSide: OrderSide = takerOrderId === buyOrder.id ? "buy" : "sell"
  const info = db
    .prepare(
      `INSERT INTO tc_trades (user_id, ts, price, amount, side, maker_order_id, taker_order_id, buyer_id, seller_id, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'orderbook')`,
    )
    .run(
      takerSide === "buy" ? buyerId : sellerId,
      ts,
      price,
      quantity,
      takerSide,
      makerOrderId,
      takerOrderId,
      buyerId,
      sellerId,
    )

  // Двигаем last-trade price рынка
  db.prepare(`UPDATE tc_market_state SET price = ? WHERE id = 1`).run(price)
  db.prepare(`INSERT INTO tc_price_history (ts, price) VALUES (?, ?)`).run(ts, price)

  /* ---- Обновление ордеров (filled_amount, status) ---- */
  updateOrderFill(buyOrder.id, quantity)
  updateOrderFill(sellOrder.id, quantity)

  return db.prepare(`SELECT * FROM tc_trades WHERE id = ?`).get(Number(info.lastInsertRowid)) as unknown as TradeRow
}

/** Увеличивает filled_amount заявки на quantity и пересчитывает статус. */
function updateOrderFill(orderId: number, quantity: number) {
  const order = getOrder(orderId)
  if (!order) return

  const newFilled = order.filled_amount + quantity
  const remaining = order.amount - newFilled
  const status: OrderStatus = remaining <= EPS ? "filled" : "partial"

  db.prepare(`UPDATE tc_orders SET filled_amount = ?, status = ?, updated_at = ? WHERE id = ?`).run(
    newFilled,
    status,
    now(),
    orderId,
  )
}

/* ================================================================
   4. cancelOrder — отмена заявки с возвратом эскроу
   ================================================================ */
export function cancelOrder(userId: number, orderId: number): OrderRow {
  beginImmediate()
  try {
    const order = getOrder(orderId)
    if (!order) throw new Error("Заявка не найдена")
    if (order.user_id !== userId) throw new Error("Нет доступа к этой заявке")
    if (order.status === "filled" || order.status === "cancelled") {
      throw new Error("Заявка уже закрыта")
    }

    const remaining = order.amount - order.filled_amount
    releaseEscrow(userId, order.side, order.price, remaining)

    db.prepare(`UPDATE tc_orders SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(now(), orderId)

    const updated = getOrder(orderId)!
    commit()
    return updated
  } catch (err) {
    rollback()
    throw err
  }
}

/* ================================================================
   Дополнительно: агрегированный стакан заявок (для UI / роутов)
   ================================================================ */
export function getOrderBook(depth = 20): {
  bids: { price: number; amount: number; total: number }[]
  asks: { price: number; amount: number; total: number }[]
} {
  const bidsRaw = db
    .prepare(
      `SELECT price, SUM(amount - filled_amount) as amount
       FROM tc_orders WHERE side = 'buy' AND status IN ('open','partial')
       GROUP BY price ORDER BY price DESC LIMIT ?`,
    )
    .all(depth) as { price: number; amount: number }[]

  const asksRaw = db
    .prepare(
      `SELECT price, SUM(amount - filled_amount) as amount
       FROM tc_orders WHERE side = 'sell' AND status IN ('open','partial')
       GROUP BY price ORDER BY price ASC LIMIT ?`,
    )
    .all(depth) as { price: number; amount: number }[]

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
