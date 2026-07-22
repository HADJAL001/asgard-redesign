import { Router, Request, Response } from "express"
import { generateProjectContent } from "../services/ai-generator"

/* ================================================================
   OSGARD · Demo Routes — без авторизации
   ----------------------------------------------------------------
   POST /demo/generate  — генерирует проект + артефакты для демо
                          без сохранения в БД.
                          Ограничение: 3 генерации с одного IP в 24ч
                          через in-memory Map (сбрасывается при рестарте).

   POST /demo/convert   — конвертирует демо-данные из localStorage
                          в реальные записи БД после регистрации.
                          Требует авторизации через x-user-id header
                          (передаётся сразу после регистрации).
   ================================================================ */

const router = Router()

/* ---- In-memory лимитер по IP: { ip → { count, resetAt } } ---- */
const IP_LIMIT = 3
const IP_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 часа

interface IpEntry { count: number; resetAt: number }
const ipMap = new Map<string, IpEntry>()

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim()
  }
  return req.socket.remoteAddress || "unknown"
}

function checkIpLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let entry = ipMap.get(ip)

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + IP_WINDOW_MS }
    ipMap.set(ip, entry)
  }

  if (entry.count >= IP_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: IP_LIMIT - entry.count, resetAt: entry.resetAt }
}

function randomStat(): number {
  return 10 + Math.floor(Math.random() * 55)
}

function assignRarity(power: number, defense: number, magic: number, speed: number): string {
  const total = power + defense + magic + speed
  if (total >= 220) return "legendary"
  if (total >= 180) return "epic"
  if (total >= 140) return "rare"
  if (total >= 100) return "uncommon"
  return "common"
}

/* ---- POST /demo/generate ---- */
router.post("/generate", async (req: Request, res: Response) => {
  const { name, hint } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название вселенной" })
  }

  const ip = getClientIp(req)
  const { allowed, remaining, resetAt } = checkIpLimit(ip)

  if (!allowed) {
    return res.status(429).json({
      error: "Лимит демо-генераций исчерпан. Попробуйте через 24 часа или зарегистрируйтесь.",
      resetAt,
    })
  }

  try {
    const generated = await generateProjectContent(
      name.trim(),
      typeof hint === "string" ? hint : undefined,
    )

    const demoArtifacts = generated.artifacts.map((a, i) => {
      const power = randomStat()
      const defense = randomStat()
      const magic = randomStat()
      const speed = randomStat()
      return {
        id: `demo_${Date.now()}_${i}`,
        name: a.name,
        type: a.type,
        rarity: assignRarity(power, defense, magic, speed),
        level: 1,
        power,
        defense,
        magic,
        speed,
        price: Math.round((power + defense + magic + speed) * 5),
        listCurrency: "credits",
      }
    })

    res.json({
      project: {
        name: name.trim(),
        description: generated.description,
        badge: generated.badge,
        artifactCount: demoArtifacts.length,
      },
      artifacts: demoArtifacts,
      aiSource: generated.source,
      generationsRemaining: remaining,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    })
  } catch (err) {
    console.error("[demo.generate] error:", err)
    res.status(500).json({ error: "Ошибка генерации. Попробуйте ещё раз." })
  }
})

/* ---- POST /demo/convert — конвертация демо → реальные записи ----
   Вызывается со стороны register/page.tsx ПОСЛЕ успешной регистрации.
   Принимает JWT через Authorization header (уже выдан после регистрации).
   Создаёт проекты и артефакты в БД + начисляет 50 бонусных токенов.
   ------------------------------------------------------------------ */
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

router.post("/convert", requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId
  const { projects: demoProjects } = req.body || {}

  if (!Array.isArray(demoProjects) || demoProjects.length === 0) {
    return res.status(400).json({ error: "Нет демо-данных для конвертации" })
  }

  const now = Date.now()
  let totalArtifacts = 0

  const insertProject = db.prepare(
    `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income, created_at)
     VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
  )
  const insertArtifact = db.prepare(
    `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed,
                            status, views_24h, supply, price, list_currency, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'kept', 0, 1, ?, 'credits', ?)`,
  )
  const updateArtifactCount = db.prepare(
    `UPDATE projects SET artifact_count = ? WHERE id = ?`,
  )

  try {
    // DatabaseSync (node:sqlite) не поддерживает .transaction() — делаем последовательные вставки
    for (const proj of demoProjects.slice(0, 3)) {
      const pInfo = insertProject.run(
        userId,
        String(proj.name || "Демо-проект").slice(0, 100),
        String(proj.description || "").slice(0, 500),
        String(proj.badge || "sparkles"),
        now,
      )
      const projectId = Number(pInfo.lastInsertRowid)

      const artifacts = Array.isArray(proj.artifacts) ? proj.artifacts : []
      let count = 0
      for (const a of artifacts.slice(0, 10)) {
        const power = Math.min(99, Math.max(10, Number(a.power) || 20))
        const defense = Math.min(99, Math.max(10, Number(a.defense) || 20))
        const magic = Math.min(99, Math.max(10, Number(a.magic) || 20))
        const speed = Math.min(99, Math.max(10, Number(a.speed) || 20))
        insertArtifact.run(
          userId, projectId,
          String(a.name || "Артефакт").slice(0, 100),
          String(a.type || "artifact"),
          String(a.rarity || "common"),
          power, defense, magic, speed,
          Math.round((power + defense + magic + speed) * 5),
          now,
        )
        count++
        totalArtifacts++
      }
      updateArtifactCount.run(count, projectId)
    }

    // Начисляем 50 бонусных токенов
    db.prepare(`UPDATE wallets SET timecoin = timecoin + 50 WHERE user_id = ?`).run(userId)

    return res.json({
      ok: true,
      projectsConverted: Math.min(demoProjects.length, 3),
      artifactsConverted: totalArtifacts,
      bonusTokens: 50,
    })
  } catch (err) {
    console.error("[demo.convert] error:", err)
    return res.status(500).json({ error: "Ошибка конвертации демо-данных" })
  }
})

export default router
