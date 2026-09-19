import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import stripe, { FRONTEND_URL, isStripeConfigured, STRIPE_WEBHOOK_SECRET_SECRET_ROOM } from "../lib/stripe"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"
import { createNotification } from "../lib/notifications"

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
const CREATOR_MESSAGE_MAX_LENGTH = 2_000
const MAX_AVATAR_GLTF_BYTES = 512 * 1024

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
    avatarGltf: typeof room.avatar_gltf === "string" ? room.avatar_gltf : null,
    friendSlots: room.friend_slots,
    accessUntil: room.access_until,
    active: room.access_until > Date.now(),
  }
}

/** Accept only compact, self-contained glTF JSON. No external URLs, images,
 * animations, or extension code can be pulled into another member's browser. */
function validateAvatarGltf(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_AVATAR_GLTF_BYTES) {
    throw new Error("Avatar must be a glTF JSON file smaller than 512 KB")
  }
  let document: any
  try { document = JSON.parse(value) } catch { throw new Error("Avatar is not valid glTF JSON") }
  if (!document || document.asset?.version !== "2.0" || !Array.isArray(document.scenes) || !Array.isArray(document.nodes)) {
    throw new Error("Avatar must use glTF 2.0")
  }
  const arrays = [document.nodes, document.meshes, document.accessors, document.bufferViews, document.buffers]
  const limits = [64, 32, 128, 128, 1]
  if (arrays.some((items, index) => items !== undefined && (!Array.isArray(items) || items.length > limits[index]))) {
    throw new Error("Avatar exceeds the room complexity limit")
  }
  if ((document.images?.length || document.animations?.length || document.extensionsRequired?.length)) {
    throw new Error("Avatar cannot include textures, animations, or required extensions")
  }
  const buffers = document.buffers || []
  const byteLength = buffers.reduce((total: number, buffer: any) => total + Math.max(0, Number(buffer?.byteLength) || 0), 0)
  if (byteLength > MAX_AVATAR_GLTF_BYTES || buffers.some((buffer: any) => typeof buffer?.uri !== "string" || !buffer.uri.startsWith("data:application/"))) {
    throw new Error("Avatar must embed its geometry and cannot load external files")
  }
  return value
}
function logRoomActivity(roomId: number, actorId: number | null, kind: string, detail = "") {
  db.prepare(`INSERT INTO secret_room_activity (room_id, actor_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)`).run(roomId, actorId, kind, detail.slice(0, 160), Date.now())
}
function activityOf(roomId: number): any[] {
  return db.prepare(`SELECT a.id, a.kind, a.detail, a.created_at AS createdAt, u.username, u.display_name AS displayName
    FROM secret_room_activity a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.room_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 30`).all(roomId)
}

function accessibleRoom(userId: number): any {
  const own = roomOf(userId)
  if (own?.access_until > Date.now()) return own
  return db.prepare(`SELECT r.* FROM secret_rooms r JOIN secret_room_members m ON m.room_id = r.id WHERE m.user_id = ? AND r.access_until > ? LIMIT 1`).get(userId, Date.now())
}

function serializeEvent(event: any, viewerId: number) {
  const attendees = (db.prepare(`SELECT COUNT(*) AS count FROM secret_room_event_attendees WHERE event_id = ?`).get(event.id) as any).count
  const booked = !!db.prepare(`SELECT 1 FROM secret_room_event_attendees WHERE event_id = ? AND user_id = ?`).get(event.id, viewerId)
  return { id: event.id, title: event.title, description: event.description, startsAt: event.starts_at, capacity: event.capacity, priceTimecoin: event.price_timecoin, status: event.status, attendeeCount: attendees, booked, isOwner: event.owner_id === viewerId }
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

router.get("/events", requireAuth, (req: AuthRequest, res) => {
  const room = accessibleRoom(req.user!.userId)
  if (!room) return res.status(403).json({ error: "An active Secret Room invitation is required" })
  const events = db.prepare(`SELECT * FROM secret_room_events WHERE room_id = ? AND (status = 'active' OR owner_id = ?) ORDER BY starts_at ASC`).all(room.id, req.user!.userId)
  res.json({ events: events.map((event: any) => serializeEvent(event, req.user!.userId)) })
})

router.get("/activity", requireAuth, (req: AuthRequest, res) => {
  const room = accessibleRoom(req.user!.userId)
  if (!room) return res.status(403).json({ error: "An active Secret Room invitation is required" })
  res.json({ activity: activityOf(room.id) })
})

/* ---------------- POST /secret-room/creator-line ----------------
   Members receive a real private line to the team. It deliberately reuses the
   audited direct-message ledger: replies arrive in the user's normal inbox. */
router.post("/creator-line", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  if (!accessibleRoom(userId)) return res.status(403).json({ error: "An active Secret Room invitation is required" })
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : ""
  if (!text || text.length > CREATOR_MESSAGE_MAX_LENGTH) {
    return res.status(400).json({ error: `Message must contain 1 to ${CREATOR_MESSAGE_MAX_LENGTH} characters` })
  }

  const creator = db.prepare(
    `SELECT id, username, display_name AS displayName, avatar_url AS avatarUrl
       FROM users
      WHERE role = 'admin' AND COALESCE(banned, 0) = 0 AND id <> ?
      ORDER BY id ASC LIMIT 1`,
  ).get(userId) as { id: number; username: string; displayName: string | null; avatarUrl: string | null } | undefined
  if (!creator) return res.status(503).json({ error: "The creator line is temporarily unavailable" })

  const createdAt = Date.now()
  const result = db.prepare(
    `INSERT INTO direct_messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)`,
  ).run(userId, creator.id, text, createdAt)
  const messageId = Number(result.lastInsertRowid)
  createNotification({
    userId: creator.id,
    actorId: userId,
    type: "message",
    entityType: "secret_room_creator_line",
    entityId: messageId,
    text: "New message from a Secret Room member",
  })
  logAudit(userId, "credit", 0, "secret_room_creator_message", { messageId, recipientId: creator.id })
  res.status(201).json({
    message: { id: messageId, text, createdAt, mine: true, readAt: null },
    creator: { userId: creator.id, username: creator.username, displayName: creator.displayName || creator.username, avatarUrl: creator.avatarUrl },
  })
})

router.post("/events", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const room = roomOf(userId)
  if (!room || room.access_until <= Date.now()) return res.status(403).json({ error: "Only the active room owner can create an event" })
  const { title, description, startsAt, capacity, priceTimecoin } = req.body || {}
  const start = Number(startsAt), seats = Number(capacity), price = Number(priceTimecoin)
  if (typeof title !== "string" || !title.trim() || title.trim().length > 80 || !Number.isFinite(start) || start <= Date.now() || !Number.isInteger(seats) || seats < 1 || seats > 500 || !Number.isFinite(price) || price < 0 || price > 1_000_000) return res.status(400).json({ error: "Invalid event details" })
  const now = Date.now()
  const result = db.prepare(`INSERT INTO secret_room_events (room_id, owner_id, title, description, starts_at, capacity, price_timecoin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(room.id, userId, title.trim(), typeof description === "string" ? description.trim().slice(0, 1000) : "", start, seats, price, now, now)
  const event: any = db.prepare(`SELECT * FROM secret_room_events WHERE id = ?`).get(result.lastInsertRowid)
  logRoomActivity(room.id, userId, "event_created", event.title)
  logAudit(userId, "credit", 0, "secret_room_event_created", { eventId: event.id })
  res.status(201).json({ event: serializeEvent(event, userId) })
})

router.patch("/events/:id", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId, eventId = Number(req.params.id)
  const event: any = db.prepare(`SELECT * FROM secret_room_events WHERE id = ? AND owner_id = ?`).get(eventId, userId)
  if (!event) return res.status(404).json({ error: "Event not found" })
  if (event.status !== "active") return res.status(409).json({ error: "Cancelled events cannot be changed" })
  const { title, description, startsAt, capacity } = req.body || {}
  const booked = (db.prepare(`SELECT COUNT(*) AS count FROM secret_room_event_attendees WHERE event_id = ?`).get(eventId) as any).count
  const nextTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : event.title
  const nextDescription = typeof description === "string" ? description.trim().slice(0, 1000) : event.description
  const nextStart = startsAt === undefined ? event.starts_at : Number(startsAt)
  const nextCapacity = capacity === undefined ? event.capacity : Number(capacity)
  if (!Number.isFinite(nextStart) || nextStart <= Date.now() || !Number.isInteger(nextCapacity) || nextCapacity < Math.max(1, booked) || nextCapacity > 500) return res.status(400).json({ error: "Invalid event update" })
  db.prepare(`UPDATE secret_room_events SET title = ?, description = ?, starts_at = ?, capacity = ?, updated_at = ? WHERE id = ?`).run(nextTitle, nextDescription, nextStart, nextCapacity, Date.now(), eventId)
  res.json({ event: serializeEvent(db.prepare(`SELECT * FROM secret_room_events WHERE id = ?`).get(eventId), userId) })
})

router.post("/events/:id/cancel", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId, eventId = Number(req.params.id)
  const event: any = db.prepare(`SELECT * FROM secret_room_events WHERE id = ? AND owner_id = ?`).get(eventId, userId)
  if (!event) return res.status(404).json({ error: "Event not found" })
  if (event.status === "cancelled") return res.json({ ok: true })
  const attendees = db.prepare(`SELECT user_id, paid_timecoin FROM secret_room_event_attendees WHERE event_id = ?`).all(eventId) as any[]
  if (attendees.length) return res.status(409).json({ error: "Booked events cannot be cancelled. Contact support to arrange verified refunds.", code: "EVENT_HAS_ATTENDEES" })
  db.prepare(`UPDATE secret_room_events SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(Date.now(), eventId)
  logRoomActivity(event.room_id, userId, "event_cancelled", event.title)
  logAudit(userId, "credit", 0, "secret_room_event_cancelled", { eventId })
  res.json({ ok: true })
})

router.post("/events/:id/book", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId, eventId = Number(req.params.id)
  const event: any = db.prepare(`SELECT * FROM secret_room_events WHERE id = ?`).get(eventId)
  if (!event || event.status !== "active" || event.starts_at <= Date.now()) return res.status(404).json({ error: "Event is unavailable" })
  if (event.owner_id === userId) return res.status(400).json({ error: "The room owner cannot book their own event" })
  const room = accessibleRoom(userId)
  if (!room || room.id !== event.room_id) return res.status(403).json({ error: "A room invitation is required to book this event" })
  try {
    const bookedNow = db.transaction(() => {
      if (db.prepare(`SELECT 1 FROM secret_room_event_attendees WHERE event_id = ? AND user_id = ?`).get(eventId, userId)) return false
      const count = (db.prepare(`SELECT COUNT(*) AS count FROM secret_room_event_attendees WHERE event_id = ?`).get(eventId) as any).count
      if (count >= event.capacity) throw new Error("EVENT_FULL")
      const debit = db.prepare(`UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ? AND timecoin >= ?`).run(event.price_timecoin, Date.now(), userId, event.price_timecoin)
      if (!debit.changes) throw new Error("INSUFFICIENT_BALANCE")
      db.prepare(`UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`).run(event.price_timecoin, Date.now(), event.owner_id)
      db.prepare(`INSERT INTO secret_room_event_attendees (event_id, user_id, paid_timecoin, booked_at) VALUES (?, ?, ?, ?)`).run(eventId, userId, event.price_timecoin, Date.now())
      return true
    })()
    if (!bookedNow) return res.json({ event: serializeEvent(db.prepare(`SELECT * FROM secret_room_events WHERE id = ?`).get(eventId), userId), duplicate: true })
  } catch (error: any) {
    if (error.message === "EVENT_FULL") return res.status(409).json({ error: "Event is full", code: "EVENT_FULL" })
    if (error.message === "INSUFFICIENT_BALANCE") { logAudit(userId, "rejected", event.price_timecoin, "insufficient_balance", { action: "secret_room_event_book", eventId }); return res.status(402).json({ error: "Insufficient TimeCoin", code: "INSUFFICIENT_BALANCE" }) }
    throw error
  }
  logAudit(userId, "debit", event.price_timecoin, "secret_room_event_booking", { eventId })
  logRoomActivity(event.room_id, userId, "event_booked", event.title)
  logAudit(event.owner_id, "credit", event.price_timecoin, "secret_room_event_sale", { eventId, attendeeId: userId })
  createNotification({ userId: event.owner_id, actorId: userId, type: "message", entityType: "secret_room_event", entityId: eventId, text: `A member booked “${event.title}”.` })
  res.status(201).json({ event: serializeEvent(db.prepare(`SELECT * FROM secret_room_events WHERE id = ?`).get(eventId), userId) })
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
        const room = roomOf(userId)
        if (room) logRoomActivity(room.id, userId, "room_activated")
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
  const { name, background, items, avatarGltf } = req.body || {}

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
  let nextAvatar = room.avatar_gltf || null
  if (avatarGltf !== undefined) {
    try { nextAvatar = validateAvatarGltf(avatarGltf) }
    catch (error: any) { return res.status(400).json({ error: error.message || "Invalid avatar" }) }
  }

  db.prepare(`UPDATE secret_rooms SET name = ?, background = ?, items = ?, avatar_gltf = ?, updated_at = ? WHERE owner_id = ?`).run(
    nextName,
    nextBg,
    nextItems,
    nextAvatar,
    Date.now(),
    uid,
  )
  if (nextName !== room.name || nextBg !== room.background || nextItems !== room.items || nextAvatar !== (room.avatar_gltf || null)) logRoomActivity(room.id, uid, "room_customized")
  res.json({ ok: true, room: serializeRoom(roomOf(uid)) })
})

/* ---------------- POST /secret-room/friend-slots/buy — купить +1 слот ($49) ---------------- */
router.post("/friend-slots/buy", requireAuth, (req: AuthRequest, res) => {
  return res.status(402).json({
    error: "Payment verification is required before a friend slot is granted",
    code: "PAYMENT_REQUIRED",
    checkout: "/secret-room/create-checkout",
  })
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
  logRoomActivity(room.id, uid, "member_invited", username.trim())
  res.json({ ok: true, members: membersOf(room.id) })
})

/* ---------------- DELETE /secret-room/members/:userId — убрать друга ---------------- */
router.delete("/members/:userId", requireAuth, (req: AuthRequest, res) => {
  const uid = req.user!.userId
  const room = roomOf(uid)
  if (!room) return res.status(404).json({ error: "Комната не найдена" })
  const memberId = Number(req.params.userId)
  const member = db.prepare(`SELECT username FROM users WHERE id = ?`).get(memberId) as { username?: string } | undefined
  const removed = db.prepare(`DELETE FROM secret_room_members WHERE room_id = ? AND user_id = ?`).run(room.id, memberId)
  if (removed.changes) logRoomActivity(room.id, uid, "member_removed", member?.username || "member")
  res.json({ ok: true, members: membersOf(room.id) })
})

export default router
