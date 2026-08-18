import { Router } from "express"
import { Octokit } from "@octokit/rest"
import archiver from "archiver"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import {
  getProjectGenerationReadiness,
  getVerifiedProjectGenerationReadiness,
  isProjectGenerationConfigured,
  validateGeneratedFiles,
  GeneratedAppFile,
} from "../services/app-generator"
import { resolveDeployTarget, runDeployJob } from "../services/deploy-target"
import { verifyBuildInSandbox } from "../services/sandbox.service"
import { decrypt } from "../utils/encryption"
import { asyncHandler } from "../utils/async-handler"
import { captureError } from "../lib/sentry"
import {
  PROJECT_SELECT_COLUMNS,
  createGeneratedProject,
  planGeneration,
  refineGeneratedProject,
  repairGeneratedProject,
} from "../lib/project-generation"
import { rateLimit } from "../middleware/rateLimiter"
import { GENERATION_DEPTHS, resolveDepth, serializeDepths, type GenerationDepth } from "../lib/generation-depths"
import { allowsServerCode, normalizeAppProfile } from "../lib/app-profiles"
import { getAppDatabase, releaseAppDatabase } from "../services/app-database-binding"
import { estimateAllDepths, loadGenerationSamples, type GenerationPath } from "../lib/generation-estimate"
import { resolveDailyLimit, quotaRemaining } from "../lib/generation-quota"
import {
  attachMakegoodProject,
  consumeMakegood,
  findMakegoodFor,
  openMakegood,
  releaseMakegood,
  MAKEGOOD_REASON_TEXT,
} from "../lib/generation-makegood"
import { logAudit } from "../lib/audit"
import { generationEvents, getRecentStages, type GenerationStreamEvent } from "../lib/generation-events"
import { guestProjectCapReached } from "../lib/guest-service"
import {
  readEngineeringGate,
  deployNeedsAcknowledgement,
  describeBrokenGate,
} from "../lib/engineering-gate"
import { getLessonsReport } from "../lib/craft-corpus"
import { learningCoverage } from "../lib/learning-coverage"
import { getTemplateSavingsReport } from "../services/template-store"
import {
  refinementsRemaining,
  recordRefinement,
  setRefinementStatus,
  listProjectRefinements,
  REFINEMENT_CREDIT_COST,
} from "../lib/refinements"
import { normalizeRefinementKind } from "../lib/refinement-kinds"
import { resolveProjectTitle } from "../lib/project-title"
import { assessRequestClarity } from "../lib/request-clarity"

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
  const dailyLimit = resolveDailyLimit(plan)

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
    remaining: quotaRemaining(dailyLimit, count),
    depths: serializeDepths(),
  })
})

/* ---------------- GET /projects/generation-depths — каталог уровней глубины ---------------- */
router.get("/generation-depths", requireAuth, (_req: AuthRequest, res) => {
  res.json({ depths: serializeDepths() })
})

/* Готовность именно проектного конвейера, а не наличие любого AI-ключа. */
router.get("/generation-readiness", requireAuth, asyncHandler(async (_req: AuthRequest, res) => {
  res.json(await getVerifiedProjectGenerationReadiness())
}))

/* ---------------- POST /projects/generation-estimate — смета ДО запуска ----------------
   Единственная цифра, которую платформа знала точно ДО генерации, — стоимость в
   кредитах. Всё остальное (сколько обращений к моделям, сколько токенов, сколько
   ждать) выяснялось постфактум из колонок 095 — то есть когда квота уже потрачена.
   Ровно это на рынке AI-сборщиков и вызывает главную претензию: цена попытки
   известна только после попытки.

   Здесь смета считается по СОБСТВЕННОЙ истории платформы (lib/generation-estimate) и
   отдаётся по всем глубинам сразу: выбор должен быть осознанным до списания, а
   сравнивать варианты постфактум бессмысленно.

   Путь генерации (шаблон или полная AI-сборка) предсказывается тем же кодом, который
   его потом и выберет (`planGeneration`) — обещание и факт не могут разойтись по
   конструкции.

   POST, а не GET: замысел пользователя — произвольный текст до 2000 символов, ему не
   место в query-строке (логи, длина URL). Тело не меняет состояние; идемпотентно.
------------------------------------------------------------------------------- */
router.post(
  "/generation-estimate",
  requireAuth,
  /* Смета читает историю и корпус шаблонов на каждый вызов, а вызывается на каждое
     изменение выбора в мастере — ограничитель защищает от превращения подсказки в
     нагрузку. Лимит щедрый: нормальный человек за 5 минут смету пересчитает несколько
     раз, но не 60. */
  rateLimit(5 * 60 * 1000, 60, (req) => `gen-estimate:${(req as AuthRequest).user?.userId ?? req.ip}`),
  (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const name = typeof req.body?.name === "string" ? req.body.name.slice(0, 200) : undefined
    const hint = typeof req.body?.hint === "string" ? req.body.hint.slice(0, 2000) : undefined

    /* Дневная квота тарифа — вторая половина ответа на вопрос «сколько это стоит»:
       для быстрой генерации цена измеряется не кредитами, а остатком попыток. */
    const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
    const plan = userRow?.plan || "free"
    const dailyLimit = resolveDailyLimit(plan)
    const { count: usedToday } = db
      .prepare(
        `SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND created_at >= ? AND generation_depth = 'quick'`,
      )
      .get(userId, getTodayStartMs()) as { count: number }
    const remainingToday = quotaRemaining(dailyLimit, usedToday)

    /* Путь по каждой глубине — ровно тот, который выберет генерация. Для standard/deep
       шаблонный shortcut отключён (forceAi), поэтому там всегда полная AI-сборка. */
    const pathByDepth = {} as Record<GenerationDepth, GenerationPath>
    let templateTheme: string | null = null
    for (const depth of Object.keys(GENERATION_DEPTHS) as GenerationDepth[]) {
      try {
        const planned = planGeneration({ name, hint, depth })
        pathByDepth[depth] = planned.path
        if (depth === "quick") templateTheme = planned.template ? planned.template.theme : null
      } catch (err) {
        /* Корпус шаблонов недоступен — считаем по дорогому пути: заниженная смета
           обманывает, завышенная только настораживает. */
        captureError("[projects.generation-estimate] план генерации не построен:", err)
        pathByDepth[depth] = "ai"
      }
    }

    const estimates = estimateAllDepths({ samples: loadGenerationSamples(), pathByDepth })

    /* Право на перегенерацию за счёт платформы: если платформа уже промахнулась, человек
       должен видеть это ДО запуска — иначе он второй раз заплатит за наш промах, просто
       не зная, что платить не нужно. */
    const right = openMakegood(userId)

    res.json({
      plan,
      quota: { dailyLimit, used: usedToday, remaining: remainingToday },
      /* Тема, по которой подобрался готовый шаблон (null — шаблона нет). Объясняет,
         почему быстрая генерация дешевле: платформа уже собирала похожее. */
      templateTheme,
      estimates,
      readiness: getProjectGenerationReadiness(),
      makegood: right
        ? {
            available: true,
            depth: right.depth,
            credits: right.credits,
            projectId: right.projectId,
            reason: right.reason,
            reasonText: MAKEGOOD_REASON_TEXT[right.reason],
          }
        : { available: false },
      /* Честная оговорка к точности — не украшение ответа, а его условие:
         смета основана на прошлом, а не на знании будущего. */
      disclaimer:
        "Смета построена на реальном расходе прошлых генераций платформы. Это ожидание, а не гарантия: конкретный запуск может обойтись дороже или дешевле.",
    })
  },
)

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
    /* --- Польза уроков (волна 6) ---
       Волна 5 научилась мерить пользу урока, но наружу уходило только сырое число
       повторов у каждого урока — вывода из измерения витрина не делала. Здесь виден
       сам вывод: сколько уроков доказанно работают, сколько доказанно нет, и какие
       уроки в промпт НЕ попали с указанием причины.

       Причина обязательна: «не работает» — вина формулировки и повод её переписать,
       «вне топа» — просто редкий дефект и никакой вины. Без этого различия
       отсутствие урока в промпте выглядит как поломка отбора. */
    effectiveness: {
      working: lessons.working,
      failing: lessons.failing,
      demoted: lessons.demoted,
      /* --- Точка отсчёта у каждого урока (волна 8) ---
         Прод показал, что `working`/`failing` были обречены на ноль: у всех боевых
         правил формулировка рукописная, а у рукописного урока не было момента, с
         которого можно считать повторы. Волна 8 такой момент завела — и вместе с ним
         третье, ЧЕСТНОЕ состояние: измерение началось, но доказательства пока нет.

         Показывать его отдельно обязательно. Иначе на следующий день после миграции
         витрина отрапортовала бы «13 уроков доказанно работают», не измерив ничего:
         ноль повторов у урока, который модель видела один раз, — это отсутствие
         данных, а не доказательство пользы. */
      measuring: lessons.measuring,
      /* Уроки с формулировкой, которые в промпт ещё не уходили ни разу (редкий дефект
         вне топа) — их не измеряет никто, и это не то же самое, что «идёт измерение». */
      unmeasured: lessons.unmeasured,
      /* Сколько раз машинная формулировка вытеснила рукописную, потому что та
         измеренно не работала. Единственное исключение из приоритета рукописного
         текста, поэтому оно обязано быть видно числом, а не только в логах. */
      supersededHandwritten: lessons.supersededHandwritten,
    },
    /* --- Охват обучения (волна 7) ---
       Всё выше отвечает на вопрос «что платформа знает». Ни одно поле не отвечало на
       вопрос «в какой доле генераций это знание участвует» — а именно там и сидел
       главный дефект: основной, бесплатный путь (адаптация шаблона) собирал промпт
       без уроков вовсе, и витрина при этом честно светила «learning: true».

       Поэтому доля обязана быть видна с разрезом по ветвям: одна общая цифра снова
       спрячет неучащийся путь внутри среднего. `taughtShare === null` значит
       «генераций в окне не было» и отличается от нуля намеренно. */
    coverage: {
      allTime: learningCoverage(),
      /* Окно в неделю — то, по чему замечают регресс: история за всё время
         усредняет «до» и «после» любой правки механизма и молчит месяцами. */
      lastWeek: learningCoverage({ sinceDays: 7 }),
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

  /* Третий ответ, кроме «сгенерировал» и «ошибка»: ВОПРОС. Заявка, из которой
     нельзя понять продукт (битая кодировка, текст без единого слова), не идёт
     в генератор — иначе модель обязана что-то придумать, и человек получает
     чужой продукт за свою квоту (выстрел 30.07.2026: кракозябры → дашборд
     Kubernetes вместо лендинга). Проверка стоит ДО квот и списаний.
     См. lib/request-clarity.ts. */
  const clarity = assessRequestClarity({ name, hint: safeHint })
  if (!clarity.clear) {
    return res.status(422).json({
      error: clarity.question,
      code: "unclear_request",
      reason: clarity.reason,
      received: clarity.sample,
    })
  }

  const resolvedName = resolveProjectTitle(name, safeHint)

  /* Хард-кап гостя: второй проект гостя отклоняется ДО квот/списаний. */
  if (guestProjectCapReached(userId)) {
    return res.status(409).json(GUEST_CAP_RESPONSE)
  }

  const depth = resolveDepth(req.body?.depth)
  const depthCfg = GENERATION_DEPTHS[depth]
  /* Режим приложения. Неизвестное значение нормализуется в 'static' — самый
     безопасный режим, а не ошибка запроса: клиент старой версии профиля не знает. */
  const profile = normalizeAppProfile(req.body?.profile)

  /* A verified template needs no provider. A new AI build is rejected before
     quota, makegood, or credit accounting when a mandatory role is missing. */
  const generationPlan = planGeneration({ name: resolvedName, hint: safeHint, depth, profile })
  const verifiedReadiness = generationPlan.path === "ai"
    ? await getVerifiedProjectGenerationReadiness(true)
    : getProjectGenerationReadiness()
  if (generationPlan.path === "ai" && !verifiedReadiness.ready) {
    return res.status(503).json({
      error:
        "Конвейер генерации не готов: для кода нужен OSGARD 4.0, для плана и независимой проверки — OSGARD 5.0 или OSGARD 4.8. Лимит и кредиты не списаны.",
      code: "GENERATION_PROVIDERS_UNAVAILABLE",
      readiness: verifiedReadiness,
    })
  }

  /* --- Бесплатная (quick) генерация: расход дневной квоты тарифа --- */
  if (depthCfg.countsAgainstQuota) {
    const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
    const plan = userRow?.plan || "free"
    const dailyLimit = resolveDailyLimit(plan)

    /* Право на перегенерацию за счёт платформы (lib/generation-makegood) списывается
       здесь ТОЛЬКО при исчерпанной квоте — то есть ровно тогда, когда без него человек
       получил бы отказ. Быстрая генерация в пределах квоты и так ничего не стоит:
       тратить компенсацию на неё значило бы обесценить её молча. */
    let makegoodId: number | null = null

    if (dailyLimit !== null) {
      const todayStart = getTodayStartMs()
      const { count } = db
        .prepare(
          `SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND created_at >= ? AND generation_depth = 'quick'`,
        )
        .get(userId, todayStart) as { count: number }

      if (count >= dailyLimit) {
        const right = findMakegoodFor(userId, depth)
        /* Списываем ДО создания проекта: право должно быть либо потрачено, либо целым.
           Если два запуска борются за одно право, consume победит только у одного. */
        if (right && consumeMakegood(right.id, null)) {
          makegoodId = right.id
        } else {
          return res.status(429).json({
            error: `Дневной лимит быстрых генераций (${dailyLimit}) для тарифа "${plan}" исчерпан. Попробуйте завтра, улучшите тариф или выберите платную глубину.`,
            plan,
            dailyLimit,
            used: count,
          })
        }
      }
    }

    try {
      const { project, artifacts, projectId } = createGeneratedProject({
        userId,
        name: resolvedName,
        hint: safeHint,
        depth,
        profile,
      })
      if (makegoodId !== null) attachMakegoodProject(makegoodId, projectId)
      return res.status(202).json({
        project,
        artifacts,
        depth,
        costCredits: 0,
        /* Клиент обязан сказать человеку, что запуск прошёл за счёт платформы: молчаливая
           компенсация неотличима от сбоя учёта. */
        makegoodApplied: makegoodId !== null,
        aiConfigured: isProjectGenerationConfigured(),
      })
    } catch (err) {
      /* Проект не создан — право возвращаем: иначе платформа промахнулась бы дважды и
         оба раза за счёт пользователя. */
      if (makegoodId !== null) releaseMakegood(makegoodId)
      captureError("[projects.generate] error:", err)
      return res.status(500).json({ error: "Не удалось создать проект" })
    }
  }

  /* --- Платная глубина (standard/deep): честное списание кредитов ---
     Сначала пробуем закрыть запуск правом на перегенерацию за счёт платформы: если
     платформа уже испортила генерацию этой же (или большей) глубины, повторная попытка
     не должна стоить пользователю кредитов. */
  const paidRight = findMakegoodFor(userId, depth)
  if (paidRight && consumeMakegood(paidRight.id, null)) {
    try {
      const { project, artifacts, projectId } = createGeneratedProject({
        userId,
        name: resolvedName,
        hint: safeHint,
        depth,
        profile,
      })
      attachMakegoodProject(paidRight.id, projectId)
      logAudit(userId, "credit", paidRight.credits, "project_generation_makegood", {
        depth,
        failedProjectId: paidRight.projectId,
        reason: paidRight.reason,
      })
      return res.status(202).json({
        project,
        artifacts,
        depth,
        costCredits: 0,
        makegoodApplied: true,
        aiConfigured: isProjectGenerationConfigured(),
      })
    } catch (err) {
      releaseMakegood(paidRight.id)
      captureError("[projects.generate] error:", err)
      return res.status(500).json({ error: "Не удалось создать проект" })
    }
  }

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
    const { project, artifacts } = createGeneratedProject({ userId, name: resolvedName, hint: safeHint, depth, profile })
    return res
      .status(202)
      .json({
        project,
        artifacts,
        depth,
        costCredits: cost,
        makegoodApplied: false,
        aiConfigured: isProjectGenerationConfigured(),
      })
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
  const kind = normalizeRefinementKind(req.body?.kind)

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
  const verifiedReadiness = await getVerifiedProjectGenerationReadiness(true)
  if (!verifiedReadiness.ready) {
    return res.status(503).json({
      error:
        "Конвейер доработки не готов: для кода нужен OSGARD 4.0, для плана и независимой проверки — OSGARD 5.0 или OSGARD 4.8. Доработка и списание не начаты.",
      code: "GENERATION_PROVIDERS_UNAVAILABLE",
      readiness: verifiedReadiness,
    })
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
  const refinementId = recordRefinement({ userId, projectId, prompt, kind, costCredits: cost })

  // Запуск регенерации файлов по промпту. onDone отметит статус строки в леджере.
  const started = refineGeneratedProject({
    userId,
    projectId,
    prompt,
    kind,
    refinementId,
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
    kind,
    costCredits: cost,
    refinementsRemaining: refinementsRemaining(userId),
    aiConfigured: isProjectGenerationConfigured(),
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

/* ---------------- Публикация проекта ----------------
   Площадку выбирает resolveDeployTarget (services/deploy-target.ts): основная —
   НАША инфраструктура (*.osgard.cloud, тот же control-plane, что везёт боевой
   SUPER DAY), Netlify — только аварийный запас и только при явном
   DEPLOY_ALLOW_NETLIFY_FALLBACK=true. Мы продаём аренду своей инфраструктуры,
   поэтому публикация клиентских приложений к конкуренту — не деталь реализации,
   а подрыв самого продукта.

   Путь остаётся fire-and-forget: отвечаем сразу (deploy_status='deploying'),
   сборка и выкладка идут в фоне, фронтенд опрашивает GET /projects/:id.

   Два адреса ручки — один обработчик:
     POST /projects/:id/deploy          — правильное, площадко-независимое имя;
     POST /projects/:id/deploy-netlify  — прежнее имя, сохранено ради уже
                                          задеплоенных клиентов (мобилка и веб
                                          зовут его), но НЕ означает Netlify.
------------------------------------------------------------------------------- */
const deployProjectHandler = asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)

  if (!project) return res.status(404).json({ error: "Проект не найден" })
  if (project.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому проекту" })
  }
  if (project.status !== "ready") {
    return res.status(400).json({ error: "Проект ещё не готов к деплою" })
  }

  /* Инженерный вердикт — допуск к публикации, а не украшение отчёта.
     `status='ready'` означает всего лишь «генерация закончилась»; приложение,
     про которое платформа сама написала «N нерешённых дефектов», уезжало в
     интернет одним кликом и падало на сборке в кластере (выстрел 30.07.2026,
     деплой 82). Публикация остаётся возможной — но осознанной: клиент обязан
     прислать acknowledgeBroken:true, то есть человек увидел причину и решил
     сам. См. lib/engineering-gate.ts. */
  const gate = readEngineeringGate(id)
  if (deployNeedsAcknowledgement(gate) && req.body?.acknowledgeBroken !== true) {
    return res.status(409).json({
      error: describeBrokenGate(gate),
      code: "engineering_broken",
      verdict: gate.verdict,
      defects: gate.errorDefects,
      rules: gate.rules,
    })
  }

  const decision = resolveDeployTarget()
  if (decision.target === "none") {
    return res.status(400).json({ error: `Деплой невозможен: ${decision.reason}` })
  }

  if (project.deploy_status === "deploying") {
    return res.status(400).json({ error: "Деплой уже выполняется" })
  }

  db.prepare(`UPDATE projects SET deploy_status = 'deploying', deploy_error = NULL WHERE id = ?`).run(id)
  const updated = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`).get(id)

  // Площадку отдаём клиенту явно: пользователь должен видеть, куда именно
  // уезжает его приложение, а не догадываться по домену в ссылке.
  res.status(202).json({ project: updated, deployTarget: decision.target, deployTargetLabel: decision.label })

  runDeployJob(id, decision.target)
})

router.post("/:id/deploy", requireAuth, deployProjectHandler)
router.post("/:id/deploy-netlify", requireAuth, deployProjectHandler)

/* ---------------- POST /projects/:id/verify-build — реальная проверка сборки в Docker-песочнице ----------------
   В отличие от инлайн-валидации при сохранении файла (ts.transpileModule — только
   синтаксис), здесь запускается полноценный `next build` в изолированном контейнере.
   Занимает секунды, поэтому await прямо в запросе (клиент показывает спиннер). */
router.post("/:id/verify-build", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT id, user_id, app_profile FROM projects WHERE id = ?`).get(id)

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

  /* Профиль проекта: статический экспорт собирается иначе, чем fullstack (и даёт
     out/, которого у fullstack нет) — сборка не того вида упала бы на пустом месте. */
  const result = await verifyBuildInSandbox(files, {
    logLabel: `verify-build-${id}`,
    profile: normalizeAppProfile(project.app_profile),
  })
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
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = Number(req.params.id)
    const project: any = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)

    if (!project) return res.status(404).json({ error: "Проект не найден" })
    if (project.user_id !== req.user!.userId) {
      return res.status(403).json({ error: "Нет доступа к этому проекту" })
    }

    /* Базу приложения сносим ПЕРВОЙ и до удаления строки проекта: у app_databases
       стоит ON DELETE CASCADE, поэтому после DELETE FROM projects платформа уже не
       знает, какую схему и роль надо убрать из кластера. Отказ кластера не
       блокирует удаление проекта — пользователь просил удалить свой проект, а не
       ждать чинки инфраструктуры; о несданной схеме сообщаем предупреждением. */
    const released = await releaseAppDatabase(id)

    /* Отвязываем артефакты от проекта (сами артефакты остаются у владельца) */
    db.prepare(`UPDATE artifacts SET project_id = NULL WHERE project_id = ?`).run(id)
    db.prepare(`DELETE FROM project_files WHERE project_id = ?`).run(id)
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id)

    res.json(released.ok ? { ok: true } : { ok: true, warning: `база приложения не снесена: ${released.error}` })
  }),
)

/* ---------------- GET /projects/:id/database — строка подключения к базе ----------------
   Креды намеренно НЕ лежат в файлах проекта (файлы уезжают в архив скачивания и в
   деплой), поэтому их надо где-то отдавать — здесь. Только владельцу проекта и
   только по явному запросу: то же поведение, что у панелей Supabase/Neon. */
router.get(
  "/:id/database",
  requireAuth,
  (req: AuthRequest, res) => {
    const id = Number(req.params.id)
    const project: any = db.prepare(`SELECT id, user_id, app_profile FROM projects WHERE id = ?`).get(id)

    if (!project) return res.status(404).json({ error: "Проект не найден" })
    if (project.user_id !== req.user!.userId) {
      return res.status(403).json({ error: "Нет доступа к этому проекту" })
    }

    const stored = getAppDatabase(id)
    if (!stored) {
      return res.json({
        hasDatabase: false,
        reason: allowsServerCode(normalizeAppProfile(project.app_profile))
          ? "база этому приложению ещё не выдана"
          : "приложение статическое — серверного кода и базы у него нет",
      })
    }

    /* Факт выдачи кредов в лог — без самой строки подключения: писать пароль в
       логи означало бы вынести секрет ровно туда, откуда мы его убирали из файлов.
       Отдельного журнала событий безопасности в проекте нет, а logAudit — денежный
       (debit/credit/amount), для этого события он не подходит. */
    console.log(`[app-database] креды показаны владельцу: project=${id} schema=${stored.schema}`)

    res.json({
      hasDatabase: true,
      schema: stored.schema,
      role: stored.role,
      connectionString: stored.connectionString,
      schemaStatus: stored.schemaStatus,
      schemaError: stored.schemaError,
      createdAt: stored.createdAt,
    })
  },
)

export default router
