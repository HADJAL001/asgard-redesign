import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import {
  createLimitOrder,
  cancelOrder,
  getOrderBook,
  OrderSide,
  TradeRow,
} from "../services/matching-engine"
import { logAudit } from "../lib/audit"
import { canEmitUnbacked } from "../lib/emission-guard"

const router = Router()

const EPS = 1e-9

/* Верхний предел суммарной эмиссии ∞ через tc-market (state.minted), синхронизирован
   с фронтендовой константой TC_TOTAL_CAP в lib/tc-market.ts. Ограничивает совокупный
   объём когда-либо наминченного ∞ независимо от резерва казначейства (canEmitUnbacked
   проверяет обеспеченность резервом, этот предел — отдельный продуктовый потолок эмиссии). */
const TC_TOTAL_CAP = 2_100_000

/* Насколько сильно рыночная (market) сделка двигает цену TC при отсутствии
   (или нехватке) встречных лимитных заявок — fallback-режим эмиссии/сжигания. */
const PRICE_IMPACT_FACTOR = 0.00002

function getMarketState(): any {
  return db.prepare(`SELECT * FROM tc_market_state WHERE id = 1`).get()
}

function getWallet(userId: number): any {
  return db
    .prepare(
      `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`,
    )
    .get(userId)
}

function serializeOrder(order: any) {
  return {
    id: order.id,
    side: order.side,
    price: order.price,
    amount: order.amount,
    filledAmount: order.filled_amount,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  }
}

/* ================================================================
   GET /tc-market/state — текущая цена и статистика рынка TimeCoin
   ================================================================ */
router.get("/state", (_req, res) => {
  const state: any = getMarketState()
  if (!state) return res.status(500).json({ error: "Рынок TimeCoin не инициализирован" })

  const circulating = state.minted - state.burned - state.staked
  const marketCap = circulating * state.price

  const history = db.prepare(`SELECT ts, price FROM tc_price_history ORDER BY ts DESC LIMIT 100`).all()

  const volume24h: any = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) as volume FROM tc_trades WHERE ts >= ?`)
    .get(Date.now() - 24 * 60 * 60 * 1000)

  res.set("Cache-Control", "public, max-age=3")
  res.json({
    price: state.price,
    minted: state.minted,
    burned: state.burned,
    staked: state.staked,
    circulating,
    marketCap,
    volume24h: volume24h.volume,
    history: (history as any[]).reverse(),
  })
})

/* ================================================================
   GET /tc-market/orderbook — агрегированный стакан заявок
   ================================================================ */
router.get("/orderbook", (_req, res) => {
  const state: any = getMarketState()
  const book = getOrderBook(20)
  const bestBid = book.bids[0]?.price ?? null
  const bestAsk = book.asks[0]?.price ?? null
  const spread = bestBid !== null && bestAsk !== null ? Math.round((bestAsk - bestBid) * 100) / 100 : 0

  res.set("Cache-Control", "public, max-age=3")
  res.json({
    bids: book.bids,
    asks: book.asks,
    spread,
    mid: state?.price ?? null,
  })
})

/* ================================================================
   GET /tc-market/trades — последние 50 сделок
   ================================================================ */
router.get("/trades", (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const trades = db
    .prepare(`SELECT id, ts, price, amount, side, origin FROM tc_trades ORDER BY ts DESC, id DESC LIMIT ?`)
    .all(limit)
  res.set("Cache-Control", "public, max-age=3")
  res.json({ trades })
})

/* ================================================================
   GET /tc-market/orders — заявки текущего пользователя
   ================================================================ */
router.get("/orders", requireAuth, (req: AuthRequest, res) => {
  const orders = db
    .prepare(
      `SELECT id, side, price, amount, filled_amount as filledAmount, status, created_at as createdAt, updated_at as updatedAt
       FROM tc_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .all(req.user!.userId)
  res.json({ orders })
})

/* ================================================================
   POST /tc-market/order — разместить лимитную заявку (createLimitOrder)
   ================================================================ */
router.post("/order", requireAuth, (req: AuthRequest, res) => {
  const { side, price, amount } = req.body || {}

  if (side !== "buy" && side !== "sell") {
    return res.status(400).json({ error: "side должен быть 'buy' или 'sell'" })
  }
  const p = Number(price)
  const a = Number(amount)
  if (!Number.isFinite(p) || p <= 0) return res.status(400).json({ error: "Некорректная цена" })
  if (!Number.isFinite(a) || a <= 0) return res.status(400).json({ error: "Некорректный объём" })

  try {
    const result = createLimitOrder(req.user!.userId, side as OrderSide, p, a)

    if (result.trades.length > 0) {
      const totalAmount = result.trades.reduce((s, t) => s + t.amount, 0)
      db.prepare(
        `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
         VALUES (?, ?, 'TimeCoin Order', 'Order Book', ?, 'timecoin', 'done')`,
      ).run(req.user!.userId, side === "buy" ? "tc_buy" : "tc_sell", totalAmount)
    }

    const book = getOrderBook(20)

    res.status(201).json({
      order: serializeOrder(result.order),
      trades: result.trades,
      wallet: getWallet(req.user!.userId),
      orderbook: book,
    })
  } catch (err: any) {
    if (err.message === "Кошелёк не найден") {
      return res.status(401).json({ error: "Сессия недействительна. Пожалуйста, войдите заново.", code: "USER_NOT_FOUND" })
    }
    res.status(400).json({ error: err.message || "Не удалось разместить заявку" })
  }
})

/* ================================================================
   DELETE /tc-market/order/:id — отменить заявку (cancelOrder)
   ================================================================ */
router.delete("/order/:id", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Некорректный идентификатор заявки" })
  }

  try {
    const order = cancelOrder(req.user!.userId, id)
    const book = getOrderBook(20)
    res.json({
      order: serializeOrder(order),
      wallet: getWallet(req.user!.userId),
      orderbook: book,
    })
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Не удалось отменить заявку" })
  }
})

/* ================================================================
   POST /tc-market/buy — маркет-покупка.
   Исполняется против стакана (createLimitOrder с "проходной" ценой),
   а недостающий объём (если в стакане не хватило asks) — докупается
   через эмиссию (mint) TimeCoin по текущей цене рынка с небольшим
   price-impact, чтобы гарантировать исполнение всей суммы usdAmount.
   ================================================================ */
router.post("/buy", requireAuth, async (req: AuthRequest, res) => {
  const { usdAmount } = req.body || {}
  const usd = Number(usdAmount)
  if (!Number.isFinite(usd) || usd <= 0) {
    return res.status(400).json({ error: "Некорректная сумма в cash_usd" })
  }

  const walletBefore: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!walletBefore) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (walletBefore.cash_usd + EPS < usd) {
    logAudit(req.user!.userId, "rejected", usd, "insufficient_balance", { side: "buy", cashUsd: walletBefore.cash_usd })
    return res.status(400).json({ error: "Недостаточно cash_usd" })
  }

  const state: any = getMarketState()
  if (!state) return res.status(500).json({ error: "Рынок TimeCoin не инициализирован" })

  const book = getOrderBook(50)
  const bestAsk = book.asks[0]?.price ?? state.price
  // Лимитная цена с запасом, чтобы гарантированно "съесть" весь доступный ask-объём в рамках usd-бюджета
  const marketLimitPrice = Math.max(bestAsk * 1.5, state.price * 1.5)
  const approxAmount = usd / (book.asks[0]?.price ?? state.price)

  let orderTrades: TradeRow[] = []
  let orderbookExecutedUsd = 0
  let orderbookExecutedTc = 0

  if (approxAmount > EPS) {
    try {
      const result = createLimitOrder(req.user!.userId, "buy", marketLimitPrice, approxAmount)
      orderTrades = result.trades

      // Остаток лимитки (не исполненный против стакана) — отменяем, это market-заказ, не лимитка
      if (result.remaining > EPS) {
        try {
          cancelOrder(req.user!.userId, result.order.id)
        } catch {
          /* ignore */
        }
      }

      orderbookExecutedTc = orderTrades.reduce((s, t) => s + t.amount, 0)
      orderbookExecutedUsd = orderTrades.reduce((s, t) => s + t.amount * t.price, 0)
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Не удалось выполнить покупку" })
    }
  }

  // Fallback: остаток бюджета (usd - orderbookExecutedUsd), не исполненный против стакана,
  // докупаем через эмиссию TimeCoin по текущей цене рынка (с небольшим price impact).
  const remainingUsd = usd - orderbookExecutedUsd
  let mintTc = 0
  let mintUsd = 0
  let newPrice = state.price

  // Эмиссия (mint) не обеспечена резервом — докупаем через неё только пока
  // казна покрывает весь ∞ в обращении 1:1. Если нет, остаток заявки просто
  // не исполняется через mint (частичное исполнение против стакана — не бага,
  // а намеренное ограничение необеспеченного начисления).
  if (remainingUsd > EPS) {
    const currentState: any = getMarketState()
    const fallbackPrice = currentState.price
    const candidateMintTc = remainingUsd / fallbackPrice

    // Частичное исполнение под потолком TC_TOTAL_CAP: если оставшегося "места" до
    // потолка меньше, чем кандидат на минт, минтим только оставшееся место (и
    // списываем/зачисляем пропорционально меньшую сумму), а не всё remainingUsd.
    const capRemaining = Math.max(0, TC_TOTAL_CAP - currentState.minted)
    const cappedMintTc = Math.min(candidateMintTc, capRemaining)

    if (cappedMintTc > EPS && (await canEmitUnbacked(cappedMintTc))) {
      mintTc = cappedMintTc
      mintUsd = mintTc * fallbackPrice
      newPrice = Math.round(fallbackPrice * (1 + PRICE_IMPACT_FACTOR * mintTc) * 1e6) / 1e6

      const now = Date.now()

      db.prepare(`UPDATE wallets SET cash_usd = cash_usd - ?, timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(
        mintUsd,
        mintTc,
        now,
        req.user!.userId,
      )

      db.prepare(`UPDATE tc_market_state SET price = ?, minted = minted + ? WHERE id = 1`).run(newPrice, mintTc)
      db.prepare(`INSERT INTO tc_price_history (ts, price) VALUES (?, ?)`).run(now, newPrice)

      db.prepare(
        `INSERT INTO tc_trades (user_id, ts, price, amount, side, origin) VALUES (?, ?, ?, ?, 'buy', 'emission')`,
      ).run(req.user!.userId, now, newPrice, mintTc)
    }
  }

  const totalTc = orderbookExecutedTc + mintTc
  const totalUsd = orderbookExecutedUsd + mintUsd

  if (totalTc <= EPS) {
    return res.status(400).json({ error: "Не удалось выполнить покупку" })
  }

  const avgPrice = totalUsd / totalTc

  db.prepare(
    `INSERT INTO tc_transactions (user_id, kind, amount_tc, amount_usd, price, ts) VALUES (?, 'buy', ?, ?, ?, ?)`,
  ).run(req.user!.userId, totalTc, totalUsd, avgPrice, Date.now())

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'tc_buy', 'TimeCoin', 'TC Market', ?, 'timecoin', 'done')`,
  ).run(req.user!.userId, totalTc)
  logAudit(req.user!.userId, "debit", totalUsd, "tc_market_buy", { tcAmount: totalTc, avgPrice, orderbookAmount: orderbookExecutedTc, emissionAmount: mintTc })

  const finalState: any = getMarketState()

  res.json({
    wallet: getWallet(req.user!.userId),
    trade: {
      side: "buy",
      price: avgPrice,
      tcAmount: totalTc,
      usdAmount: totalUsd,
      newPrice: finalState.price,
      orderbookAmount: orderbookExecutedTc,
      emissionAmount: mintTc,
    },
    trades: orderTrades,
  })
})

/* ================================================================
   POST /tc-market/sell — маркет-продажа.
   Исполняется против стакана, а недостающий объём (если bids не
   хватило) — сжигается (burn) TimeCoin по текущей цене рынка с
   небольшим price-impact, чтобы гарантировать продажу всего tcAmount.
   ================================================================ */
router.post("/sell", requireAuth, (req: AuthRequest, res) => {
  const { tcAmount } = req.body || {}
  const tc = Number(tcAmount)
  if (!Number.isFinite(tc) || tc <= 0) {
    return res.status(400).json({ error: "Некорректное количество TimeCoin" })
  }

  const walletBefore: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!walletBefore) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (walletBefore.timecoin + EPS < tc) {
    logAudit(req.user!.userId, "rejected", tc, "insufficient_balance", { side: "sell", timecoin: walletBefore.timecoin })
    return res.status(400).json({ error: "Недостаточно TimeCoin" })
  }

  const state: any = getMarketState()
  if (!state) return res.status(500).json({ error: "Рынок TimeCoin не инициализирован" })

  const book = getOrderBook(50)
  const bestBid = book.bids[0]?.price ?? state.price
  // Лимитная цена с запасом вниз, чтобы гарантированно "съесть" весь доступный bid-объём
  const marketLimitPrice = Math.max(0.01, Math.min(bestBid * 0.5, state.price * 0.5))

  let orderTrades: TradeRow[] = []
  let orderbookExecutedTc = 0
  let orderbookExecutedUsd = 0

  try {
    const result = createLimitOrder(req.user!.userId, "sell", marketLimitPrice, tc)
    orderTrades = result.trades

    if (result.remaining > EPS) {
      try {
        cancelOrder(req.user!.userId, result.order.id)
      } catch {
        /* ignore */
      }
    }

    orderbookExecutedTc = orderTrades.reduce((s, t) => s + t.amount, 0)
    orderbookExecutedUsd = orderTrades.reduce((s, t) => s + t.amount * t.price, 0)
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Не удалось выполнить продажу" })
  }

  // Fallback: остаток TC, не исполненный против стакана, сжигаем (burn) по текущей цене рынка.
  const remainingTc = tc - orderbookExecutedTc
  let burnTc = 0
  let burnUsd = 0
  let newPrice = state.price

  if (remainingTc > EPS) {
    const currentState: any = getMarketState()
    const fallbackPrice = currentState.price
    burnTc = remainingTc
    burnUsd = burnTc * fallbackPrice
    newPrice = Math.round(fallbackPrice * (1 - PRICE_IMPACT_FACTOR * burnTc) * 1e6) / 1e6
    if (newPrice <= 0) newPrice = fallbackPrice * 0.01

    const now = Date.now()

    db.prepare(`UPDATE wallets SET timecoin = timecoin - ?, cash_usd = cash_usd + ?, updated_at = ? WHERE user_id = ?`).run(
      burnTc,
      burnUsd,
      now,
      req.user!.userId,
    )

    db.prepare(`UPDATE tc_market_state SET price = ?, burned = burned + ? WHERE id = 1`).run(newPrice, burnTc)
    db.prepare(`INSERT INTO tc_price_history (ts, price) VALUES (?, ?)`).run(now, newPrice)

    db.prepare(
      `INSERT INTO tc_trades (user_id, ts, price, amount, side, origin) VALUES (?, ?, ?, ?, 'sell', 'burn')`,
    ).run(req.user!.userId, now, newPrice, burnTc)
  }

  const totalTc = orderbookExecutedTc + burnTc
  const totalUsd = orderbookExecutedUsd + burnUsd

  if (totalTc <= EPS) {
    return res.status(400).json({ error: "Не удалось выполнить продажу" })
  }

  const avgPrice = totalUsd / totalTc

  db.prepare(
    `INSERT INTO tc_transactions (user_id, kind, amount_tc, amount_usd, price, ts) VALUES (?, 'sell', ?, ?, ?, ?)`,
  ).run(req.user!.userId, totalTc, totalUsd, avgPrice, Date.now())

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'tc_sell', 'TimeCoin', 'TC Market', ?, 'cash_usd', 'done')`,
  ).run(req.user!.userId, totalUsd)
  logAudit(req.user!.userId, "credit", totalUsd, "tc_market_sell", { tcAmount: totalTc, avgPrice, orderbookAmount: orderbookExecutedTc, burnAmount: burnTc })

  const finalState: any = getMarketState()

  res.json({
    wallet: getWallet(req.user!.userId),
    trade: {
      side: "sell",
      price: avgPrice,
      tcAmount: totalTc,
      usdAmount: totalUsd,
      newPrice: finalState.price,
      orderbookAmount: orderbookExecutedTc,
      burnAmount: burnTc,
    },
    trades: orderTrades,
  })
})

export default router
