import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { rateLimit } from "../middleware/rateLimiter"
import { asyncHandler } from "../utils/async-handler"
import { AuthService } from "../services/auth.service"
import { TwoFAService } from "../services/twofa.service"
import { transferSchema } from "../validators/transfer.validator"
import { logAudit } from "../lib/audit"

const router = Router()

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
   GET /wallet/lookup-recipient?email= — поиск получателя перед
   переводом TC. Возвращает только отображаемое имя, без id/роли и
   прочих данных, чтобы не давать способ энумерации аккаунтов.
   ================================================================ */
router.get("/lookup-recipient", rateLimit(60_000, 30), requireAuth, (req: AuthRequest, res) => {
  const email = String(req.query.email || "").trim().toLowerCase()
  if (!email) return res.status(400).json({ error: "Не указан email" })

  const me: any = db.prepare(`SELECT email FROM users WHERE id = ?`).get(req.user!.userId)
  if (me?.email && String(me.email).toLowerCase() === email) {
    return res.json({ found: false, error: "Нельзя перевести самому себе" })
  }

  const recipient: any = db
    .prepare(`SELECT username, display_name FROM users WHERE lower(email) = ? AND banned = 0`)
    .get(email)

  if (!recipient) return res.json({ found: false })
  res.json({ found: true, displayName: recipient.display_name || recipient.username })
})

/* ================================================================
   POST /wallet/transfer — прямой перевод TC (∞) другому пользователю.
   body: { recipientEmail, amount, comment?, password, twofa_token? }
   Подтверждение — паролем аккаунта (+ 2FA-код, если включена),
   аналогично защите вывода TC в tc.routes.ts.
   ================================================================ */
router.post("/transfer", rateLimit(60_000, 5), requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { error: validationError } = transferSchema.validate(req.body)
  if (validationError) return res.status(400).json({ error: validationError.details[0].message })

  const { recipientEmail, amount, comment, password, twofa_token } = req.body
  const userId = req.user!.userId
  const amt = Number(amount)
  const email = String(recipientEmail).trim().toLowerCase()

  const sender: any = db
    .prepare(`SELECT email, password_hash, twofa_enabled, twofa_secret, username, display_name FROM users WHERE id = ?`)
    .get(userId)
  if (!sender) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })

  if (sender.email && String(sender.email).toLowerCase() === email) {
    return res.status(400).json({ error: "Нельзя перевести TC самому себе" })
  }

  if (!sender.password_hash || !(await AuthService.verifyPassword(password, sender.password_hash))) {
    logAudit(userId, "rejected", amt, "transfer_wrong_password")
    return res.status(403).json({ error: "Неверный пароль" })
  }

  if (sender.twofa_enabled) {
    if (!twofa_token) {
      return res.status(403).json({ error: "Требуется код 2FA (поле twofa_token)" })
    }
    if (!TwoFAService.verifyToken(sender.twofa_secret!, String(twofa_token))) {
      return res.status(403).json({ error: "Неверный код 2FA" })
    }
  }

  const recipient: any = db
    .prepare(`SELECT id, username, display_name FROM users WHERE lower(email) = ? AND banned = 0`)
    .get(email)
  if (!recipient) return res.status(404).json({ error: "Получатель не найден" })

  const recipientName = recipient.display_name || recipient.username
  const senderName = sender.display_name || sender.username
  const note = (comment && String(comment).trim()) || "Перевод TC"
  const now = Date.now()

  db.exec("BEGIN IMMEDIATE")
  try {
    const debit = db
      .prepare(`UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ? AND timecoin >= ?`)
      .run(amt, now, userId, amt)
    if (debit.changes !== 1) {
      db.exec("ROLLBACK")
      const walletRow: any = db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(userId)
      logAudit(userId, "rejected", amt, "transfer_insufficient_balance", { balance: walletRow?.timecoin ?? 0 })
      return res.status(400).json({ error: `Недостаточно средств. У вас ${walletRow?.timecoin ?? 0} TC` })
    }

    db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(
      amt,
      now,
      recipient.id,
    )

    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'transfer_out', ?, ?, ?, 'timecoin', 'done')`,
    ).run(userId, note, recipientName, amt)

    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'transfer_in', ?, ?, ?, 'timecoin', 'done')`,
    ).run(recipient.id, note, senderName, amt)

    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }

  logAudit(userId, "debit", amt, "transfer_out", { recipientId: recipient.id, comment: note })
  logAudit(recipient.id, "credit", amt, "transfer_in", { senderId: userId, comment: note })

  const updatedWallet = db
    .prepare(
      `SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`,
    )
    .get(userId)

  res.json({
    wallet: updatedWallet,
    transfer: { recipientEmail: email, recipientName, amount: amt, comment: note },
  })
}))

export default router


