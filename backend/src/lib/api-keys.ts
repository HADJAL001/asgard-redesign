import crypto from "crypto"
import db from "./db"

/* ================================================================
   OSGARD · Утилиты B2B API-ключей
   ----------------------------------------------------------------
   Ключ живёт по модели «пароль»: полный секрет показывается клиенту
   ровно один раз при создании, в БД оседает только SHA-256-хеш.
   Формат ключа: osk_live_<32 байта hex>. Видимый префикс (первые
   ~14 символов) хранится для распознавания ключа в списке без
   раскрытия секрета.
   ================================================================ */

const KEY_PREFIX = "osk_live_"

export type ApiKeyRow = {
  id: number
  user_id: number
  name: string
  prefix: string
  key_hash: string
  scopes: string
  status: string
  rate_per_min: number
  request_count: number
  last_used_at: number | null
  created_at: number
  revoked_at: number | null
}

/** Генерирует новый ключ. Возвращает открытый секрет (показать один раз),
 *  видимый префикс и хеш для хранения. */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(24).toString("hex")
  const raw = `${KEY_PREFIX}${secret}`
  const prefix = raw.slice(0, KEY_PREFIX.length + 6) // osk_live_ab12cd
  const hash = hashKey(raw)
  return { raw, prefix, hash }
}

export function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

/** Находит активный ключ по открытому секрету (сравнение по хешу). */
export function resolveApiKey(raw: string | undefined | null): ApiKeyRow | null {
  if (!raw || typeof raw !== "string" || !raw.startsWith(KEY_PREFIX)) return null
  const hash = hashKey(raw.trim())
  const row = db.prepare(`SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'`).get(hash) as
    | ApiKeyRow
    | undefined
  return row || null
}

/* ---------------- Ограничение частоты (скользящее окно в памяти) ---------------- */
const hits = new Map<number, number[]>()

/** true — запрос разрешён; false — превышен лимит rate_per_min. */
export function checkRateLimit(keyId: number, perMin: number, now: number): boolean {
  const windowStart = now - 60_000
  const arr = (hits.get(keyId) || []).filter((t) => t > windowStart)
  if (arr.length >= perMin) {
    hits.set(keyId, arr)
    return false
  }
  arr.push(now)
  hits.set(keyId, arr)
  return true
}

/** Публичная (безопасная) сериализация ключа — никогда не отдаёт секрет/хеш. */
export function serializeApiKey(k: ApiKeyRow, extra?: Record<string, unknown>) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes.split(",").map((s) => s.trim()).filter(Boolean),
    status: k.status,
    ratePerMin: k.rate_per_min,
    requestCount: k.request_count,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
    revokedAt: k.revoked_at,
    ...extra,
  }
}
