import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { sendTcFromReserve, verifyTcTransferToReserve } from "../lib/solana"
import { rateLimit } from "../middleware/rateLimiter"
import { asyncHandler } from "../utils/async-handler"

const router = Router()

/* Курс конвертации ∞ (внутренняя валюта, wallets.timecoin) ↔ TC (SPL-токен на Solana).
   1:1, т.к. ∞ — это учётная запись того же TC, обеспеченного резервным пулом. */
const TC_CONVERT_FEE = 0.005 // 0.5% комиссия за конвертацию через резервный пул


type CurrencyKey = "credits" | "shards" | "crystals" | "timecoin" | "cash_usd"
const CURRENCIES: CurrencyKey[] = ["credits", "shards", "crystals", "timecoin", "cash_usd"]

/* Базовые курсы валют к cash_usd (условные, для конвертации между собой) */
const RATE_TO_USD: Record<CurrencyKey, number> = {
  credits: 0.01,
  shards: 0.1,
  crystals: 1,
  timecoin: 12.4,
  cash_usd: 1,
}

const CONVERT_FEE = 0.01 // 1% комиссия

/* ---------------- GET /wallet ---------------- */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const wallet = db
    .prepare(
      `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt
       FROM wallets WHERE user_id = ?`,
    )
    .get(req.user!.userId)

  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  res.json({ wallet })
})

/* ---------------- POST /wallet/convert ---------------- */
router.post("/convert", requireAuth, (req: AuthRequest, res) => {
  const { from, to, amount } = req.body || {}

  if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to)) {
    return res.status(400).json({ error: "Некорректная валюта" })
  }
  if (from === to) {
    return res.status(400).json({ error: "Валюты должны отличаться" })
  }
  if (from === "timecoin" || to === "timecoin") {
    return res.status(400).json({
      error: "TimeCoin нельзя конвертировать. Только покупка на бирже за $ или продажа артефактов.",
    })
  }

  const amt = Number(amount)
  if (!amt || amt <= 0) {
    return res.status(400).json({ error: "Некорректная сумма" })
  }

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })

  if (wallet[from] < amt) {
    return res.status(400).json({ error: "Недостаточно средств" })
  }

  const amountAfterFee = amt * (1 - CONVERT_FEE)
  const usdValue = amountAfterFee * RATE_TO_USD[from as CurrencyKey]
  const received = usdValue / RATE_TO_USD[to as CurrencyKey]

  const newFrom = wallet[from] - amt
  const newTo = wallet[to] + received

  db.prepare(`UPDATE wallets SET ${from} = ?, ${to} = ?, updated_at = ? WHERE user_id = ?`).run(
    newFrom,
    newTo,
    Date.now(),
    req.user!.userId,
  )

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'convert', ?, ?, ?, ?, 'done')`,
  ).run(req.user!.userId, `${from} → ${to}`, "Обмен валют", amt, from)

  const updatedWallet = db
    .prepare(
      `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt
       FROM wallets WHERE user_id = ?`,
    )
    .get(req.user!.userId)

  res.json({
    wallet: updatedWallet,
    conversion: { from, to, amountSent: amt, amountReceived: received, fee: CONVERT_FEE },
  })
})

/* ================================================================
   POST /wallet/convert-to-tc — ∞ → TC
   ----------------------------------------------------------------
   1. Списываем ∞ (wallets.timecoin) в БД.
   2. Переводим TC из резервного пула на Solana-адрес пользователя.
   3. Если on-chain перевод не удался — откатываем списание ∞.
   body: { amount: number, solanaAddress: string }
   ================================================================ */
// 5 выводов в минуту с одного IP — защита от flood-атак на резервный пул
router.post("/convert-to-tc", rateLimit(60_000, 5), requireAuth, async (req: AuthRequest, res) => {
  const { amount, solanaAddress } = req.body || {}
  const userId = req.user!.userId

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "Некорректная сумма" })
  }
  if (!solanaAddress || typeof solanaAddress !== "string") {
    return res.status(400).json({ error: "Не указан Solana-адрес получателя" })
  }

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (wallet.timecoin < amt) {
    return res.status(400).json({ error: "Недостаточно ∞ на балансе" })
  }

  const tcToSend = amt * (1 - TC_CONVERT_FEE)

  // 1. Списываем ∞ сразу (пессимистично), чтобы избежать двойной траты.
  const now = Date.now()
  db.prepare(`UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`).run(amt, now, userId)

  try {
    // 2. Переводим TC из резервного пула на Solana-кошелёк пользователя.
    const signature = await sendTcFromReserve(solanaAddress, tcToSend)

    db.prepare(
      `INSERT INTO tc_convert_log (user_id, direction, amount, solana_address, tx_signature, status)
       VALUES (?, 'to_tc', ?, ?, ?, 'done')`,
    ).run(userId, tcToSend, solanaAddress, signature)

    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'convert_to_tc', '∞ → TC', ?, ?, 'timecoin', 'done')`,
    ).run(userId, solanaAddress, amt)

    const updatedWallet = db
      .prepare(
        `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`,
      )
      .get(userId)

    return res.json({
      wallet: updatedWallet,
      conversion: {
        direction: "to_tc",
        amountSpentInfinity: amt,
        amountSentTc: tcToSend,
        fee: TC_CONVERT_FEE,
        solanaAddress,
        txSignature: signature,
      },
    })
  } catch (err: any) {
    // 3. Откат: возвращаем ∞ пользователю, если on-chain перевод не удался.
    db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(
      amt,
      Date.now(),
      userId,
    )

    db.prepare(
      `INSERT INTO tc_convert_log (user_id, direction, amount, solana_address, tx_signature, status)
       VALUES (?, 'to_tc', ?, ?, NULL, 'failed')`,
    ).run(userId, tcToSend, solanaAddress)

    return res.status(500).json({
      error: err.message || "Не удалось отправить TC из резервного пула. ∞ возвращены на баланс.",
    })
  }
})

/* ================================================================
   POST /wallet/convert-from-tc — TC → ∞
   ----------------------------------------------------------------
   Пользователь заранее переводит TC на адрес резервного пула через
   свой Solana-кошелёк (Phantom/Solflare) и присылает нам signature
   этой транзакции. Мы проверяем её on-chain и, если валидна,
   зачисляем эквивалент в ∞ на внутренний баланс.
   body: { amount: number, txSignature: string }
   ================================================================ */
router.post("/convert-from-tc", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { amount, txSignature } = req.body || {}
  const userId = req.user!.userId

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "Некорректная сумма" })
  }
  if (!txSignature || typeof txSignature !== "string") {
    return res.status(400).json({ error: "Не указана подпись транзакции (txSignature)" })
  }

  // Защита от повторного использования одной и той же транзакции: захватываем
  // tx_signature через INSERT под UNIQUE-индексом ДО on-chain проверки, чтобы
  // два параллельных запроса с одинаковой подписью не могли оба пройти проверку
  // "already used" и оба зачислить средства (TOCTOU race condition).
  try {
    db.prepare(
      `INSERT INTO tc_convert_log (user_id, direction, amount, solana_address, tx_signature, status)
       VALUES (?, 'from_tc', ?, NULL, ?, 'pending')`,
    ).run(userId, amt, txSignature)
  } catch (err: any) {
    if (String(err.message || "").includes("UNIQUE")) {
      return res.status(409).json({ error: "Эта транзакция уже была использована для конвертации" })
    }
    throw err
  }

  try {
    // 1. Проверяем транзакцию on-chain: TC действительно пришёл в резерв.
    const { amount: verifiedAmount, from } = await verifyTcTransferToReserve(txSignature, amt)

    const infinityToCredit = verifiedAmount * (1 - TC_CONVERT_FEE)
    const now = Date.now()

    // 2. Зачисляем ∞ пользователю и подтверждаем лог атомарно в одной транзакции.
    db.exec("BEGIN IMMEDIATE")
    try {
      db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(
        infinityToCredit,
        now,
        userId,
      )

      db.prepare(
        `UPDATE tc_convert_log SET amount = ?, solana_address = ?, status = 'done' WHERE tx_signature = ?`,
      ).run(verifiedAmount, from, txSignature)

      db.prepare(
        `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
         VALUES (?, 'convert_from_tc', 'TC → ∞', ?, ?, 'timecoin', 'done')`,
      ).run(userId, from, infinityToCredit)

      db.exec("COMMIT")
    } catch (txErr) {
      db.exec("ROLLBACK")
      throw txErr
    }

    const updatedWallet = db
      .prepare(
        `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`,
      )
      .get(userId)

    return res.json({
      wallet: updatedWallet,
      conversion: {
        direction: "from_tc",
        amountReceivedTc: verifiedAmount,
        amountCreditedInfinity: infinityToCredit,
        fee: TC_CONVERT_FEE,
        from,
        txSignature,
      },
    })
  } catch (err: any) {
    // Проверка/зачисление не удались — снимаем "pending"-захват подписи,
    // чтобы пользователь мог повторить попытку конвертации той же транзакции.
    db.prepare(`DELETE FROM tc_convert_log WHERE tx_signature = ? AND status = 'pending'`).run(txSignature)
    return res.status(400).json({ error: err.message || "Не удалось проверить транзакцию TC" })
  }
}))

/* ================================================================
   GET /wallet/tc-balance — баланс резервного пула TC на Solana.
   Не требует авторизации (публичная информация о резерве),
   но на всякий случай оставляем requireAuth для консистентности.
   ================================================================ */
router.get("/tc-balance", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const { getReserveBalance } = await import("../lib/solana")
    const balance = await getReserveBalance()
    return res.json({ reserveBalance: balance })
  } catch (err: any) {
    return res.status(503).json({ error: err.message || "Не удалось получить баланс резерва TC" })
  }
})

export default router


