import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

/* ================================================================
   OSGARD · Secret Room API — супер-тайная приватная комната
   ----------------------------------------------------------------
   Платный вход: $99 разово + $9/мес (access_until продлевается на 30
   дней при оплате). Кастомизация: фон + предметы (мебель/картины). До
   3 друзей бесплатно (friend_slots), далее +$49 за слот.

   Эндпоинты /unlock, /friend-slots/buy и платный /members представляют
   ГРАНТ после успешной оплаты — сюда подключается вебхук платёжки
   (Stripe/YooKassa) как источник истины по факту оплаты.
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
router.post("/unlock", requireAuth, (req: AuthRequest, res) => {
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
