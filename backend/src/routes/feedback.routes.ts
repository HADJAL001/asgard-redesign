import { Router } from "express"
import db from "../lib/db"
import { optionalAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { rateLimit } from "../middleware/rateLimiter"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"
import { canEmitUnbacked } from "../lib/emission-guard"

const router = Router()

const FEEDBACK_REWARD_TC = 5 /* +5 ∞ (TimeCoin) за отправленный фидбек */
const FEEDBACK_DAILY_REWARD_LIMIT = 1 /* макс. кол-во вознаграждаемых фидбеков в сутки на пользователя */

/* ----------------------------------------------------------------
   Отправка уведомления создателю: почта (SMTP) и/или Telegram.
   Не блокирует ответ пользователю — ошибки только логируются.
   ---------------------------------------------------------------- */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ""

const SMTP_HOST = process.env.SMTP_HOST || ""
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587
const SMTP_USER = process.env.SMTP_USER || ""
const SMTP_PASS = process.env.SMTP_PASS || ""
const FEEDBACK_TO_EMAIL = process.env.FEEDBACK_TO_EMAIL || "" /* почта создателя */

async function notifyTelegram(name: string, email: string, message: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return

  const text =
    `📨 *Новый фидбек OSGARD*\n\n` +
    `👤 Имя: ${name}\n` +
    `✉️ Email: ${email}\n\n` +
    `💬 Сообщение:\n${message}`

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    })
  } catch (err) {
    captureError("[feedback] Telegram notify failed:", err)
  }
}

async function notifyEmail(name: string, email: string, message: string) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !FEEDBACK_TO_EMAIL) return

  try {
    /* nodemailer — опциональная зависимость. Если не установлена, просто логируем.
       Используем строку в динамическом import, чтобы TS не требовал типов на этапе компиляции. */
    const moduleName = "nodemailer"
    const nodemailer: any = await import(moduleName).catch(() => null)
    if (!nodemailer) {
      console.warn("[feedback] nodemailer не установлен, письмо не отправлено")
      return
    }

    const transporter = nodemailer.default.createTransport({

      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })

    await transporter.sendMail({
      from: `"OSGARD Feedback" <${SMTP_USER}>`,
      to: FEEDBACK_TO_EMAIL,
      replyTo: email,
      subject: `Новый фидбек от ${name}`,
      text: `Имя: ${name}\nEmail: ${email}\n\nСообщение:\n${message}`,
      html: `<p><b>Имя:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Сообщение:</b></p><p>${message.replace(/\n/g, "<br/>")}</p>`,
    })
  } catch (err) {
    captureError("[feedback] Email notify failed:", err)
  }
}

/* ---------------- POST /feedback ---------------- */
router.post("/", rateLimit(60_000, 5), optionalAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { name, email, message } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите имя" })
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Укажите корректный email" })
  }
  if (!message || typeof message !== "string" || message.trim().length < 5) {
    return res.status(400).json({ error: "Сообщение слишком короткое" })
  }

  const now = Date.now()
  const userId = req.user?.userId ?? null

  const result = db
    .prepare(
      `INSERT INTO feedback (user_id, name, email, message, status, created_at)
       VALUES (?, ?, ?, ?, 'new', ?)`,
    )
    .run(userId, name.trim(), email.trim(), message.trim(), now)

  let rewardGranted = false

  /* Начисляем +5 ∞ (TimeCoin) только авторизованным пользователям, не более
     FEEDBACK_DAILY_REWARD_LIMIT раз в сутки — иначе спам-фидбеки позволяли
     фармить TC без ограничений. */
  if (userId) {
    const oneDayAgo = now - 24 * 60 * 60 * 1000
    const { count: rewardedToday } = db
      .prepare(
        `SELECT COUNT(*) as count FROM transactions
         WHERE user_id = ? AND type = 'feedback_reward' AND created_at > ?`,
      )
      .get(userId, oneDayAgo) as { count: number }

    if (rewardedToday < FEEDBACK_DAILY_REWARD_LIMIT && (await canEmitUnbacked(FEEDBACK_REWARD_TC))) {
      db.prepare(
        `UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`,
      ).run(FEEDBACK_REWARD_TC, now, userId)

      db.prepare(
        `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
         VALUES (?, 'feedback_reward', 'Фидбек создателю', 'OSGARD', ?, 'timecoin', 'done')`,
      ).run(userId, FEEDBACK_REWARD_TC)
      logAudit(userId, "credit", FEEDBACK_REWARD_TC, "feedback_reward")

      rewardGranted = true
    }
  }

  /* Уведомления не блокируют ответ пользователю */
  notifyTelegram(name.trim(), email.trim(), message.trim())
  notifyEmail(name.trim(), email.trim(), message.trim())

  res.json({
    success: true,
    id: result.lastInsertRowid,
    rewardGranted,
    reward: rewardGranted ? FEEDBACK_REWARD_TC : 0,
  })
}))

export default router
