import { Router } from "express"
import { Octokit } from "@octokit/rest"
import archiver from "archiver"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { localFallbackGeneration, isAiConfigured } from "../services/ai-generator"
import { generateApp, validateGeneratedFiles, GeneratedAppFile } from "../services/app-generator"
import { runNetlifyDeployJob, isNetlifyConfigured } from "../services/netlify-deploy"
import { decrypt } from "../utils/encryption"

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

const PROJECT_SELECT_COLUMNS = `id, name, description, badge, artifact_count as artifactCount, sold, income,
       status, generation_error as generationError, ai_source as aiSource, created_at as createdAt,
       deploy_status as deployStatus, deploy_error as deployError, live_url as liveUrl`

/* ---------------- GET /projects/mine — список проектов пользователя ---------------- */
router.get("/mine", requireAuth, (req: AuthRequest, res) => {
  const projects = db
    .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE user_id = ? ORDER BY created_at DESC`)
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
      status: project.status,
      generationError: project.generation_error,
      aiSource: project.ai_source,
      createdAt: project.created_at,
      deployStatus: project.deploy_status,
      deployError: project.deploy_error,
      liveUrl: project.live_url,
    },
    artifacts,
  })
})

/* ---------------- GET /projects/:id/files — файлы сгенерированного приложения ---------------- */
router.get("/:id/files", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT id, user_id FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }

  const files = db
    .prepare(`SELECT path, content, updated_at as updatedAt FROM project_files WHERE project_id = ? ORDER BY path ASC`)
    .all(id)

  res.json({ files })
})

/* ---------------- PUT /projects/:id/files/* — сохранить изменения файла (Monaco editor) ----------------
   Путь файла передаётся через wildcard-хвост урла (может содержать "/"), поэтому обычный
   :path-параметр не подходит. Ре-валидируем весь набор файлов проекта через tsc после
   сохранения — ошибки не блокируют запись, только отображаются пользователю.
------------------------------------------------------------------------------- */
router.put("/:id/files/*", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const filePath = (req.params as any)[0] as string
  const project: any = db.prepare(`SELECT id, user_id FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }

  const { content } = req.body || {}
  if (typeof content !== "string") {
    return res.status(400).json({ error: "Содержимое файла обязательно" })
  }

  const existing = db
    .prepare(`SELECT id FROM project_files WHERE project_id = ? AND path = ?`)
    .get(id, filePath)
  if (!existing) return res.status(404).json({ error: "Файл не найден" })

  const now = Date.now()
  db.prepare(`UPDATE project_files SET content = ?, updated_at = ? WHERE project_id = ? AND path = ?`).run(
    content,
    now,
    id,
    filePath,
  )

  const allFiles = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(id) as GeneratedAppFile[]
  const errors = validateGeneratedFiles(allFiles)

  db.prepare(`UPDATE projects SET generation_error = ? WHERE id = ?`).run(
    errors.length > 0 ? errors.join("\n") : null,
    id,
  )

  res.json({ path: filePath, updatedAt: now, errors })
})

/* ---------------- GET /projects/:id/export.zip — скачать файлы проекта ZIP-архивом ---------------- */
router.get("/:id/export.zip", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT id, user_id, name FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }

  const files = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(id) as Array<{ path: string; content: string }>

  if (files.length === 0) {
    return res.status(400).json({ error: "У проекта нет файлов для экспорта" })
  }

  const slug =
    project.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `osgard-project-${id}`

  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${slug}.zip"`)

  const archive = archiver("zip", { zlib: { level: 9 } })
  archive.on("error", (err) => {
    console.error("[projects.export] archive error:", err)
    if (!res.headersSent) res.status(500).json({ error: "Не удалось собрать архив" })
  })
  archive.pipe(res)
  for (const f of files) {
    archive.append(f.content, { name: f.path })
  }
  await archive.finalize()
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
      `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income, status, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, 'ready', ?)`,
    )
    .run(req.user!.userId, name.trim(), description || "", badge || "folder", now)

  const project = db
    .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`)
    .get(Number(info.lastInsertRowid))

  res.status(201).json({ project })
})

function insertStarterArtifacts(
  userId: number,
  projectId: number,
  artifacts: Array<{ name: string; type: string }>,
  now: number,
) {
  const insertArtifact = db.prepare(
    `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed, status, views_24h, supply, price, list_currency, created_at)
     VALUES (?, ?, ?, ?, 'common', 1, ?, ?, ?, ?, 'kept', 0, 1, ?, 'credits', ?)`,
  )

  let count = 0
  for (const a of artifacts) {
    const power = randomStat()
    const defense = randomStat()
    const magic = randomStat()
    const speed = randomStat()
    const price = computePrice({ power, defense, magic, speed })

    insertArtifact.run(userId, projectId, a.name, a.type, power, defense, magic, speed, price, now)
    count += 1
  }

  db.prepare(`UPDATE projects SET artifact_count = ? WHERE id = ?`).run(count, projectId)
}

/** Асинхронный джоб генерации реального приложения — вызывается fire-and-forget сразу
 *  после ответа клиенту. Никогда не бросает наружу: любая ошибка помечает проект failed. */
async function runAppGenerationJob(projectId: number, name: string, hint: string | undefined) {
  try {
    const result = await generateApp(name, hint)
    const errors = validateGeneratedFiles(result.files)

    const insertFile = db.prepare(
      `INSERT INTO project_files (project_id, path, content, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    const now = Date.now()
    for (const file of result.files as GeneratedAppFile[]) {
      insertFile.run(projectId, file.path, file.content, now)
    }

    db.prepare(`UPDATE projects SET status = 'ready', ai_source = ?, generation_error = ? WHERE id = ?`).run(
      result.source,
      errors.length > 0 ? errors.join("\n") : null,
      projectId,
    )
  } catch (err: any) {
    console.error("[projects.generate] app generation job failed:", err)
    db.prepare(`UPDATE projects SET status = 'failed', generation_error = ? WHERE id = ?`).run(
      err?.message || "Неизвестная ошибка генерации",
      projectId,
    )
  }
}

/* ---------------- POST /projects/generate — генерация реального приложения ----------------
   Принимает { name, hint? }. Сразу создаёт проект (status='generating') вместе со стартовыми
   артефактами (детерминированный локальный рандомайзер — экономика не завязана на AI) и
   отвечает немедленно. Реальная генерация файлов приложения (AI, дольше и дороже по токенам)
   запускается fire-and-forget и обновляет projects.status по завершении — фронтенд опрашивает
   GET /projects/:id, а не ждёт один долгий запрос.
------------------------------------------------------------------------------- */
router.post("/generate", requireAuth, async (req: AuthRequest, res) => {
  const { name, hint } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название проекта" })
  }

  try {
    const trimmedName = name.trim()
    const safeHint = typeof hint === "string" ? hint : undefined
    const quick = localFallbackGeneration(trimmedName, safeHint)
    const now = Date.now()

    const projectInfo = db
      .prepare(
        `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income, status, created_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, 'generating', ?)`,
      )
      .run(req.user!.userId, trimmedName, quick.description, quick.badge, now)

    const projectId = Number(projectInfo.lastInsertRowid)
    insertStarterArtifacts(req.user!.userId, projectId, quick.artifacts, now)

    const project = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`).get(projectId)
    const artifacts = db
      .prepare(
        `SELECT id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
                status, views_24h as views24h, supply, price, list_currency as listCurrency, created_at as createdAt
         FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId)

    res.status(202).json({ project, artifacts, aiConfigured: isAiConfigured() })

    void runAppGenerationJob(projectId, trimmedName, safeHint)
  } catch (err) {
    console.error("[projects.generate] error:", err)
    res.status(500).json({ error: "Не удалось создать проект" })
  }
})

/* ---------------- POST /projects/:id/publish-github — публикация в GitHub пользователя ----------------
   Требует, чтобы пользователь подключил GitHub для публикации (GET /auth/github/publish/connect,
   scope repo). Коммитит все project_files одним атомарным коммитом через Git Data API
   (blob → tree → commit → ref) — Contents API создал бы отдельный коммит на файл.
------------------------------------------------------------------------------- */
router.post("/:id/publish-github", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }
  if (project.status !== "ready") {
    return res.status(400).json({ error: "Проект ещё не готов к публикации" })
  }

  const files = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(id) as Array<{ path: string; content: string }>

  if (files.length === 0) {
    return res.status(400).json({ error: "У проекта нет файлов для публикации" })
  }

  const user: any = db.prepare(`SELECT github_publish_token_encrypted, github_publish_username FROM users WHERE id = ?`).get(req.user!.userId)
  if (!user?.github_publish_token_encrypted || !user?.github_publish_username) {
    return res.status(400).json({ error: "GitHub не подключён для публикации. Подключите его в настройках." })
  }

  const token = decrypt(user.github_publish_token_encrypted)
  const owner = user.github_publish_username as string
  const repoName = (typeof req.body?.repoName === "string" && req.body.repoName.trim()) || project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `osgard-project-${id}`

  const octokit = new Octokit({ auth: token })

  try {
    let repo: any
    try {
      const existing = await octokit.repos.get({ owner, repo: repoName })
      repo = existing.data
    } catch (err: any) {
      if (err?.status !== 404) throw err
      const created = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        private: !!req.body?.private,
        auto_init: true,
        description: project.description || undefined,
      })
      repo = created.data
    }

    const defaultBranch = repo.default_branch || "main"
    const refData = await octokit.git.getRef({ owner, repo: repoName, ref: `heads/${defaultBranch}` })
    const latestCommitSha = refData.data.object.sha

    const latestCommit = await octokit.git.getCommit({ owner, repo: repoName, commit_sha: latestCommitSha })
    const baseTreeSha = latestCommit.data.tree.sha

    const blobs = await Promise.all(
      files.map(async (f) => {
        const blob = await octokit.git.createBlob({ owner, repo: repoName, content: f.content, encoding: "utf-8" })
        return { path: f.path, sha: blob.data.sha }
      }),
    )

    const tree = await octokit.git.createTree({
      owner,
      repo: repoName,
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({ path: b.path, mode: "100644" as const, type: "blob" as const, sha: b.sha })),
    })

    const commit = await octokit.git.createCommit({
      owner,
      repo: repoName,
      message: `OSGARD: публикация проекта "${project.name}"`,
      tree: tree.data.sha,
      parents: [latestCommitSha],
    })

    await octokit.git.updateRef({ owner, repo: repoName, ref: `heads/${defaultBranch}`, sha: commit.data.sha })

    res.json({ repoUrl: repo.html_url, commitSha: commit.data.sha })
  } catch (err: any) {
    console.error("[projects.publish-github] error:", err)
    res.status(500).json({ error: err?.message || "Не удалось опубликовать проект в GitHub" })
  }
})

/* ---------------- POST /projects/:id/deploy-netlify — задеплоить проект на Netlify ----------------
   Серверный NETLIFY_AUTH_TOKEN (единый платформенный аккаунт), не пер-пользовательский OAuth.
   Тот же fire-and-forget паттерн, что и генерация приложения: отвечаем сразу
   (deploy_status='deploying'), реальная сборка (npm install + next build) и загрузка
   запускаются в фоне, фронтенд опрашивает GET /projects/:id.
------------------------------------------------------------------------------- */
router.post("/:id/deploy-netlify", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }
  if (project.status !== "ready") {
    return res.status(400).json({ error: "Проект ещё не готов к деплою" })
  }
  if (!isNetlifyConfigured()) {
    return res.status(400).json({ error: "Деплой не сконфигурирован на сервере (NETLIFY_AUTH_TOKEN)" })
  }
  if (project.deploy_status === "deploying") {
    return res.status(400).json({ error: "Деплой уже выполняется" })
  }

  db.prepare(`UPDATE projects SET deploy_status = 'deploying', deploy_error = NULL WHERE id = ?`).run(id)
  const updated = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`).get(id)

  res.status(202).json({ project: updated })

  void runNetlifyDeployJob(id)
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

  const updated = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`).get(id)

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
  db.prepare(`DELETE FROM project_files WHERE project_id = ?`).run(id)
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id)

  res.json({ ok: true })
})

export default router
