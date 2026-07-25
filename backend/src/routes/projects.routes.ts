import { Router } from "express"
import { Octokit } from "@octokit/rest"
import archiver from "archiver"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { isAiConfigured } from "../services/ai-generator"
import { validateGeneratedFiles, GeneratedAppFile } from "../services/app-generator"
import { runNetlifyDeployJob, isNetlifyConfigured } from "../services/netlify-deploy"
import { verifyBuildInSandbox } from "../services/sandbox.service"
import { decrypt } from "../utils/encryption"
import { asyncHandler } from "../utils/async-handler"
import { captureError } from "../lib/sentry"
import { PROJECT_SELECT_COLUMNS, createGeneratedProject } from "../lib/project-generation"
import { GENERATION_DEPTHS, resolveDepth, serializeDepths } from "../lib/generation-depths"
import { logAudit } from "../lib/audit"

const router = Router()

const LIST_CURRENCY_BY_RARITY: Record<string, string> = {
  common: "credits",
  rare: "shards",
  epic: "shards",
  legendary: "crystals",
  mythic: "timecoin",
}

/* Дневные лимиты генераций проектов по тарифу (users.plan). null = без лимита. */
const DAILY_GENERATION_LIMITS: Record<string, number | null> = {
  free: 5,
  architect: 15,
  master: 40,
  legend: null,
}

function getTodayStartMs(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/* ---------------- GET /projects/generation-limits — дневной лимит генераций по тарифу ---------------- */
router.get("/generation-limits", requireAuth, (req: AuthRequest, res) => {
  const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(req.user!.userId)
  const plan = userRow?.plan || "free"
  const dailyLimit = DAILY_GENERATION_LIMITS[plan] ?? DAILY_GENERATION_LIMITS.free

  const todayStart = getTodayStartMs()
  // Квоту тратят только бесплатные (quick) генерации; платные (standard/deep) — нет.
  const { count } = db
    .prepare(
      `SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND created_at >= ? AND generation_depth = 'quick'`,
    )
    .get(req.user!.userId, todayStart) as { count: number }

  res.json({
    plan,
    dailyLimit,
    used: count,
    remaining: dailyLimit === null ? null : Math.max(0, dailyLimit - count),
    depths: serializeDepths(),
  })
})

/* ---------------- GET /projects/generation-depths — каталог уровней глубины ---------------- */
router.get("/generation-depths", requireAuth, (_req: AuthRequest, res) => {
  res.json({ depths: serializeDepths() })
})

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
router.get("/:id/export.zip", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
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
    captureError("[projects.export] archive error:", err)
    if (!res.headersSent) res.status(500).json({ error: "Не удалось собрать архив" })
  })
  archive.pipe(res)
  for (const f of files) {
    archive.append(f.content, { name: f.path })
  }
  await archive.finalize()
}))

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

/* ---------------- POST /projects/generate — генерация реального приложения ----------------
   Принимает { name, hint? }. Сразу создаёт проект (status='generating') вместе со стартовыми
   артефактами (детерминированный локальный рандомайзер — экономика не завязана на AI) и
   отвечает немедленно. Реальная генерация файлов приложения (AI, дольше и дороже по токенам)
   запускается fire-and-forget и обновляет projects.status по завершении — фронтенд опрашивает
   GET /projects/:id, а не ждёт один долгий запрос. Ядро генерации вынесено в общий сервис
   lib/project-generation.ts (его же переиспользует публичный B2B API).
------------------------------------------------------------------------------- */
router.post("/generate", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { name, hint } = req.body || {}
  const userId = req.user!.userId

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название проекта" })
  }

  const depth = resolveDepth(req.body?.depth)
  const depthCfg = GENERATION_DEPTHS[depth]
  const safeHint = typeof hint === "string" ? hint : undefined

  /* --- Бесплатная (quick) генерация: расход дневной квоты тарифа --- */
  if (depthCfg.countsAgainstQuota) {
    const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
    const plan = userRow?.plan || "free"
    const dailyLimit = DAILY_GENERATION_LIMITS[plan] ?? DAILY_GENERATION_LIMITS.free

    if (dailyLimit !== null) {
      const todayStart = getTodayStartMs()
      const { count } = db
        .prepare(
          `SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND created_at >= ? AND generation_depth = 'quick'`,
        )
        .get(userId, todayStart) as { count: number }

      if (count >= dailyLimit) {
        return res.status(429).json({
          error: `Дневной лимит быстрых генераций (${dailyLimit}) для тарифа "${plan}" исчерпан. Попробуйте завтра, улучшите тариф или выберите платную глубину.`,
          plan,
          dailyLimit,
          used: count,
        })
      }
    }

    try {
      const { project, artifacts } = createGeneratedProject({ userId, name, hint: safeHint, depth })
      return res.status(202).json({ project, artifacts, depth, costCredits: 0, aiConfigured: isAiConfigured() })
    } catch (err) {
      captureError("[projects.generate] error:", err)
      return res.status(500).json({ error: "Не удалось создать проект" })
    }
  }

  /* --- Платная глубина (standard/deep): честное списание кредитов --- */
  const cost = depthCfg.credits
  const wallet = db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(userId) as
    | { credits: number }
    | undefined
  if (!wallet) return res.status(402).json({ error: "Кошелёк не найден", code: "NO_WALLET" })
  if (wallet.credits < cost) {
    return res.status(402).json({
      error: `Недостаточно кредитов для глубины «${depthCfg.label}». Требуется ${cost}, доступно ${wallet.credits}.`,
      code: "INSUFFICIENT_CREDITS",
      required: cost,
      available: wallet.credits,
    })
  }

  const now = Date.now()
  db.exec("BEGIN IMMEDIATE")
  try {
    const fresh = db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(userId) as { credits: number }
    if (fresh.credits < cost) {
      db.exec("ROLLBACK")
      return res.status(402).json({ error: "Недостаточно кредитов", code: "INSUFFICIENT_CREDITS" })
    }
    db.prepare(`UPDATE wallets SET credits = credits - ?, updated_at = ? WHERE user_id = ?`).run(cost, now, userId)
    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'project_generation', ?, 'OSGARD', ?, 'credits', 'done')`,
    ).run(userId, `Генерация (${depthCfg.label}): ${name.trim()}`, cost)
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  logAudit(userId, "debit", cost, "project_generation", { depth, name: name.trim() })

  try {
    const { project, artifacts } = createGeneratedProject({ userId, name, hint: safeHint, depth })
    return res.status(202).json({ project, artifacts, depth, costCredits: cost, aiConfigured: isAiConfigured() })
  } catch (err) {
    /* Синхронный сбой создания — честно возвращаем кредиты. */
    db.exec("BEGIN IMMEDIATE")
    try {
      db.prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`).run(cost, Date.now(), userId)
      db.exec("COMMIT")
    } catch {
      db.exec("ROLLBACK")
    }
    logAudit(userId, "credit", cost, "project_generation_refund", { depth })
    captureError("[projects.generate] error:", err)
    return res.status(500).json({ error: "Не удалось создать проект, кредиты возвращены" })
  }
}))

/* ---------------- POST /projects/:id/publish-github — публикация в GitHub пользователя ----------------
   Требует, чтобы пользователь подключил GitHub для публикации (GET /auth/github/publish/connect,
   scope repo). Коммитит все project_files одним атомарным коммитом через Git Data API
   (blob → tree → commit → ref) — Contents API создал бы отдельный коммит на файл.
------------------------------------------------------------------------------- */
router.post("/:id/publish-github", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
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
    captureError("[projects.publish-github] error:", err)
    res.status(500).json({ error: err?.message || "Не удалось опубликовать проект в GitHub" })
  }
}))

/* ---------------- POST /projects/:id/deploy-netlify — задеплоить проект на Netlify ----------------
   Серверный NETLIFY_AUTH_TOKEN (единый платформенный аккаунт), не пер-пользовательский OAuth.
   Тот же fire-and-forget паттерн, что и генерация приложения: отвечаем сразу
   (deploy_status='deploying'), реальная сборка (npm install + next build) и загрузка
   запускаются в фоне, фронтенд опрашивает GET /projects/:id.
------------------------------------------------------------------------------- */
router.post("/:id/deploy-netlify", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
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
}))

/* ---------------- POST /projects/:id/verify-build — реальная проверка сборки в Docker-песочнице ----------------
   В отличие от инлайн-валидации при сохранении файла (ts.transpileModule — только
   синтаксис), здесь запускается полноценный `next build` в изолированном контейнере.
   Занимает секунды, поэтому await прямо в запросе (клиент показывает спиннер). */
router.post("/:id/verify-build", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT id, user_id FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }

  const files = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(id) as Array<{ path: string; content: string }>

  if (files.length === 0) {
    return res.status(400).json({ error: "У проекта нет файлов для проверки" })
  }

  const result = await verifyBuildInSandbox(files, { logLabel: `verify-build-${id}` })
  res.json({
    ok: result.ok,
    skipped: result.skipped,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    logs: result.logs.slice(-8000), // хвост лога сборки, без гигантских выводов
  })
}))

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
