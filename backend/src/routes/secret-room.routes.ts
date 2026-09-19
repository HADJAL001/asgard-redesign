import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import stripe, { FRONTEND_URL, isStripeConfigured, STRIPE_WEBHOOK_SECRET_SECRET_ROOM } from "../lib/stripe"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"

/* ================================================================
   OSGARD · Secret Room API — супер-тайная приватная комната
   ----------------------------------------------------------------
   Платный вход: $99 разово + $9/мес (access_until продлевается на 30
   дней при оплате). Кастомизация: фон + предметы (мебель/картины). До
   3 друзей бесплатно (friend_slots), далее +$49 за слот.

   Эндпоинты /unlock, /friend-slots/buy и платный /members представляют
   ГРАНТ после успешной оплаты — сюда подключается вебхук платёжки
    (Stripe) как источник истины по факту оплаты.
   ================================================================ */

const router = Router()

export const ROOM_PRICING = {
  entryUsd: 99, // разовый вход
  monthlyUsd: 9, // содержание в месяц
  extraFriendUsd: 49, // за каждого друга сверх бесплатных
  freeFriendSlots: 3,
  periodDays: 30,
}

const DAY_MS = 24 * 60 * 60 * 1000

type RoomCheckoutKind = "access" | "friend_slot"

function grantRoomAccess(userId: number, accessUntil: number) {
  const now = Date.now()
  const existing = roomOf(userId)
  if (existing) {
    db.prepare(`UPDATE secret_rooms SET access_until = MAX(access_until, ?), updated_at = ? WHERE owner_id = ?`).run(accessUntil, now, userId)
  } else {
    db.prepare(
      `INSERT INTO secret_rooms (owner_id, name, background, items, friend_slots, access_until, created_at, updated_at)
       VALUES (?, 'Secret Room', 'nebula', '[]', ?, ?, ?, ?)`,
    ).run(userId, ROOM_PRICING.freeFriendSlots, accessUntil, now, now)
  }
}

/** Допустимые фоны и каталог предметов — валидируем ввод против них. */
const BACKGROUNDS = ["nebula", "noir", "gold", "matrix", "sunset", "aurora"]
const ITEM_TYPES = ["sofa", "lamp", "plant", "painting", "shelf", "rug", "throne", "aquarium", "piano", "safe", "trophy", "crystal"]

function roomOf(userId: number): any {
  return db.prepare(`SELECT * FROM secret_rooms WHERE owner_id = ?`).get(userId)
}
function membersOf(roomId: number): any[] {
  return db
    .prepare(
      `SELECT m.user_id AS userId, u.username, u.display_name AS displayName, m.added_at AS addedAt
       FROM secret_room_members m JOIN users u ON u.id = m.user_id
       WHERE m.room_id = ? ORDER BY m.added_at ASC`,
    )
    .all(roomId)
}
function serializeRoom(room: any) {
  let items: unknown[] = []
  try {
    items = JSON.parse(room.items || "[]")
  } catch {
    items = []
  }
  return {
    id: room.id,
    name: room.name,
    background: room.background,
    items,
    friendSlots: room.friend_slots,
    accessUntil: room.access_until,
    active: room.access_until > Date.now(),
  }
}

/* ---------------- GET /secret-room ---------------- */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const uid = req.user!.userId
  const now = Date.now()

  const own = roomOf(uid)
  if (own && own.access_until > now) {
    return res.json({ hasAccess: true, isOwner: true, room: serializeRoom(own), members: membersOf(own.id), pricing: ROOM_PRICING })
  }

  // Доступ как приглашённый друг в активную комнату
  const guest: any = db
    .prepare(
      `SELECT r.* FROM secret_rooms r JOIN secret_room_members m ON m.room_id = r.id
       WHERE m.user_id = ? AND r.access_until > ? LIMIT 1`,
    )
    .get(uid, now)
  if (guest) {
    return res.json({ hasAccess: true, isOwner: false, room: serializeRoom(guest), members: membersOf(guest.id), pricing: ROOM_PRICING })
  }

  res.json({ hasAccess: false, isOwner: false, pricing: ROOM_PRICING, expired: !!own })
})

/* ---------------- POST /secret-room/unlock — грант доступа (после оплаты $99 + $9/мес) ---------------- */
/* Stripe is the only authority that may create paid room access or slots. */
router.post("/create-checkout", requireAuth, async (req: AuthRequest, res) => {
  const kind = req.body?.kind as RoomCheckoutKind
  if (kind !== "access" && kind !== "friend_slot") return res.status(400).json({ error: "Unknown Secret Room purchase" })
  if (!isStripeConfigured || !stripe) return res.status(503).json({ error: "Payment is temporarily unavailable", code: "PAYMENT_UNAVAILABLE" })

  const userId = req.user!.userId
  const user = db.prepare(`SELECT username, email FROM users WHERE id = ?`).get(userId) as { username: string; email: string | null } | undefined
  if (!user) return res.status(404).json({ error: "User not found" })
  if (kind === "friend_slot" && (!roomOf(userId) || roomOf(userId).access_until <= Date.now())) return res.status(403).json({ error: "An active Secret Room is required" })

  try {
    const metadata = { roomPurchase: kind, userId: String(userId) }
    const common = { customer_email: user.email || undefined, success_url: `${FRONTEND_URL}/room?checkout=success`, cancel_url: `${FRONTEND_URL}/room?checkout=cancel`, metadata }
    const session = kind === "access"
      ? await stripe.checkout.sessions.create({ ...common, mode: "subscription", line_items: [
          { price_data: { currency: "usd", product_data: { name: "Secret Room entry" }, unit_amount: ROOM_PRICING.entryUsd * 100 }, quantity: 1 },
          { price_data: { currency: "usd", product_data: { name: "Secret Room membership" }, unit_amount: ROOM_PRICING.monthlyUsd * 100, recurring: { interval: "month" } }, quantity: 1 },
        ], subscription_data: { metadata } })
      : await stripe.checkout.sessions.create({ ...common, mode: "payment", line_items: [{ price_data: { currency: "usd", product_data: { name: "Secret Room friend slot" }, unit_amount: ROOM_PRICING.extraFriendUsd * 100 }, quantity: 1 }] })
    return res.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    captureError("[secret-room/create-checkout] Stripe error:", error)
    return res.status(502).json({ error: "Could not start secure checkout" })
  }
})

router.post("/webhook", async (req, res) => {
  if (!isStripeConfigured || !stripe || !STRIPE_WEBHOOK_SECRET_SECRET_ROOM) return res.status(503).json({ error: "Webhook is not configured" })
  const signature = req.headers["stripe-signature"] as string | undefined
  if (!signature) return res.status(400).json({ error: "Missing Stripe signature" })
  let event: any
  try { event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET_SECRET_ROOM) }
  catch { return res.status(400).json({ error: "Invalid Stripe signature" }) }
  const claim = db.prepare(`INSERT INTO stripe_events (id, type, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING`).run(event.id, event.type, Date.now())
  if (!claim.changes) return res.json({ received: true, duplicate: true })
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const userId = Number(session.metadata?.userId)
      const kind = session.metadata?.roomPurchase as RoomCheckoutKind
      if (!userId || (kind !== "access" && kind !== "friend_slot")) throw new Error("Missing Secret Room checkout metadata")
      if (kind === "access") {
        let accessUntil = Date.now() + ROOM_PRICING.periodDays * DAY_MS
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id
        if (subscriptionId) {
          const subscription: any = await stripe.subscriptions.retrieve(subscriptionId)
          accessUntil = Number(subscription.current_period_end) * 1000 || accessUntil
        }
        grantRoomAccess(userId, accessUntil)
        logAudit(userId, "credit", ROOM_PRICING.entryUsd, "secret_room_checkout", { stripeEventId: event.id, accessUntil })
      } else {
        const room = roomOf(userId)
        if (!room || room.access_until <= Date.now()) throw new Error("Room was inactive when paid slot completed")
        db.prepare(`UPDATE secret_rooms SET friend_slots = friend_slots + 1, updated_at = ? WHERE id = ?`).run(Date.now(), room.id)
        logAudit(userId, "credit", ROOM_PRICING.extraFriendUsd, "secret_room_friend_slot", { stripeEventId: event.id })
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object
      if (subscription.metadata?.roomPurchase === "access" && Number(subscription.metadata?.userId) && ["active", "trialing"].includes(subscription.status)) grantRoomAccess(Number(subscription.metadata.userId), Number(subscription.current_period_end) * 1000)
    }
    return res.json({ received: true })
  } catch (error) {
    db.prepare(`DELETE FROM stripe_events WHERE id = ?`).run(event.id)
    captureError("[secret-room/webhook] handler error:", error)
    return res.status(500).json({ error: "Webhook processing failed" })
  }
})

router.post("/unlock", requireAuth, (req: AuthRequest, res) => {
  // A client request is never payment proof. This endpoint used to mint paid
  // access for free; grants must now originate in a verified billing webhook.
  return res.status(402).json({
    error: "Payment verification is required before Secret Room access is granted",
    code: "PAYMENT_REQUIRED",
    pricing: ROOM_PRICING,
  })
  /*
  const uid = req.user!.userId
  const now = Date.now()
  const existing = roomOf(uid)
  const base = existing && existing.access_until > now ? existing.access_until : now
  const accessUntil = base + ROOM_PRICING.periodDays * DAY_MS

  if (existing) {
    db.prepare(`UPDATE secret_rooms SET access_until = ?, updated_at = ? WHERE owner_id = ?`).run(accessUntil, now, uid)
  } else {
    db.prepare(
      `INSERT INTO secret_rooms (owner_id, name, background, items, friend_slots, access_until, created_at, updated_at)
       VALUES (?, 'Тайная комната', 'nebula', '[]', ?, ?, ?, ?)`,
    ).run(uid, ROOM_PRICING.freeFriendSlots, accessUntil, now, now)
  }
  const room = roomOf(uid)
  res.json({ ok: true, room: serializeRoom(room), members: membersOf(room.id), pricing: ROOM_PRICING })
  */
})

/* ---------------- PATCH /secret-room — кастомизация (владелец) ---------------- */
router.patch("/", requireAuth, (req: AuthRequest, res) => {
  const uid = req.user!.userId
  const room = roomOf(uid)
  if (!room || room.access_until <= Date.now()) {
    return res.status(403).json({ error: "Нет активного доступа к комнате" })
  }
  const { name, background, items } = req.body || {}

  const nextName = typeof name === "string" && name.trim() ? name.trim().slice(0, 40) : room.name
  const nextBg = typeof background === "string" && BACKGROUNDS.includes(background) ? background : room.background

  let nextItems = room.items
  if (Array.isArray(items)) {
    const clean = items
      .filter((it: any) => it && ITEM_TYPES.includes(it.type))
      .slice(0, 60)
      .map((it: any) => ({
        type: it.type,
        x: Math.max(0, Math.min(100, Number(it.x) || 0)),
        y: Math.max(0, Math.min(100, Number(it.y) || 0)),
      }))
    nextItems = JSON.stringify(clean)
  }

  db.prepare(`UPDATE secret_rooms SET name = ?, background = ?, items = ?, updated_at = ? WHERE owner_id = ?`).run(
    nextName,
    nextBg,
    nextItems,
    Date.now(),
    uid,
  )
  res.json({ ok: true, room: serializeRoom(roomOf(uid)) })
})

/* ---------------- POST /secret-room/friend-slots/buy — купить +1 слот ($49) ---------------- */
router.post("/friend-slots/buy", requireAuth, (req: AuthRequest, res) => {
  const uid = req.user!.userId
  const room = roomOf(uid)
  if (!room || room.access_until <= Date.now()) {
    return res.status(403).json({ error: "Нет активного доступа к комнате" })
  }
  db.prepare(`UPDATE secret_rooms SET friend_slots = friend_slots + 1, updated_at = ? WHERE owner_id = ?`).run(Date.now(), uid)
  res.json({ ok: true, room: serializeRoom(roomOf(uid)) })
})

/* ---------------- POST /secret-room/members — добавить друга ---------------- */
router.post("/members", requireAuth, (req: AuthRequest, res) => {
  const uid = req.user!.userId
  const room = roomOf(uid)
  if (!room || room.access_until <= Date.now()) {
    return res.status(403).json({ error: "Нет активного доступа к комнате" })
  }
  const { username } = req.body || {}
  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Укажите имя пользователя друга" })
  }
  const friend: any = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username.trim())
  if (!friend) return res.status(404).json({ error: "Пользователь не найден" })
  if (friend.id === uid) return res.status(400).json({ error: "Нельзя добавить самого себя" })

  const already = db.prepare(`SELECT 1 FROM secret_room_members WHERE room_id = ? AND user_id = ?`).get(room.id, friend.id)
  if (already) return res.status(400).json({ error: "Друг уже в комнате" })

  const count: any = db.prepare(`SELECT COUNT(*) AS c FROM secret_room_members WHERE room_id = ?`).get(room.id)
  if (count.c >= room.friend_slots) {
    return res.status(402).json({
      error: `Свободных слотов нет. Купите слот за $${ROOM_PRICING.extraFriendUsd}, чтобы добавить ещё друзей.`,
      code: "NEED_SLOT",
      pricing: ROOM_PRICING,
    })
  }

  db.prepare(`INSERT INTO secret_room_members (room_id, user_id, added_at) VALUES (?, ?, ?)`).run(room.id, friend.id, Date.now())
  res.json({ ok: true, members: membersOf(room.id) })
})

/* ---------------- DELETE /secret-room/members/:userId — убрать друга ---------------- */
router.delete("/members/:userId", requireAuth, (req: AuthRequest, res) => {
  const uid = req.user!.userId
  const room = roomOf(uid)
  if (!room) return res.status(404).json({ error: "Комната не найдена" })
  db.prepare(`DELETE FROM secret_room_members WHERE room_id = ? AND user_id = ?`).run(room.id, Number(req.params.userId))
  res.json({ ok: true, members: membersOf(room.id) })
})

export default router
