import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { generateProjectContent, isAiConfigured } from "../services/ai-generator"

const router = Router()

const LIST_CURRENCY_BY_RARITY: Record<string, string> = {
  common: "credits",
  rare: "shards",
  epic: "shards",
  legendary: "crystals",
  mythic: "timecoin",
}

function computePrice(a: { power: number; defense: number; magic: number; speed: number }): number {
  const statSum = a.power + a.defense + a.magic + a.speed
  return Math.round(statSum * 5) // базовая цена common-артефакта без спроса
}

function randomStat(): number {
  return 10 + Math.floor(Math.random() * 30)
}

/* ---------------- GET /projects/mine — список проектов пользователя ---------------- */
router.get("/mine", requireAuth, (req: AuthRequest, res) => {
  const projects = db
    .prepare(
      `SELECT id, name, description, badge, artifact_count as artifactCount, sold, income, created_at as createdAt
       FROM projects WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(req.user!.userId)

  res.json({ projects })
})

/* ---------------- GET /projects/:id — один проект + его артефакты ---------------- */
router.get("/:id", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }

  const artifacts = db
    .prepare(
      `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
              status, views_24h as views24h, supply, price, list_currency as listCurrency, created_at as createdAt
       FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`,
    )
    .all(id)

  res.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      badge: project.badge,
      artifactCount: project.artifact_count,
      sold: project.sold,
      income: project.income,
      createdAt: project.created_at,
    },
    artifacts,
  })
})

/* ---------------- POST /projects — создать проект вручную ---------------- */
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const { name, description, badge } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название проекта" })
  }

  const now = Date.now()
  const info = db
    .prepare(
      `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
    )
    .run(req.user!.userId, name.trim(), description || "", badge || "folder", now)

  const project = db
    .prepare(
      `SELECT id, name, description, badge, artifact_count as artifactCount, sold, income, created_at as createdAt
       FROM projects WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))

  res.status(201).json({ project })
})

/* ---------------- POST /projects/generate — AI-генерация проекта ----------------
   Принимает { name, hint? }. Генерирует описание, бейдж и стартовые артефакты
   через Claude API (или локальный fallback, если ключ не настроен/API упал).
   Создаёт проект и сразу привязывает к нему сгенерированные артефакты (level 1,
   common, случайные статы), owner_id = текущий пользователь.
------------------------------------------------------------------------------- */
router.post("/generate", requireAuth, async (req: AuthRequest, res) => {
  const { name, hint } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название проекта" })
  }

  try {
    const generated = await generateProjectContent(name.trim(), typeof hint === "string" ? hint : undefined)
    const now = Date.now()

    const projectInfo = db
      .prepare(
        `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income, created_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
      )
      .run(req.user!.userId, name.trim(), generated.description, generated.badge, now)

    const projectId = Number(projectInfo.lastInsertRowid)

    const insertArtifact = db.prepare(
      `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed, status, views_24h, supply, price, list_currency, created_at)
       VALUES (?, ?, ?, ?, 'common', 1, ?, ?, ?, ?, 'kept', 0, 1, ?, 'credits', ?)`,
    )

    const createdArtifacts: any[] = []
    for (const a of generated.artifacts) {
      const power = randomStat()
      const defense = randomStat()
      const magic = randomStat()
      const speed = randomStat()
      const price = computePrice({ power, defense, magic, speed })

      const artifactInfo = insertArtifact.run(
        req.user!.userId,
        projectId,
        a.name,
        a.type,
        power,
        defense,
        magic,
        speed,
        price,
        now,
      )

      createdArtifacts.push({
        id: Number(artifactInfo.lastInsertRowid),
        projectId,
        name: a.name,
        type: a.type,
        rarity: "common",
        level: 1,
        power,
        defense,
        magic,
        speed,
        status: "kept",
        views24h: 0,
        supply: 1,
        price,
        listCurrency: "credits",
      })
    }

    db.prepare(`UPDATE projects SET artifact_count = ? WHERE id = ?`).run(createdArtifacts.length, projectId)

    const project = db
      .prepare(
        `SELECT id, name, description, badge, artifact_count as artifactCount, sold, income, created_at as createdAt
         FROM projects WHERE id = ?`,
      )
      .get(projectId)

    res.status(201).json({
      project,
      artifacts: createdArtifacts,
      aiSource: generated.source, // "ai" | "fallback"
      aiConfigured: isAiConfigured(),
    })
  } catch (err) {
    console.error("[projects.generate] error:", err)
    res.status(500).json({ error: "Не удалось сгенерировать проект" })
  }
})

/* ---------------- PATCH /projects/:id — обновить название/описание/бейдж ---------------- */
router.patch("/:id", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }

  const { name, description, badge } = req.body || {}
  const nextName = typeof name === "string" && name.trim() ? name.trim() : project.name
  const nextDescription = typeof description === "string" ? description : project.description
  const nextBadge = typeof badge === "string" && badge ? badge : project.badge

  db.prepare(`UPDATE projects SET name = ?, description = ?, badge = ? WHERE id = ?`).run(
    nextName,
    nextDescription,
    nextBadge,
    id,
  )

  const updated = db
    .prepare(
      `SELECT id, name, description, badge, artifact_count as artifactCount, sold, income, created_at as createdAt
       FROM projects WHERE id = ?`,
    )
    .get(id)

  res.json({ project: updated })
})

/* ---------------- DELETE /projects/:id — удалить проект ---------------- */
router.delete("/:id", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }

  /* Отвязываем артефакты от проекта (сами артефакты остаются у владельца) */
  db.prepare(`UPDATE artifacts SET project_id = NULL WHERE project_id = ?`).run(id)
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id)

  res.json({ ok: true })
})

export default router
