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
import {
  PROJECT_SELECT_COLUMNS,
  createGeneratedProject,
  refineGeneratedProject,
  repairGeneratedProject,
} from "../lib/project-generation"
import { rateLimit } from "../middleware/rateLimiter"
import { GENERATION_DEPTHS, resolveDepth, serializeDepths } from "../lib/generation-depths"
import { logAudit } from "../lib/audit"
import { generationEvents, getRecentStages, type GenerationStreamEvent } from "../lib/generation-events"
import { guestProjectCapReached } from "../lib/guest-service"
import { getLessonsReport } from "../lib/craft-corpus"
import { getTemplateSavingsReport } from "../services/template-store"
import {
  refinementsRemaining,
  recordRefinement,
  setRefinementStatus,
  listProjectRefinements,
  REFINEMENT_CREDIT_COST,
} from "../lib/refinements"
import { resolveProjectTitle } from "../lib/project-title"

const router = Router()

/** Счётчик активных SSE-подключений к живому логу генерации — для /health и диагностики. */
export let activeGenerationSseConnections = 0

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

/* Единый 409-ответ хард-капа гостя (is_guest=1 → максимум один проект).
   Сама проверка — guestProjectCapReached в lib/guest-service (БД-логика воронки,
   юнит-тестируемая); здесь остаётся только HTTP-обвязка. Применяется к обоим
   путям создания (POST /projects и POST /projects/generate) ДО квот/списаний. */
const GUEST_CAP_RESPONSE = {
  error:
    "Гостевой доступ — один бесплатный проект. Зарегистрируйтесь, чтобы создавать больше проектов и открыть доработки.",
  code: "GUEST_PROJECT_LIMIT",
} as const

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

/* ---------------- GET /projects/platform-memory — чему платформа научилась ----------------
   Обе памяти корпуса ремесла (lib/craft-corpus) БЫЛИ слепыми: `getLessonsReport` и
   `getTemplateSavingsReport` существовали, но не были подключены ни к одному роуту —
   ни из UI, ни из API нельзя было увидеть, учится ли платформа на самом деле. А шелла
   в прод-контейнер нет, значит проверить было нечем в принципе: «платформа учится»
   оставалось утверждением про код, а не наблюдаемым фактом.

   Отдельно показываем `silent` — правила, которые копятся в базе, но в промпт не
   попадают из-за отсутствующей формулировки. Это тихий регресс: счётчик растёт,
   обучения нет. Ровно он и случился до волны 2 с правилами досборки контракта.

   Данные не приватные (имена правил, счётчики, агрегаты по шаблонам) и не привязаны к
   пользователю, поэтому доступ — любому авторизованному: честность платформы адресована
   тому, кто ей платит за генерацию. Ленивый доступ к БД внутри хендлера — как и в
   остальных роутах после инцидента #59. */
router.get("/platform-memory", requireAuth, (_req: AuthRequest, res) => {
  const lessons = getLessonsReport()

  let savings: { templates: number; reuses: number; tokensSaved: number } = {
    templates: 0,
    reuses: 0,
    tokensSaved: 0,
  }
  try {
    savings = getTemplateSavingsReport()
  } catch {
    /* Схема без миграции корпуса — витрина остаётся честно нулевой. Витрина памяти
       не имеет права ронять ответ: она диагностическая, а не критичная. */
  }

  res.json({
    /* Память ошибок: на чём генератор ломается и что из этого реально уходит в промпт. */
    mistakes: {
      rules: lessons.rules,
      occurrences: lessons.occurrences,
      promptLimit: lessons.promptLimit,
      taught: lessons.taught,
      silent: lessons.silent,
      /* Прямая метрика бесполезной учёбы: правила есть, обучения нет. */
      silentRules: lessons.silent.length,
    },
    /* Память удач: корпус шаблонов, отобранных по измеримому качеству. */
    successes: savings,
    /* Учится ли платформа хоть чему-нибудь прямо сейчас — одним булевым полем, чтобы
       витрина не заставляла считать это глазами. */
    learning: lessons.taught.length > 0,
    /* --- Авторство уроков (волна 5) ---
       Рукописный словарь формулировок был пределом обучения: правило без строки в
       КОДЕ промпт отбрасывал навсегда. Теперь платформа формулирует урок сама, и
       витрина обязана показывать это отдельно от рукописного — вместе с ОТКАЗАМИ
       разбора. Иначе «платформа не научилась» снова становится необъяснимым фактом:
       непонятно, дефектов не было или модель не смогла сформулировать урок. */
    authoring: {
      selfAuthored: lessons.selfAuthored,
      failures: lessons.authoringFailures,
    },
  })
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

/* ---------------- POST /projects — DEPRECATED ----------------
   Создаёт проект без файлов и без генерации (status='ready', project_files пуст).
   Фронтенд больше не вызывает этот путь — единственный способ создания проекта
   теперь POST /projects/generate (ниже), который гарантированно проходит через
   реальную генерацию. Оставлено для обратной совместимости внешних интеграций;
   удалить отдельным тикетом после недели наблюдения по логам.
------------------------------------------------------------------------------- */
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const { name, description, badge } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название проекта" })
  }

  /* Хард-кап гостя действует и на ручное создание — гость = один проект любым путём. */
  if (guestProjectCapReached(req.user!.userId)) {
    return res.status(409).json(GUEST_CAP_RESPONSE)
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
  const safeHint = typeof hint === "string" ? hint : undefined

  /* Имя не обязательно: если человек уже описал идею (hint), название
     выводится из неё же кодом — см. lib/project-title.ts. Обязательна
     хоть какая-то суть запроса (имя ИЛИ идея), иначе генерировать нечего. */
  const hasName = typeof name === "string" && name.trim()
  const hasHint = !!safeHint?.trim()
  if (!hasName && !hasHint) {
    return res.status(400).json({ error: "Опишите идею или укажите название проекта" })
  }
  const resolvedName = resolveProjectTitle(name, safeHint)

  /* Хард-кап гостя: второй проект гостя отклоняется ДО квот/списаний. */
  if (guestProjectCapReached(userId)) {
    return res.status(409).json(GUEST_CAP_RESPONSE)
  }

  const depth = resolveDepth(req.body?.depth)
  const depthCfg = GENERATION_DEPTHS[depth]

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
      const { project, artifacts } = createGeneratedProject({ userId, name: resolvedName, hint: safeHint, depth })
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
    ).run(userId, `Генерация (${depthCfg.label}): ${resolvedName}`, cost)
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  logAudit(userId, "debit", cost, "project_generation", { depth, name: resolvedName })

  try {
    const { project, artifacts } = createGeneratedProject({ userId, name: resolvedName, hint: safeHint, depth })
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

/* ---------------- POST /projects/:id/refine — доработка проекта (домен B) ----------------
   Доработка = AI-итерация существующего проекта. Экономика воронки: первые
   FREE_REFINEMENTS_GRANT бесплатны (грант на аккаунт), дальше — REFINEMENT_CREDIT_COST
   кредитов. Проверяем владение → считаем остаток → списываем (если платно) → пишем
   строку леджера → переводим проект в generating и запускаем регенерацию файлов.
   При синхронном сбое запуска — возврат кредитов (как в /generate). Отвечаем 202.
------------------------------------------------------------------------------- */
router.post("/:id/refine", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const projectId = Number(req.params.id)
  const userId = req.user!.userId
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : ""

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: "Некорректный id проекта" })
  }
  if (!prompt) {
    return res.status(400).json({ error: "Опишите, что доработать" })
  }
  if (prompt.length > 2000) {
    return res.status(400).json({ error: "Слишком длинное описание доработки (макс. 2000 символов)" })
  }

  // Владение: чужой/несуществующий проект → 404 без утечки чужих id.
  const project = db
    .prepare(`SELECT id, status FROM projects WHERE id = ? AND user_id = ?`)
    .get(projectId, userId) as { id: number; status: string } | undefined
  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.status === "generating") {
    return res.status(409).json({ error: "Проект уже в процессе генерации — дождитесь завершения", code: "BUSY" })
  }

  const remaining = refinementsRemaining(userId)
  const isFree = remaining > 0
  const cost = isFree ? 0 : REFINEMENT_CREDIT_COST

  // Платная доработка (грант исчерпан): честное списание кредитов транзакцией.
  if (!isFree) {
    const wallet = db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(userId) as
      | { credits: number }
      | undefined
    if (!wallet) return res.status(402).json({ error: "Кошелёк не найден", code: "NO_WALLET" })
    if (wallet.credits < cost) {
      return res.status(402).json({
        error: `Бесплатные доработки исчерпаны. Одна доработка — ${cost} кредитов, доступно ${wallet.credits}.`,
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
         VALUES (?, 'project_refinement', ?, 'OSGARD', ?, 'credits', 'done')`,
      ).run(userId, `Доработка проекта #${projectId}`, cost)
      db.exec("COMMIT")
    } catch (err) {
      db.exec("ROLLBACK")
      throw err
    }
    logAudit(userId, "debit", cost, "project_refinement", { projectId })
  }

  // Строка леджера (cost_credits=0 у бесплатных — так считается остаток гранта).
  const refinementId = recordRefinement({ userId, projectId, prompt, costCredits: cost })

  // Запуск регенерации файлов по промпту. onDone отметит статус строки в леджере.
  const started = refineGeneratedProject({
    userId,
    projectId,
    prompt,
    onDone: (ok) => setRefinementStatus(refinementId, ok ? "ready" : "failed"),
  })

  if (!started) {
    // Синхронный сбой запуска — откат: помечаем строку failed и возвращаем кредиты.
    setRefinementStatus(refinementId, "failed")
    if (cost > 0) {
      db.exec("BEGIN IMMEDIATE")
      try {
        db.prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`).run(cost, Date.now(), userId)
        db.exec("COMMIT")
      } catch {
        db.exec("ROLLBACK")
      }
      logAudit(userId, "credit", cost, "project_refinement_refund", { projectId })
    }
    return res.status(500).json({ error: "Не удалось запустить доработку" + (cost > 0 ? ", кредиты возвращены" : "") })
  }

  return res.status(202).json({
    success: true,
    projectId,
    refinementId,
    costCredits: cost,
    refinementsRemaining: refinementsRemaining(userId),
    aiConfigured: isAiConfigured(),
  })
}))

/* ---------------- GET /projects/:id/refinements — лента доработок проекта ---------------- */
router.get("/:id/refinements", requireAuth, (req: AuthRequest, res) => {
  const projectId = Number(req.params.id)
  const userId = req.user!.userId
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: "Некорректный id проекта" })
  }
  const owns = db.prepare(`SELECT 1 FROM projects WHERE id = ? AND user_id = ?`).get(projectId, userId)
  if (!owns) return res.status(404).json({ error: "Проект не найден" })
  return res.json({
    refinements: listProjectRefinements(projectId),
    refinementsRemaining: refinementsRemaining(userId),
  })
})

/* ---------------- GET /projects/:id/design — дизайн-система приложения ----------------
   Показывает, из чего сложился облик проекта: архетип, палитра с ЗАМЕРЕННЫМИ контрастами,
   типографика, ритм — плюс балл качества интерфейса с разбором (lib/design-qa.ts).
   Только владельцу; 404 и на чужой, и на отсутствующий проект — без энумерации.
   Legacy-проекты (сгенерированные до миграции 090) честно отдают designed:false,
   а не выдуманный задним числом бриф. */
router.get("/:id/design", requireAuth, (req: AuthRequest, res) => {
  const projectId = Number(req.params.id)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: "Некорректный id проекта" })
  }

  // Ленивый prepare внутри хендлера: ссылка на колонки миграции 090 на уровне модуля
  // уронила бы boot на БД, где миграция ещё не отработала (урок инцидента #59).
  let row: { designBrief: string | null; designScore: number | null; designReport: string | null } | undefined
  try {
    row = db
      .prepare(
        `SELECT design_brief as designBrief, design_score as designScore, design_report as designReport
         FROM projects WHERE id = ? AND user_id = ?`,
      )
      .get(projectId, req.user!.userId) as typeof row
  } catch {
    // Схема без колонок 090 — отвечаем честно «не записано», а не 500.
    const owns = db.prepare(`SELECT 1 FROM projects WHERE id = ? AND user_id = ?`).get(projectId, req.user!.userId)
    if (!owns) return res.status(404).json({ error: "Проект не найден" })
    return res.json({ designed: false, brief: null, score: null, report: null })
  }

  if (!row) return res.status(404).json({ error: "Проект не найден" })

  const parse = (value: string | null) => {
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  const brief = parse(row.designBrief)
  return res.json({
    designed: brief !== null,
    brief,
    score: typeof row.designScore === "number" ? row.designScore : null,
    report: parse(row.designReport),
  })
})

/* ---------------- GET /projects/:id/engineering — инженерный вердикт приложения ----------------
   Показывает, ЧЕМ доказана работоспособность приложения: список проверок (граф модулей,
   клиент/сервер, контракт статического экспорта, чистота исходников), остаточные дефекты,
   журнал того, что платформа починила сама, и был ли реальный `next build` в песочнице.
   Только владельцу; 404 и на чужой, и на отсутствующий проект — без энумерации.
   Legacy-проекты (сгенерированные до миграции 091) честно отдают verified:false —
   вердикт, которого никто не выносил, задним числом не выдумываем. */
router.get("/:id/engineering", requireAuth, (req: AuthRequest, res) => {
  const projectId = Number(req.params.id)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: "Некорректный id проекта" })
  }

  // Ленивый prepare внутри хендлера — ссылка на колонки 091 на уровне модуля
  // уронила бы boot на БД, где миграция ещё не отработала (урок инцидента #59).
  let row: { buildStatus: string | null; buildReport: string | null; verifiedAt: number | null } | undefined
  try {
    row = db
      .prepare(
        `SELECT build_status as buildStatus, build_report as buildReport, build_verified_at as verifiedAt
         FROM projects WHERE id = ? AND user_id = ?`,
      )
      .get(projectId, req.user!.userId) as typeof row
  } catch {
    const owns = db.prepare(`SELECT 1 FROM projects WHERE id = ? AND user_id = ?`).get(projectId, req.user!.userId)
    if (!owns) return res.status(404).json({ error: "Проект не найден" })
    return res.json({ verified: false, verdict: null, report: null, verifiedAt: null })
  }

  if (!row) return res.status(404).json({ error: "Проект не найден" })

  let report: unknown = null
  if (row.buildReport) {
    try {
      report = JSON.parse(row.buildReport)
    } catch {
      report = null
    }
  }

  /* Счётчик расхода (колонки 095) — отдельным запросом и в собственном try/catch
     по той же причине, что и сам вердикт выше: на БД без миграции 095 отсутствие
     счётчика не имеет права спрятать уже посчитанный инженерный вердикт. */
  let meter: {
    aiCalls: number | null
    tokensIn: number | null
    tokensOut: number | null
    durationMs: number | null
    firstTry: boolean | null
    detail: unknown
  } | null = null
  try {
    const m = db
      .prepare(
        `SELECT gen_ai_calls as aiCalls, gen_tokens_in as tokensIn, gen_tokens_out as tokensOut,
                gen_duration_ms as durationMs, gen_first_try as firstTry, gen_meter as detail
         FROM projects WHERE id = ? AND user_id = ?`,
      )
      .get(projectId, req.user!.userId) as
      | {
          aiCalls: number | null
          tokensIn: number | null
          tokensOut: number | null
          durationMs: number | null
          firstTry: number | null
          detail: string | null
        }
      | undefined
    // measured:false у старых проектов — расход не измерялся, это не «ноль потрачено».
    if (m && m.durationMs !== null) {
      let detail: unknown = null
      if (m.detail) {
        try {
          detail = JSON.parse(m.detail)
        } catch {
          detail = null
        }
      }
      meter = {
        aiCalls: m.aiCalls,
        tokensIn: m.tokensIn,
        tokensOut: m.tokensOut,
        durationMs: m.durationMs,
        firstTry: m.firstTry === null ? null : m.firstTry === 1,
        detail,
      }
    }
  } catch {
    meter = null
  }

  return res.json({
    verified: !!row.buildStatus,
    verdict: row.buildStatus,
    report,
    verifiedAt: row.verifiedAt ?? null,
    meter,
  })
})

/* ---------------- POST /projects/:id/repair — повторный прогон инженерного контура ----------------
   Вердикт «broken» не должен быть приговором: пользователь может попросить платформу
   попробовать снова. Контур гоняется по УЖЕ СОХРАНЁННЫМ файлам проекта (генерация с нуля
   не запускается, артефакты и замысел не трогаются), чинит что может и переписывает вердикт.

   Дорогая ручка (AI-перегенерация дефектных файлов), поэтому: только владелец, только не
   во время генерации, не чаще 3 раз в 10 минут на пользователя. Отвечаем 202 и гоняем
   фоном — прогресс идёт тем же SSE-логом, что и генерация. */
router.post(
  "/:id/repair",
  requireAuth,
  rateLimit(10 * 60 * 1000, 3, (req) => `repair:${(req as AuthRequest).user?.userId ?? req.ip}`),
  asyncHandler(async (req: AuthRequest, res) => {
    const projectId = Number(req.params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Некорректный id проекта" })
    }

    const project = db
      .prepare(`SELECT id, name, description, status FROM projects WHERE id = ? AND user_id = ?`)
      .get(projectId, req.user!.userId) as
      | { id: number; name: string; description: string | null; status: string }
      | undefined

    if (!project) return res.status(404).json({ error: "Проект не найден" })
    if (project.status === "generating") {
      return res.status(409).json({ error: "Проект сейчас генерируется — дождитесь завершения" })
    }

    const started = repairGeneratedProject({ userId: req.user!.userId, projectId })
    if (!started) return res.status(400).json({ error: "У проекта нет файлов для проверки" })

    const updated = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`).get(projectId)
    return res.status(202).json({ project: updated })
  }),
)

/* ---------------- GET /projects/:id/stream — живой SSE-лог рождения проекта ----------------
   Фоновый джоб генерации (lib/project-generation.ts) эмитит стадии через generationEvents;
   этот поток проталкивает их владельцу проекта в реальном времени — страница проекта
   показывает живой прогресс вместо статичного спиннера. При подключении: снапшот статуса +
   реплей буферизованных стадий (джоб стартует до подписки клиента, первые стадии могли
   отыграть раньше). Опрос GET /projects/:id остаётся резервным каналом. Паттерн повторяет
   GET /notifications/stream. Доступ строго к своему проекту (иначе 404, без утечки чужих id).
------------------------------------------------------------------------------- */
router.get("/:id/stream", requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const userId = req.user!.userId
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Некорректный ID проекта" })

  const project: any = db.prepare(`SELECT user_id, status FROM projects WHERE id = ?`).get(id)
  // Один и тот же 404 и на несуществующий, и на чужой — не даём энумерировать чужие проекты.
  if (!project || project.user_id !== userId) {
    return res.status(404).json({ error: "Проект не найден" })
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  const send = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  // Снапшот текущего статуса — клиент сразу знает, генерится проект или уже завершён.
  send({ type: "snapshot", projectId: id, status: project.status })

  // Реплей накопленных стадий (поздний подписчик получает лог, а не пустоту).
  const buffered = getRecentStages(id)
  for (const evt of buffered) send(evt)

  const bufferedTerminal = buffered.some((e) => e.stage === "ready" || e.stage === "failed")

  // Если генерация уже завершилась к моменту подписки, а терминальной стадии в буфере нет
  // (буфер протух/джоб был до перезапуска сервера) — синтезируем терминал из БД и закрываем.
  if (project.status !== "generating" && !bufferedTerminal) {
    const errorRow: any =
      project.status === "failed"
        ? db.prepare(`SELECT generation_error FROM projects WHERE id = ?`).get(id)
        : null
    send({
      type: "stage",
      projectId: id,
      stage: project.status === "failed" ? "failed" : "ready",
      label: project.status === "failed" ? "Ошибка генерации" : "Приложение готово",
      progress: 1,
      error: errorRow?.generation_error || undefined,
      at: Date.now(),
    })
    return res.end()
  }
  // Терминал уже был отдан из буфера — закрываемся, не подписываемся зря.
  if (bufferedTerminal) return res.end()

  const channel = `gen:${id}`
  /* Канал несёт и стадии, и тики живого счётчика расхода (type:"meter").
     Тик стадию не меняет и поток не закрывает — закрываемся только на терминале. */
  const onStage = (evt: GenerationStreamEvent) => {
    send(evt)
    if (evt.type === "stage" && (evt.stage === "ready" || evt.stage === "failed")) {
      cleanup()
      res.end()
    }
  }

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000)
  const cleanup = () => {
    clearInterval(heartbeat)
    generationEvents.off(channel, onStage)
    activeGenerationSseConnections--
  }

  activeGenerationSseConnections++
  generationEvents.on(channel, onStage)
  req.on("close", cleanup)
})

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
