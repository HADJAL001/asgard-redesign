import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { rateLimit } from "../middleware/rateLimiter"
import { asyncHandler } from "../utils/async-handler"
import { AuthService } from "../services/auth.service"
import { TwoFAService } from "../services/twofa.service"
import { SolanaService } from "../services/solana.service"
import { transferSchema } from "../validators/transfer.validator"
import { logAudit } from "../lib/audit"
import { CRAFT_MATERIALS, MATERIAL_OFFERS, type CraftMaterial } from "../lib/economy-policy"

const router = Router()
const solanaService = new SolanaService()

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

router.post("/materials/buy", requireAuth, (req: AuthRequest, res) => {
  const material = String(req.body?.material || "") as CraftMaterial
  const packs = Number(req.body?.packs)
  if (!CRAFT_MATERIALS.includes(material) || !Number.isInteger(packs) || packs < 1 || packs > 100) return res.status(400).json({ error: "Invalid material purchase" })
  const offer = MATERIAL_OFFERS[material]
  const credits = offer.credits * packs
  const quantity = offer.quantity * packs
  const result = db.prepare(`UPDATE wallets SET credits = credits - ?, ${material} = ${material} + ?, updated_at = ? WHERE user_id = ? AND credits >= ?`).run(credits, quantity, Date.now(), req.user!.userId, credits)
  if (result.changes !== 1) return res.status(400).json({ error: "Insufficient credits" })
  db.prepare(`INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status) VALUES (?, 'material_purchase', ?, 'Forge', ?, 'credits', 'done')`).run(req.user!.userId, `${quantity} ${material}`, credits)
  logAudit(req.user!.userId, "debit", credits, "material_purchase", { material, quantity })
  const wallet = db.prepare(`SELECT credits, shards, crystals, timecoin, cash_usd, updated_at as updatedAt FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  res.status(201).json({ wallet, material, quantity, credits })
})

/* ================================================================
   GET /wallet/tc-balance — резерв казначейства (on-chain TC) и личный
   баланс ∞ пользователя, для карточки «TimeCoin · Solana» на /wallet.
   reserveBalance = null, если Solana не сконфигурирована на бэкенде
   (фронтенд рисует «—» вместо падения запроса).
   ================================================================ */
router.get("/tc-balance", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const wallet: any = db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })

  let reserveBalance: number | null = null
  if (solanaService.isAvailable) {
    try {
      reserveBalance = await solanaService.getTreasuryBalance()
    } catch {
      reserveBalance = null
    }
  }

  res.json({ reserveBalance, userBalance: wallet.timecoin })
}))

/* Legacy endpoint retained only to provide a clear migration error to older clients.
   Credits are non-transferable, materials are Forge-only, and TimeCoin trades on the market. */
router.post("/convert", requireAuth, (_req: AuthRequest, res) => {
  return res.status(410).json({
    error: "Wallet conversion is unavailable: Credits are non-transferable, materials are Forge-only, and TimeCoin trades on the market.",
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


