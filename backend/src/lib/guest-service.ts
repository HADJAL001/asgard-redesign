import db from "./db"
import { UserModel } from "../models/user.model"

/* ================================================================
   guest-service — ядро воронки «1 бесплатный проект по IP».
   ----------------------------------------------------------------
   Чистая БД-логика (без Express/Redis/JWT), чтобы её можно было юнит-
   тестировать против in-memory БД (стиль lib/artifact-fusion.ts).
   HTTP-обвязка (токены, burst-лимит, аналитика) живёт в
   routes/guest.routes.ts.
   ================================================================ */

/** Окно «активности» гостя: в его пределах повторный /guest/start вернёт того же гостя. */
export const GUEST_WINDOW_MS = 24 * 60 * 60 * 1000

export interface GuestRef {
  id: number
  username: string
}

/**
 * Самый свежий активный (непривязанный, свежий) гость по IP — БД-fallback к
 * правилу «один гость на IP». БД шарится всеми инстансами (один файл на волюме),
 * поэтому надёжнее in-memory Map.
 */
export function findActiveGuestByIp(ip: string, now: number = Date.now()): GuestRef | undefined {
  const cutoff = now - GUEST_WINDOW_MS
  return db
    .prepare(
      `SELECT id, username FROM users
       WHERE is_guest = 1 AND guest_ip = ? AND claimed_at IS NULL AND created_at >= ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(ip, cutoff) as GuestRef | undefined
}

/** Первый (по времени) проект пользователя — для маршрутизации в раздел «Доработки». */
export function firstProjectOf(userId: number): { id: number } | undefined {
  return db
    .prepare(`SELECT id FROM projects WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`)
    .get(userId) as { id: number } | undefined
}

/**
 * Провижинит лёгкий гость-аккаунт под данный IP: создаёт пользователя
 * (is_guest=1, непроходной password_hash → парольный вход невозможен),
 * помечает guest_ip и заводит кошелёк-заглушку. Возвращает ссылку на гостя.
 *
 * randomSuffix инъектируется для детерминизма в тестах; по умолчанию —
 * случайный (Math.random недоступен в некоторых песочницах воркфлоу, но в
 * рантайме бэкенда доступен).
 */
export function provisionGuest(ip: string, randomSuffix?: () => string): GuestRef {
  const rnd = randomSuffix ?? (() => Math.random().toString(36).slice(2, 10))
  let username = `guest_${rnd()}`
  for (let i = 0; i < 5 && UserModel.isUsernameTaken(username); i++) {
    username = `guest_${rnd()}`
  }

  const userId = UserModel.create({
    username,
    password_hash: "!guest",
    email: undefined,
    is_verified: false,
    role: "user",
    ip_address: ip,
  })

  db.prepare(`UPDATE users SET is_guest = 1, guest_ip = ? WHERE id = ?`).run(ip, userId)

  try {
    db.prepare(
      `INSERT OR IGNORE INTO wallets (user_id, credits, shards, crystals, timecoin, cash_usd)
       VALUES (?, 0, 0, 0, 0, 0)`,
    ).run(userId)
  } catch {
    /* wallets может отсутствовать в некоторых схемах — не критично */
  }

  return { id: userId, username }
}

export type ClaimResult =
  | { ok: true; projectsMoved: number; artifactsMoved: number }
  | { ok: false; code: "SELF_CLAIM" | "GUEST_NOT_FOUND" | "ALREADY_CLAIMED"; status: number }

/**
 * Реальный аккаунт «забирает» гостя: переносит его проекты и артефакты.
 * Одноразово и гонко-безопасно — claimed_at ставится условным UPDATE
 * (WHERE claimed_at IS NULL), при проигрыше гонки → ALREADY_CLAIMED.
 * Вся работа в одной транзакции BEGIN IMMEDIATE.
 */
export function claimGuest(realUserId: number, guestUserId: number, now: number = Date.now()): ClaimResult {
  if (guestUserId === realUserId) {
    return { ok: false, code: "SELF_CLAIM", status: 400 }
  }

  const guest = db
    .prepare(`SELECT id, is_guest, claimed_at FROM users WHERE id = ?`)
    .get(guestUserId) as { id: number; is_guest: number; claimed_at: number | null } | undefined

  if (!guest || guest.is_guest !== 1) {
    return { ok: false, code: "GUEST_NOT_FOUND", status: 404 }
  }
  if (guest.claimed_at !== null) {
    return { ok: false, code: "ALREADY_CLAIMED", status: 409 }
  }

  db.exec("BEGIN IMMEDIATE")
  try {
    const marked = db
      .prepare(`UPDATE users SET claimed_at = ? WHERE id = ? AND is_guest = 1 AND claimed_at IS NULL`)
      .run(now, guestUserId)
    if (marked.changes !== 1) {
      db.exec("ROLLBACK")
      return { ok: false, code: "ALREADY_CLAIMED", status: 409 }
    }

    const projMoved = db.prepare(`UPDATE projects SET user_id = ? WHERE user_id = ?`).run(realUserId, guestUserId)
    const artMoved = db.prepare(`UPDATE artifacts SET owner_id = ? WHERE owner_id = ?`).run(realUserId, guestUserId)

    db.exec("COMMIT")
    return { ok: true, projectsMoved: projMoved.changes, artifactsMoved: artMoved.changes }
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}
