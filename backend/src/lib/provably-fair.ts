import crypto from "node:crypto"
import db from "./db"

/* ================================================================
   OSGARD · Provably-fair — честно проверяемая гача (commit-reveal)
   ----------------------------------------------------------------
   Скрытый ГСЧ, минтящий экономическую ценность (стартовые артефакты:
   статы + ролл редкости — см. lib/project-generation.ts), заменён на
   детерминированный, но НЕЗАВИСИМО проверяемый поток.

   Контур (модель честного казино):
     • server_seed      — секрет дома; hash публикуется ДО бросков;
     • server_seed_hash — sha256(server_seed) — обязательство (commit);
     • client_seed      — энтропия игрока (настраивается им);
     • nonce            — монотонный счётчик бросков.

   Бросок: HMAC-SHA256(server_seed, `${client_seed}:${nonce}:${purpose}`)
   → float [0,1). Несколько float'ов из одного nonce разводятся
   суффиксом `:${i}` (см. deriveFloats) — один бросок стартового
   артефакта = 5 значений (4 стата + редкость) при одном nonce++.

   После ротации server_seed раскрывается: любой берёт (раскрытый
   server_seed, client_seed, nonce, purpose, count) и через чистую
   verifyFloats() пересчитывает результат, сверяя с леджером. Дом не
   мог подкрутить — hash был зафиксирован до броска.

   Чистые (deriveFloats/verifyFloats/hashServerSeed) не зависят от БД
   и переиспользуются публичным /verify и тестами.
   ================================================================ */

/** sha256(hex) — commit из server_seed. */
export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash("sha256").update(serverSeed).digest("hex")
}

/** Один float [0,1) из 4 старших байт HMAC-SHA256(server_seed, message). */
function floatFromMessage(serverSeed: string, message: string): number {
  const hex = crypto.createHmac("sha256", serverSeed).update(message).digest("hex")
  // Первые 8 hex (32 бита) → целое → /2^32 → равномерно [0,1).
  const int = parseInt(hex.slice(0, 8), 16)
  return int / 0x1_0000_0000
}

/**
 * ЧИСТО и ДЕТЕРМИНИРОВАННО выводит `count` float'ов [0,1) из одного nonce.
 * count===1 → сообщение `${client}:${nonce}:${purpose}`; иначе к каждому
 * добавляется суффикс `:${i}` (i=0..count-1) — разные значения из одного
 * броска, но полностью воспроизводимые. Это и есть публичный верификатор.
 */
export function deriveFloats(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  purpose: string,
  count = 1,
): number[] {
  const n = Math.max(1, Math.floor(count))
  const base = `${clientSeed}:${nonce}:${purpose}`
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push(floatFromMessage(serverSeed, n === 1 ? base : `${base}:${i}`))
  }
  return out
}

/** Псевдоним для публичного /verify (тот же чистый расчёт). */
export const verifyFloats = deriveFloats

/* ---------------- Валидация client_seed ---------------- */

export const CLIENT_SEED_MAX = 64

/** Игроцкий seed: печатаемый ASCII, 1..64 символа. Пусто/мусор → null. */
export function normalizeClientSeed(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim()
  if (s.length < 1 || s.length > CLIENT_SEED_MAX) return null
  // Только «безопасные» видимые символы — seed светится в UI и /verify.
  if (!/^[\x21-\x7E]+$/.test(s)) return null
  return s
}

function freshServerSeed(): string {
  return crypto.randomBytes(32).toString("hex")
}

function freshClientSeed(): string {
  return crypto.randomBytes(8).toString("hex")
}

/* ---------------- Типы строк ---------------- */

export type SeedRow = {
  user_id: number
  server_seed: string
  server_seed_hash: string
  client_seed: string
  nonce: number
  prev_server_seed: string | null
  prev_server_seed_hash: string | null
  prev_nonce: number | null
  rotated_at: number | null
  created_at: number
  updated_at: number
}

/** Публичный commit — то, что можно показывать игроку (без секрета). */
export type PublicCommit = {
  serverSeedHash: string
  clientSeed: string
  nonce: number
  previous: { serverSeed: string; serverSeedHash: string; nonce: number; rotatedAt: number } | null
}

/** Лениво создаёт сид-цепочку игрока при первом обращении. */
export function getOrCreateSeed(userId: number): SeedRow {
  const existing = db.prepare(`SELECT * FROM provably_fair_seeds WHERE user_id = ?`).get(userId) as
    | SeedRow
    | undefined
  if (existing) return existing

  const serverSeed = freshServerSeed()
  const now = Date.now()
  db.prepare(
    `INSERT INTO provably_fair_seeds (user_id, server_seed, server_seed_hash, client_seed, nonce, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id) DO NOTHING`,
  ).run(userId, serverSeed, hashServerSeed(serverSeed), freshClientSeed(), now, now)

  return db.prepare(`SELECT * FROM provably_fair_seeds WHERE user_id = ?`).get(userId) as SeedRow
}

/** Публичный commit игрока (никогда не отдаёт активный server_seed). */
export function getPublicCommit(userId: number): PublicCommit {
  const row = getOrCreateSeed(userId)
  return {
    serverSeedHash: row.server_seed_hash,
    clientSeed: row.client_seed,
    nonce: row.nonce,
    previous:
      row.prev_server_seed && row.prev_server_seed_hash != null && row.prev_nonce != null
        ? {
            serverSeed: row.prev_server_seed,
            serverSeedHash: row.prev_server_seed_hash,
            nonce: row.prev_nonce,
            rotatedAt: row.rotated_at ?? 0,
          }
        : null,
  }
}

/** Устанавливает client_seed игрока (энтропия под его контролем). */
export function setClientSeed(userId: number, rawSeed: unknown): PublicCommit {
  const clientSeed = normalizeClientSeed(rawSeed)
  if (!clientSeed) {
    throw new ProvablyFairError(`client_seed: 1..${CLIENT_SEED_MAX} печатаемых ASCII-символов`, 400)
  }
  getOrCreateSeed(userId)
  db.prepare(`UPDATE provably_fair_seeds SET client_seed = ?, updated_at = ? WHERE user_id = ?`).run(
    clientSeed,
    Date.now(),
    userId,
  )
  return getPublicCommit(userId)
}

/**
 * Ротация: РАСКРЫВАЕТ текущий server_seed (в prev_*), генерирует новый seed+hash,
 * сбрасывает nonce в 0. Возвращает раскрытый seed (для проверки истории) и новый
 * commit. После этого игрок может пересчитать все прошлые броски.
 */
export function rotateSeed(userId: number): { revealed: { serverSeed: string; serverSeedHash: string; nonce: number }; next: PublicCommit } {
  const row = getOrCreateSeed(userId)
  const nextServerSeed = freshServerSeed()
  const now = Date.now()

  db.prepare(
    `UPDATE provably_fair_seeds
       SET prev_server_seed = server_seed,
           prev_server_seed_hash = server_seed_hash,
           prev_nonce = nonce,
           rotated_at = ?,
           server_seed = ?,
           server_seed_hash = ?,
           nonce = 0,
           updated_at = ?
     WHERE user_id = ?`,
  ).run(now, nextServerSeed, hashServerSeed(nextServerSeed), now, userId)

  return {
    revealed: { serverSeed: row.server_seed, serverSeedHash: row.server_seed_hash, nonce: row.nonce },
    next: getPublicCommit(userId),
  }
}

/* ---------------- Ошибки ---------------- */

export class ProvablyFairError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "ProvablyFairError"
    this.status = status
  }
}

/**
 * Основной бросок: атомарно берёт текущий (server_seed, client_seed, nonce),
 * выводит `count` float'ов, инкрементит nonce на 1 и пишет строку в леджер
 * (доказательство). Всё в одной транзакции — гонка/краш не разъедут nonce и лог.
 *
 * @returns массив float'ов [0,1) длиной `count`.
 */
export function nextFloats(userId: number, purpose: string, count = 1, context?: string): number[] {
  const n = Math.max(1, Math.floor(count))
  const tx = db.transaction(() => {
    const row = getOrCreateSeed(userId)
    const floats = deriveFloats(row.server_seed, row.client_seed, row.nonce, purpose, n)

    db.prepare(
      `INSERT INTO provably_fair_rolls (user_id, server_seed_hash, client_seed, nonce, purpose, count, results_json, context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      row.server_seed_hash,
      row.client_seed,
      row.nonce,
      purpose,
      n,
      JSON.stringify(floats),
      context ?? null,
      Date.now(),
    )

    db.prepare(`UPDATE provably_fair_seeds SET nonce = nonce + 1, updated_at = ? WHERE user_id = ?`).run(
      Date.now(),
      userId,
    )

    return floats
  })
  return tx()
}

export type RollRow = {
  id: number
  serverSeedHash: string
  clientSeed: string
  nonce: number
  purpose: string
  count: number
  results: number[]
  context: string | null
  createdAt: number
}

/** Недавние броски игрока — сырьё для UI-верификации. */
export function getRecentRolls(userId: number, limit = 30): RollRow[] {
  const capped = Math.max(1, Math.min(100, Math.floor(limit)))
  const rows = db
    .prepare(
      `SELECT id, server_seed_hash, client_seed, nonce, purpose, count, results_json, context, created_at
         FROM provably_fair_rolls WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(userId, capped) as Array<{
    id: number
    server_seed_hash: string
    client_seed: string
    nonce: number
    purpose: string
    count: number
    results_json: string
    context: string | null
    created_at: number
  }>

  return rows.map((r) => ({
    id: r.id,
    serverSeedHash: r.server_seed_hash,
    clientSeed: r.client_seed,
    nonce: r.nonce,
    purpose: r.purpose,
    count: r.count,
    results: safeParseFloats(r.results_json),
    context: r.context,
    createdAt: r.created_at,
  }))
}

function safeParseFloats(json: string): number[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : []
  } catch {
    return []
  }
}
