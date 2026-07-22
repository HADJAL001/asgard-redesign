import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { logAudit } from "../lib/audit"

const router = Router()

/* ================================================================
   GET /jarvis/shop
   Список всех аксессуаров + флаг owned для текущего пользователя.
   ================================================================ */
router.get("/shop", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const items = db
    .prepare(
      `SELECT
        a.id, a.name, a.description, a.price, a.image, a.type,
        CASE WHEN ua.id IS NULL THEN 0 ELSE 1 END as owned,
        CASE WHEN ua.equipped IS NULL THEN 0 ELSE ua.equipped END as equipped
      FROM jarvis_accessories a
      LEFT JOIN jarvis_user_accessories ua
        ON ua.accessory_id = a.id AND ua.user_id = ?
      ORDER BY a.type, a.price ASC`
    )
    .all(userId)

  res.json({ items })
})

/* ================================================================
   POST /jarvis/buy
   body: { accessoryId: number }
   Списывает ∞ (timecoin) с кошелька и выдаёт аксессуар пользователю.
   ================================================================ */
router.post("/buy", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { accessoryId } = req.body || {}

  if (!accessoryId || typeof accessoryId !== "number") {
    return res.status(400).json({ error: "Поле 'accessoryId' обязательно" })
  }

  const accessory = db
    .prepare(`SELECT * FROM jarvis_accessories WHERE id = ?`)
    .get(accessoryId) as { id: number; name: string; price: number } | undefined

  if (!accessory) {
    return res.status(404).json({ error: "Аксессуар не найден" })
  }

  const already = db
    .prepare(`SELECT id FROM jarvis_user_accessories WHERE user_id = ? AND accessory_id = ?`)
    .get(userId, accessoryId)

  if (already) {
    return res.status(400).json({ error: "Аксессуар уже куплен" })
  }

  const wallet = db
    .prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`)
    .get(userId) as { timecoin: number } | undefined

  if (!wallet || wallet.timecoin < accessory.price) {
    logAudit(userId, "rejected", accessory.price, "insufficient_balance", { accessoryId })
    return res.status(400).json({ error: "Недостаточно ∞ для покупки" })
  }

  const now = Date.now()

  db.prepare(`UPDATE wallets SET timecoin = timecoin - ? WHERE user_id = ?`).run(accessory.price, userId)
  logAudit(userId, "debit", accessory.price, "jarvis_accessory_purchase", { accessoryId, name: accessory.name })
  db.prepare(
    `INSERT INTO jarvis_user_accessories (user_id, accessory_id, equipped, purchased_at)
     VALUES (?, ?, 0, ?)`
  ).run(userId, accessoryId, now)


  const updatedWallet = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId)

  res.json({
    success: true,
    accessory: { id: accessory.id, name: accessory.name, price: accessory.price },
    wallet: updatedWallet,
  })
})

/* ================================================================
   GET /jarvis/my-accessories
   Аксессуары, принадлежащие текущему пользователю (для UI ДЖАРВИСА).
   ================================================================ */
router.get("/my-accessories", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const items = db
    .prepare(
      `SELECT a.id, a.name, a.description, a.price, a.image, a.type, ua.equipped, ua.purchased_at as purchasedAt
       FROM jarvis_user_accessories ua
       JOIN jarvis_accessories a ON a.id = ua.accessory_id
       WHERE ua.user_id = ?
       ORDER BY ua.purchased_at DESC`
    )
    .all(userId)

  res.json({ items })
})

/* ================================================================
   POST /jarvis/equip
   body: { accessoryId: number }
   Надеть аксессуар (снимает остальные того же типа).
   ================================================================ */
router.post("/equip", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { accessoryId } = req.body || {}

  if (!accessoryId || typeof accessoryId !== "number") {
    return res.status(400).json({ error: "Поле 'accessoryId' обязательно" })
  }

  const owned = db
    .prepare(
      `SELECT ua.id, a.type FROM jarvis_user_accessories ua
       JOIN jarvis_accessories a ON a.id = ua.accessory_id
       WHERE ua.user_id = ? AND ua.accessory_id = ?`
    )
    .get(userId, accessoryId) as { id: number; type: string } | undefined

  if (!owned) {
    return res.status(404).json({ error: "Аксессуар не куплен" })
  }

  db.prepare(
    `UPDATE jarvis_user_accessories SET equipped = 0
     WHERE user_id = ? AND accessory_id IN (
       SELECT a.id FROM jarvis_accessories a WHERE a.type = ?
     )`
  ).run(userId, owned.type)

  db.prepare(
    `UPDATE jarvis_user_accessories SET equipped = 1 WHERE user_id = ? AND accessory_id = ?`
  ).run(userId, accessoryId)


  res.json({ success: true })
})

export default router
