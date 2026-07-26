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
 * Хард-кап воронки: гость (is_guest=1) имеет право ровно на ОДИН проект.
 * Авторитетная серверная стена — клиентский UI и «1 гость на IP» уже ограничивают,
 * но гость с валидным токеном мог бы дёргать создание проекта повторно в обход UI.
 * Реальные аккаунты (is_guest=0, включая все legacy-строки) → всегда false.
 * Вызывается в обоих создающих хендлерах (POST /projects, POST /projects/generate)
 * ДО любых квот/списаний. См. routes/guest.routes.ts, миграция 087.
 */
export function guestProjectCapReached(userId: number): boolean {
  const row = db.prepare(`SELECT is_guest FROM users WHERE id = ?`).get(userId) as
    | { is_guest?: number }
    | undefined
  if (row?.is_guest !== 1) return false
  return !!db.prepare(`SELECT 1 FROM projects WHERE user_id = ? LIMIT 1`).get(userId)
}

/* ================================================================
   Гигиена воронки — жатва брошенных гостей.
   ----------------------------------------------------------------
   Воронка чеканит по строке users(is_guest=1) на каждый новый IP.
   Гость, который зашёл на лендинг, но так и не создал проект (bounce),
   и не зарегистрировался (claimed_at IS NULL) — чистый мусор, копящийся
   вечно. Жнём только таких: реальные аккаунты, забранных гостей и гостей
   С проектом (проект = реальная работа, может быть забран позже) НЕ трогаем.
   ================================================================ */

/** TTL брошенного гостя до жатвы. Сильно больше окна переиспользования (24ч), чтобы
 *  никогда не удалить гостя, которого ещё может вернуть повторный /guest/start. */
export const GUEST_REAP_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Нормализация created_at (TEXT ISO ↔ unix-мс): гость пишется через DEFAULT схемы,
 *  который на разных инстансах бывает и TEXT (CURRENT_TIMESTAMP), и числом. Та же
 *  логика, что у ридеров аналитики (admin.controller.normalizedTs). */
function tsMs(col: string): string {
  return `(CASE WHEN typeof(${col}) = 'text' THEN CAST(strftime('%s', ${col}) AS INTEGER) * 1000 ELSE ${col} END)`
}

/** WHERE-условие «брошенный гость старше cutoff, без проекта, не забран» (общее для
 *  подсчёта и удаления). cutoff всегда не позже окна переиспользования. */
function staleGuestWhere(alias: string): string {
  return `${alias}.is_guest = 1
      AND ${alias}.claimed_at IS NULL
      AND ${tsMs(`${alias}.created_at`)} < ?
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id = ${alias}.id)`
}

/** Сколько брошенных гостей подлежит жатве прямо сейчас (dry-run, только чтение) —
 *  для read-only ридера гигиены. */
export function countStaleGuests(now: number = Date.now(), ttlMs: number = GUEST_REAP_TTL_MS): number {
  const cutoff = now - Math.max(GUEST_WINDOW_MS, ttlMs)
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM users u WHERE ${staleGuestWhere("u")}`)
    .get(cutoff) as { c: number }
  return row.c
}

export interface ReapResult {
  scanned: number
  deletedGuests: number
  deletedWallets: number
}

/**
 * Удаляет брошенных гостей одной транзакцией. DELETE сам по себе несёт полный
 * гвард (is_guest=1 AND claimed_at IS NULL AND нет проекта) — даже если состояние
 * изменилось между подсчётом и удалением, забранного гостя или гостя с проектом
 * не тронем. Кошельки-заглушки чистятся как осиротевшие. Возвращает счётчики.
 */
export function reapStaleGuests(now: number = Date.now(), ttlMs: number = GUEST_REAP_TTL_MS): ReapResult {
  const cutoff = now - Math.max(GUEST_WINDOW_MS, ttlMs)
  const scanned = countStaleGuests(now, ttlMs)
  if (scanned === 0) return { scanned: 0, deletedGuests: 0, deletedWallets: 0 }

  const tx = db.transaction(() => {
    let deletedWallets = 0
    try {
      // Кошельки-заглушки жнущихся гостей — ДО удаления самих гостей, строго по гварду.
      deletedWallets = db
        .prepare(`DELETE FROM wallets WHERE user_id IN (SELECT u.id FROM users u WHERE ${staleGuestWhere("u")})`)
        .run(cutoff).changes
    } catch {
      /* wallets может отсутствовать в некоторых схемах — не критично */
    }
    // Гвард продублирован в самом DELETE — удаление самозащищённое (забранного гостя
    // или гостя с проектом не тронем, даже если состояние изменилось после подсчёта).
    const deletedGuests = db
      .prepare(`DELETE FROM users WHERE id IN (SELECT u.id FROM users u WHERE ${staleGuestWhere("u")})`)
      .run(cutoff).changes
    return { deletedGuests, deletedWallets }
  })

  const { deletedGuests, deletedWallets } = tx()
  return { scanned, deletedGuests, deletedWallets }
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
