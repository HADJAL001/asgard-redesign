import { Router, Request, Response } from "express"
import jwt from "jsonwebtoken"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { redisClient, ensureRedisConnected } from "../lib/redis"
import { captureError } from "../lib/sentry"
import { track } from "../lib/analytics"
import { findActiveGuestByIp, provisionGuest, firstProjectOf, claimGuest } from "../lib/guest-service"
import { refinementsRemaining } from "../lib/refinements"

/* ================================================================
   OSGARD · Guest Routes — воронка «1 бесплатный проект по IP»
   ----------------------------------------------------------------
   Первое впечатление без стены регистрации: гость с лендинга получает
   ОДИН настоящий проект (реальный код + артефакты). Механика:

     POST /guest/start  — провижинит лёгкий гость-аккаунт (users.is_guest=1)
                          и выдаёт настоящий JWT. От его лица фронт зовёт
                          СУЩЕСТВУЮЩИЙ POST /projects/generate (эндпойнт
                          генерации не трогаем — домен Кузницы/Claude B).
                          Анти-абуз: один активный гость на IP + burst-лимит.
     POST /guest/claim  — при регистрации реальный аккаунт «забирает» гостя:
                          проект и артефакты переносятся на него (одноразово).
     GET  /guest/status — состояние воронки для раздела «Доработки».

   Почему гость-аккаунт, а не аноним-эндпойнт: так существующий
   requireAuth-контур генерации работает БЕЗ изменений в файлах B —
   гостю просто выдаётся валидный токен. Жёсткий серверный кап «гость =
   максимум 1 проект» — маленькая правка в самом /projects/generate —
   передан B через COORDINATION.md; здесь мы гейтим создание гостя (1/IP)
   и показываем стену на фронте, чего достаточно для запуска.
   ================================================================ */

const router = Router()

/* Гость-токен живёт дольше access-токена (15м): гость может вернуться к
   своему проекту в течение окна. Тот же секрет/формат {userId}, что и у
   access-токена, поэтому authMiddleware.verifyAccessToken принимает его
   без изменений. */
const GUEST_TOKEN_TTL = "24h"
const GUEST_WINDOW_MS = 24 * 60 * 60 * 1000

/* Burst-защита: даже при сбросе состояния — не больше N созданий гостя с
   одного IP за окно. «Активный гость по IP» ищется в БД (см. ниже), а этот
   счётчик лишь глушит массовый спам создания аккаунтов. */
const GUEST_CREATE_BURST = 5

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim()
  }
  return req.socket.remoteAddress || "unknown"
}

function mintGuestToken(userId: number): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET || "default_secret", { expiresIn: GUEST_TOKEN_TTL })
}

/* In-memory fallback burst-лимитера (Redis недоступен). { ip → {count, resetAt} }. */
interface BurstEntry { count: number; resetAt: number }
const burstMap = new Map<string, BurstEntry>()

function memoryBurstOk(ip: string): boolean {
  const now = Date.now()
  let e = burstMap.get(ip)
  if (!e || e.resetAt < now) {
    e = { count: 0, resetAt: now + GUEST_WINDOW_MS }
    burstMap.set(ip, e)
  }
  if (e.count >= GUEST_CREATE_BURST) return false
  e.count++
  return true
}

async function burstOk(ip: string): Promise<boolean> {
  const key = `guest_create:${ip}`
  if (await ensureRedisConnected()) {
    try {
      const count = await redisClient!.incr(key)
      if (count === 1) await redisClient!.pexpire(key, GUEST_WINDOW_MS)
      return count <= GUEST_CREATE_BURST
    } catch (err: any) {
      console.warn("[guest] redis burst failed, falling back to in-memory:", err.message)
    }
  }
  return memoryBurstOk(ip)
}

/* Поиск активного гостя по IP, провижн и claim/transfer вынесены в
   lib/guest-service.ts (чистая БД-логика, юнит-тестируемая против in-memory
   БД). Здесь остаётся HTTP-обвязка: токены, burst-лимит, аналитика. */

/* ---- POST /guest/start ---- */
router.post("/start", async (req: Request, res: Response) => {
  const ip = getClientIp(req)

  try {
    // Уже есть активный гость на этом IP → возвращаем ЕГО (свежий токен),
    // чтобы вернувшийся гость продолжил со своим проектом, а не плодил дубли.
    const existing = findActiveGuestByIp(ip)
    if (existing) {
      const project = firstProjectOf(existing.id)
      return res.json({
        token: mintGuestToken(existing.id),
        user: { id: existing.id, username: existing.username, isGuest: true },
        existing: true,
        hasProject: !!project,
        projectId: project?.id ?? null,
      })
    }

    // Новый гость — сперва burst-защита от спама создания.
    if (!(await burstOk(ip))) {
      return res.status(429).json({
        error: "Слишком много бесплатных проектов с этого адреса. Зарегистрируйтесь, чтобы продолжить.",
        code: "GUEST_LIMIT",
      })
    }

    // Провижн лёгкого гость-аккаунта (см. lib/guest-service.ts): is_guest=1,
    // непроходной password_hash (вход только по токену), кошелёк-заглушка.
    const guest = provisionGuest(ip)

    track("guest_start", { userId: guest.id, meta: { ip } })

    return res.json({
      token: mintGuestToken(guest.id),
      user: { id: guest.id, username: guest.username, isGuest: true },
      existing: false,
      hasProject: false,
      projectId: null,
    })
  } catch (err) {
    captureError("[guest.start] error:", err)
    return res.status(500).json({ error: "Не удалось создать гостевую сессию" })
  }
})

/* ---- POST /guest/claim — реальный аккаунт «забирает» гостя ----
   Вызывается фронтом сразу ПОСЛЕ успешной регистрации (Authorization —
   токен нового реального аккаунта). Переносит проект(ы) и артефакты гостя
   на реальный аккаунт. Одноразово: условный UPDATE claimed_at гарантирует,
   что двойной вызов/гонка не перенесёт дважды. */
router.post("/claim", requireAuth, async (req: AuthRequest, res: Response) => {
  const realUserId = req.user!.userId
  const { guestToken } = req.body || {}

  // Идентифицируем гостя двумя путями (что раньше сработает):
  //   1) guestToken — точная привязка (прокси подставляет его из httpOnly
  //      cookie osgard_guest; JWT в JS не попадает — консистентно с auth);
  //   2) IP-fallback — если токена нет (другая вкладка/чистка cookie), берём
  //      активного непривязанного гостя с этого IP. Так claim не теряется.
  let guestUserId: number | undefined
  if (guestToken && typeof guestToken === "string") {
    try {
      const payload = jwt.verify(guestToken, process.env.JWT_SECRET || "default_secret") as { userId?: number }
      if (payload?.userId) guestUserId = payload.userId
    } catch {
      /* протухший/битый токен — попробуем IP-fallback ниже */
    }
  }
  if (!guestUserId) {
    const byIp = findActiveGuestByIp(getClientIp(req))
    if (byIp) guestUserId = byIp.id
  }
  if (!guestUserId) {
    // Нечего переносить (гостя не было) — это НЕ ошибка регистрации.
    return res.json({ ok: true, projectsMoved: 0, artifactsMoved: 0, guest: false })
  }

  try {
    // Вся гонко-безопасная логика (self-claim / not-found / already-claimed +
    // одноразовый перенос проектов и артефактов) — в lib/guest-service.ts.
    const result = claimGuest(realUserId, guestUserId)
    if (!result.ok) {
      const messages: Record<string, string> = {
        SELF_CLAIM: "Нельзя забрать самого себя",
        GUEST_NOT_FOUND: "Гостевая сессия не найдена",
        ALREADY_CLAIMED: "Гостевая сессия уже перенесена",
      }
      return res.status(result.status).json({ error: messages[result.code], code: result.code })
    }

    track("guest_claim", {
      userId: realUserId,
      meta: { guestUserId, projects: result.projectsMoved, artifacts: result.artifactsMoved },
    })

    return res.json({
      ok: true,
      projectsMoved: result.projectsMoved,
      artifactsMoved: result.artifactsMoved,
    })
  } catch (err) {
    captureError("[guest.claim] error:", err)
    return res.status(500).json({ error: "Не удалось перенести гостевой проект" })
  }
})

/* ---- GET /guest/status — состояние воронки для раздела «Доработки» ----
   Токен-агностично: если передан валидный токен — вернём, гость это или
   реальный аккаунт, и есть ли у него проект. refinementsRemaining —
   механика доработок (домен Claude B), пока не подключена → null. */
router.get("/status", async (req: Request, res: Response) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.json({ authenticated: false })
  }
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), process.env.JWT_SECRET || "default_secret") as {
      userId?: number
    }
    if (!payload?.userId) return res.json({ authenticated: false })

    const user = db
      .prepare(`SELECT id, is_guest FROM users WHERE id = ?`)
      .get(payload.userId) as { id: number; is_guest: number } | undefined
    if (!user) return res.json({ authenticated: false })

    const project = firstProjectOf(user.id)
    return res.json({
      authenticated: true,
      isGuest: user.is_guest === 1,
      hasProject: !!project,
      projectId: project?.id ?? null,
      // Доработки (домен Claude B, миграция 089): грант бесплатных доработок
      // минус израсходованные. Для гостя тоже валидно (0 строк → полный грант).
      refinementsRemaining: refinementsRemaining(user.id),
    })
  } catch {
    return res.json({ authenticated: false })
  }
})

export default router
