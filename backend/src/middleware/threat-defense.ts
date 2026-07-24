import { Request, Response, NextFunction, Express } from "express"
import { redisClient, ensureRedisConnected } from "../lib/redis"
import { getClientIp } from "../lib/admin-audit"
import { Sentry } from "../lib/sentry"

/* ================================================================
   OSGARD · Активная кибероборона (threat defense)
   ----------------------------------------------------------------
   Три механизма, работающие вместе:

   1. Honeypot-ловушки — фейковые «привлекательные» пути (/.env,
      /wp-login.php, /phpmyadmin и т.п.), которых нет в легитимном API.
      Их запрашивают ТОЛЬКО автоматические сканеры/боты — попадание
      = достоверный вредоносный сигнал (ноль ложных срабатываний на
      реальных пользователях). Ловушка мгновенно блокирует IP.

   2. Скоринг угроз — per-IP счётчик «очков подозрительности» с окном
      (Redis INCRBY + PEXPIRE, in-memory fallback). При превышении порога
      IP автоматически добавляется в блоклист на TTL.

   3. Блоклист-guard — ранний middleware: заблокированный IP получает
      403 до попадания в бизнес-логику. Разгружает БД/CPU от абьюза.

   Дополняет (не заменяет) кастомный rateLimiter.ts: тот ограничивает
   частоту, этот — целенаправленно отсекает подтверждённых злоумышленников.

   На инфра-уровне это дополняется Cloudflare (WAF/anti-DDoS перед
   Railway/Vercel) — см. SECURITY.md, раздел про привязку домена.
   ================================================================ */

const WINDOW_MS = 10 * 60 * 1000 // окно накопления очков — 10 минут
const BLOCK_TTL_MS = 60 * 60 * 1000 // длительность авто-блокировки — 1 час
const BLOCK_THRESHOLD = 10 // порог очков для авто-блокировки
const HONEYPOT_WEIGHT = 10 // попадание в ловушку = мгновенный блок

/* Типовые пути, которые ищут массовые сканеры уязвимостей. В легитимном
   OSGARD API их нет — любой запрос сюда почти наверняка вредоносный. */
export const HONEYPOT_PATHS = [
  "/.env",
  "/.env.local",
  "/.git/config",
  "/wp-login.php",
  "/wp-admin",
  "/xmlrpc.php",
  "/phpmyadmin",
  "/phpMyAdmin",
  "/admin.php",
  "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
  "/config.json",
  "/.aws/credentials",
]

/* ---------- Хранилище (Redis + in-memory fallback) ---------- */
type Expiring = { value: number; expires: number }
const memScore = new Map<string, Expiring>()
const memBlock = new Map<string, number>() // ip -> expires

function memAddScore(ip: string, weight: number): number {
  const now = Date.now()
  const rec = memScore.get(ip)
  if (!rec || rec.expires < now) {
    memScore.set(ip, { value: weight, expires: now + WINDOW_MS })
    return weight
  }
  rec.value += weight
  return rec.value
}

function memIsBlocked(ip: string): boolean {
  const exp = memBlock.get(ip)
  if (exp === undefined) return false
  if (exp < Date.now()) {
    memBlock.delete(ip)
    return false
  }
  return true
}

async function blockIp(ip: string, reason: string) {
  memBlock.set(ip, Date.now() + BLOCK_TTL_MS)
  if (await ensureRedisConnected()) {
    try {
      await redisClient!.set(`threat:block:${ip}`, reason, "PX", BLOCK_TTL_MS)
    } catch {
      /* fallback уже в памяти */
    }
  }
  // Алерт: авто-блокировка — событие, которое стоит видеть в Sentry.
  Sentry.captureMessage(`Threat auto-block: ${ip} (${reason})`, "warning")
  console.warn(`[threat-defense] blocked ${ip}: ${reason}`)
}

/** Проверка блокировки IP (Redis → fallback in-memory). */
export async function isBlocked(ip: string): Promise<boolean> {
  if (await ensureRedisConnected()) {
    try {
      const v = await redisClient!.get(`threat:block:${ip}`)
      if (v !== null) return true
    } catch {
      /* fallback ниже */
    }
  }
  return memIsBlocked(ip)
}

/** Начисляет IP очки подозрительности; при превышении порога — авто-блок. */
export async function recordOffense(ip: string | null, reason: string, weight = 1): Promise<void> {
  if (!ip) return
  let total = memAddScore(ip, weight)

  if (await ensureRedisConnected()) {
    try {
      const key = `threat:score:${ip}`
      total = await redisClient!.incrby(key, weight)
      if (total === weight) await redisClient!.pexpire(key, WINDOW_MS)
    } catch {
      /* используем in-memory total */
    }
  }

  if (total >= BLOCK_THRESHOLD) {
    await blockIp(ip, `score>=${BLOCK_THRESHOLD} (${reason})`)
  }
}

/* ---------- Middleware ---------- */

/** Ранний guard: отсекает уже заблокированные IP до бизнес-логики. */
export async function ipBlocklistGuard(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "test") return next()
  const ip = getClientIp(req)
  if (ip && (await isBlocked(ip))) {
    return res.status(403).json({ error: "Forbidden" })
  }
  next()
}

/** Обработчик honeypot-ловушки: фиксирует попадание, блокирует IP,
 *  отвечает нейтральным 404 (не выдаёт, что это ловушка). */
export function honeypotHandler(req: Request, res: Response) {
  if (process.env.NODE_ENV !== "test") {
    const ip = getClientIp(req)
    void recordOffense(ip, `honeypot:${req.path}`, HONEYPOT_WEIGHT)
  }
  // Ответ как у обычного несуществующего пути — чтобы сканер не понял.
  res.status(404).json({ error: "Not found" })
}

/** Монтирует honeypot-пути на приложение. Вызывать до реальных роутов. */
export function mountHoneypots(app: Express) {
  for (const p of HONEYPOT_PATHS) {
    app.all(p, honeypotHandler)
  }
}
