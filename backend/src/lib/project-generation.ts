import db from "./db"
import { randomUUID } from "node:crypto"
import { localFallbackGeneration, type AiArtifactSuggestion } from "../services/ai-generator"
import { cacheVerifiedAppGeneration, generateApp, GeneratedAppFile } from "../services/app-generator"
import {
  detectTheme,
  findBestTemplate,
  getTemplateById,
  saveTemplateFromGeneration,
  incrementTemplateUsage,
  estimateTokensSaved,
  type MatchedTemplate,
} from "../services/template-store"
import { adaptTemplate } from "../services/template-adapter"
import { captureError } from "./sentry"
import { GENERATION_DEPTHS, resolveDepth, type GenerationDepth } from "./generation-depths"
import { allowsServerCode, DEFAULT_APP_PROFILE, FULLSTACK_DEPENDENCIES, normalizeAppProfile, type AppProfile } from "./app-profiles"
import { bindAppDatabase } from "../services/app-database-binding"
import { createNotification } from "./notifications"
import { emitGenerationStage, emitGenerationMeter } from "./generation-events"
import { withGenerationTelemetry, currentTelemetry, type TelemetrySnapshot } from "./generation-telemetry"
import {
  beginGenerationUsageRun,
  finishGenerationUsageRun,
  updateGenerationUsageRun,
} from "./generation-usage"
import { getForgeBonusForUser } from "./forge-loadout"
import { nextFloats } from "./provably-fair"
import { addArchitectXp } from "./architect-progression"
import { deriveDesignBrief, renderDesignSystemFiles, DESIGN_SYSTEM_PATHS, type DesignBrief } from "./design-system"
import { explainDesignQuality } from "./design-qa"
import { runEngineeringContour, summarizeVerdict, type EngineeringReport } from "./project-engineering"
import { deriveExportContract, reconcileWithContract } from "./generation-contract"
import {
  craftQuality,
  getLessonsReport,
  isWorthLearning,
  listAuthoredLessons,
  rankedLessons,
  recordLessons,
  renderLessonsContract,
} from "./craft-corpus"
import { countLessonsInContract, lessonsFingerprint } from "./lessons-fingerprint"
import { recordGenerationLearning, type GenerationPath } from "./learning-coverage"
import {
  authorMissingLessons,
  pendingAuthoringCandidates,
  reviseFailedLessons,
  type LessonDefectSample,
} from "./lesson-author"
import { resolveProjectTitle } from "./project-title"
import { decideProjectRelease } from "./project-release"
import { grantMakegood, type MakegoodReason } from "./generation-makegood"
import { refineExistingApp } from "../services/app-refiner"
import { normalizeRefinementKind, type RefinementKind } from "./refinement-kinds"
import { failRefinementWithRefund } from "./refinements"

/* ================================================================
   OSGARD · Общий сервис генерации проектов
   ----------------------------------------------------------------
   Единый источник логики «создать проект + стартовые артефакты +
   запустить фоновую AI-генерацию файлов». Используется и обычным
   маршрутом POST /projects/generate (авторизованный веб-клиент), и
   публичным B2B API (POST /v1/generate по API-ключу) — чтобы обе
   точки входа порождали проекты и артефакты абсолютно одинаково,
   без расхождения экономики.
   ================================================================ */

export const PROJECT_SELECT_COLUMNS = `id, name, description, badge, artifact_count as artifactCount, sold, income,
       status, generation_error as generationError, ai_source as aiSource, created_at as createdAt,
       deploy_status as deployStatus, deploy_error as deployError, live_url as liveUrl,
       app_profile as appProfile`

export const ARTIFACT_SELECT_COLUMNS = `id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
       status, views_24h as views24h, supply, price, list_currency as listCurrency, created_at as createdAt`

function computePrice(a: { power: number; defense: number; magic: number; speed: number }): number {
  const statSum = a.power + a.defense + a.magic + a.speed
  return Math.round(statSum * 5) // базовая цена common-артефакта без спроса
}

/** Сколько строк кода вокруг дефекта отдаём на разбор: причина видна по окрестности. */
const LESSON_SNIPPET_RADIUS = 12

/** Фрагмент файла вокруг дефекта — контекст, без которого разбор гадает по сообщению. */
function snippetAround(content: string, line?: number): string {
  const lines = content.split("\n")
  if (!line || line < 1) return lines.slice(0, LESSON_SNIPPET_RADIUS * 2).join("\n")
  const from = Math.max(0, line - 1 - LESSON_SNIPPET_RADIUS)
  return lines.slice(from, line - 1 + LESSON_SNIPPET_RADIUS).join("\n")
}

/**
 * Достраивает память платформы: правило, которое ломает сборку, но не имеет
 * формулировки, отправляется на разбор сильной модели (lib/lesson-author).
 *
 * Зачем вообще: до волны 5 текст урока существовал только в рукописном словаре, и
 * правило без строки в КОДЕ промпт отбрасывал — сколько бы раз дефект ни повторялся.
 * Платформа умнела лишь настолько, насколько её успевал описать разработчик.
 *
 * Запускается ПОСЛЕ того, как приложение отдано пользователю, и намеренно не влияет на
 * выдачу: обучение — улучшение памяти, а не часть результата. Поэтому вызов не
 * ожидается (`void`), а любая ошибка внутри остаётся внутри.
 */
function authorMissingLessonsInBackground(
  report: EngineeringReport,
  files: Array<{ path: string; content: string }>,
): void {
  try {
    const silent = getLessonsReport().silent
    if (silent.length === 0) return

    const candidates = pendingAuthoringCandidates(silent)
    if (candidates.length === 0) return

    const contentByPath = new Map(files.map((f) => [f.path, f.content]))
    const counts = new Map(report.lessons.map((l) => [l.rule, l.count]))

    /* Берём ПЕРВЫЙ дефект каждого правила: для формулировки нужен один достоверный
       пример, а не полный список — остальные повторяют ту же суть и только удорожают
       разбор. */
    const samples: LessonDefectSample[] = []
    for (const rule of candidates) {
      const defect = report.defects.find((d) => d.rule === rule)
      if (!defect) continue // правило пришло из другого этапа — примера кода под рукой нет
      const content = contentByPath.get(defect.file)
      samples.push({
        rule: defect.rule,
        message: defect.message,
        file: defect.file,
        line: defect.line,
        snippet: content ? snippetAround(content, defect.line) : undefined,
      })
    }
    if (samples.length === 0) return

    void authorMissingLessons(samples, counts)
      .then((outcome) => {
        for (const lesson of outcome.authored) {
          console.log(`[craft-corpus] платформа сформулировала урок для «${lesson.rule}»: ${lesson.text}`)
        }
        for (const fail of outcome.rejected) {
          console.log(`[craft-corpus] урок для «${fail.rule}» не принят: ${fail.reason}`)
        }
      })
      .catch((err) => captureError("[craft-corpus] авторство уроков сорвалось:", err))
  } catch (err) {
    captureError("[craft-corpus] не удалось запустить авторство уроков:", err)
  }
}

/**
 * Пересматривает формулировки, которые доказанно не работают (волна 6).
 *
 * Зачем отдельно от разбора: разбор закрывает случай «правило есть, урока нет», а здесь
 * случай хуже — урок ЕСТЬ, доходит до модели и не помогает. До волны 6 такой урок жил в
 * памяти вечно и занимал место в промпте, вытесняя рабочий: платформа не умела признать
 * своё знание негодным.
 *
 * Не зависит от `silent`: провалившийся урок надо переписать и тогда, когда новых правил
 * без формулировки нет вовсе — то есть именно в спокойной, «хорошей» генерации.
 */
function reviseFailedLessonsInBackground(): void {
  try {
    const lessons = rankedLessons()
    if (lessons.length === 0) return

    void reviseFailedLessons(lessons, listAuthoredLessons())
      .then((outcome) => {
        for (const item of outcome.revised) {
          console.log(`[craft-corpus] урок «${item.rule}» переписан: было «${item.previous}» → стало «${item.text}»`)
        }
        for (const fail of outcome.rejected) {
          console.log(`[craft-corpus] урок «${fail.rule}» переписать не удалось: ${fail.reason}`)
        }
      })
      .catch((err) => captureError("[craft-corpus] переписывание уроков сорвалось:", err))
  } catch (err) {
    captureError("[craft-corpus] не удалось запустить переписывание уроков:", err)
  }
}

/**
 * Обе половины самообучения одним входом: сформулировать недостающее и пересмотреть
 * негодное. Вызывается после выдачи приложения; ни одна из половин не имеет права
 * повлиять на результат генерации, поэтому обе — «выстрелил и забыл».
 */
function learnFromGenerationInBackground(
  report: EngineeringReport,
  files: Array<{ path: string; content: string }>,
): void {
  authorMissingLessonsInBackground(report, files)
  reviseFailedLessonsInBackground()
}

/** Стат [10..39] из provably-fair float'а [0,1) — распределение 1:1 с прежним
 *  `10 + Math.floor(Math.random()*30)`, но детерминированно и проверяемо. */
function statFromFloat(f: number): number {
  return 10 + Math.floor(f * 30)
}

/* Валюта листинга по редакции стартового артефакта. Common — базовые credits;
   если снаряжение Кузницы «поднимает» артефакт до rare, листинг в shards
   (паритет с LIST_CURRENCY_BY_RARITY в artifacts.routes.ts). */
const STARTER_LIST_CURRENCY: Record<string, string> = { common: "credits", rare: "shards" }

/** Вставляет стартовые артефакты проекта (детерминированный локальный рандомайзер —
 *  экономика не завязана на AI) и проставляет projects.artifact_count.
 *
 *  Снаряжение Кузницы (forge loadout): надетые артефакты владельца дают
 *  ОГРАНИЧЕННЫЙ бонус (см. lib/forge-loadout.ts) — плоская добавка к статам и
 *  шанс родиться 'rare'. Пустой лоадаут → нулевой бонус → поведение 1:1 как
 *  раньше (аддитивно, prod-safe). */
export function insertStarterArtifacts(
  userId: number,
  projectId: number,
  artifacts: Array<{ name: string; type: string }>,
  now: number,
) {
  const bonus = getForgeBonusForUser(userId)

  const insertArtifact = db.prepare(
    `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed, status, views_24h, supply, price, list_currency, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'kept', 0, 1, ?, ?, ?)`,
  )

  let count = 0
  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i]
    // Provably-fair: ровно 5 детерминированных float'ов на артефакт (4 стата + ролл
    // редкости) из commit-reveal сид-цепочки владельца. purpose привязан к проекту и
    // индексу → каждый бросок независимо воспроизводим из раскрытого server_seed.
    const [fPow, fDef, fMag, fSpd, fRare] = nextFloats(
      userId,
      `starter:${projectId}:${i}`,
      5,
      `project ${projectId} · ${a.name}`,
    )
    const power = statFromFloat(fPow) + bonus.statBonus
    const defense = statFromFloat(fDef) + bonus.statBonus
    const magic = statFromFloat(fMag) + bonus.statBonus
    const speed = statFromFloat(fSpd) + bonus.statBonus
    // Каждый артефакт независимо тянет на «редкое рождение» по шансу лоадаута.
    const rarity = bonus.rarityUpChance > 0 && fRare < bonus.rarityUpChance ? "rare" : "common"
    const price = computePrice({ power, defense, magic, speed })

    insertArtifact.run(
      userId,
      projectId,
      a.name,
      a.type,
      rarity,
      power,
      defense,
      magic,
      speed,
      price,
      STARTER_LIST_CURRENCY[rarity] ?? "credits",
      now,
    )
    count += 1
  }

  db.prepare(`UPDATE projects SET artifact_count = ? WHERE id = ?`).run(count, projectId)
}

/** Читает сохранённый дизайн-бриф проекта. Доработка обязана идти в том же визуальном
 *  языке, а не рождать второй облик поверх первого.
 *
 *  Ленивый prepare внутри функции и мягкая деградация при отсутствии колонки — урок
 *  инцидента #59: ссылка на колонку новой миграции на уровне модуля роняет boot. */
function loadProjectBrief(projectId: number): DesignBrief | undefined {
  try {
    const row = db.prepare(`SELECT design_brief as designBrief FROM projects WHERE id = ?`).get(projectId) as
      | { designBrief: string | null }
      | undefined
    if (!row?.designBrief) return undefined
    const parsed = JSON.parse(row.designBrief)
    return parsed && typeof parsed === "object" ? (parsed as DesignBrief) : undefined
  } catch {
    return undefined // колонки ещё нет (старая схема в тестах) — не повод падать
  }
}

/** Сохраняет дизайн-систему и разбор её качества. Отдельным стейтментом от
 *  `status='ready'`: если схема без колонок 090, проект всё равно обязан стать ready. */
function persistDesign(projectId: number, brief: DesignBrief, report: ReturnType<typeof explainDesignQuality>) {
  try {
    db.prepare(`UPDATE projects SET design_brief = ?, design_score = ?, design_report = ? WHERE id = ?`).run(
      JSON.stringify(brief),
      report.score,
      JSON.stringify({ factors: report.factors, issues: report.issues.slice(0, 40), analyzedFiles: report.analyzedFiles }),
      projectId,
    )
  } catch (err) {
    captureError("[projects.generate] design persist skipped (schema without 090 columns):", err)
  }
}

/** Сохраняет инженерный вердикт проекта. Отдельным стейтментом от `status='ready'`
 *  по тому же принципу, что и persistDesign: схема без колонок 091 не должна мешать
 *  проекту стать ready (урок #59 — новая колонка не имеет права ронять генерацию). */
function persistEngineering(projectId: number, report: EngineeringReport) {
  try {
    db.prepare(
      `UPDATE projects SET build_status = ?, build_report = ?, build_verified_at = ? WHERE id = ?`,
    ).run(
      report.verdict,
      JSON.stringify({
        verifiedBy: report.verifiedBy,
        checks: report.checks,
        defects: report.defects,
        repairs: report.repairs,
        initialErrors: report.initialErrors,
        attempts: report.attempts,
        analyzedFiles: report.analyzedFiles,
        sandbox: report.sandbox,
        durationMs: report.durationMs,
      }),
      report.at,
      projectId,
    )
  } catch (err) {
    captureError("[projects.generate] engineering persist skipped (schema without 091 columns):", err)
  }
}

/** Гарантирует, что файлы дизайн-системы в проекте соответствуют брифу.
 *
 *  Нужно ОБОИМ путям: шаблонный путь переиспользует файлы прошлых генераций, среди
 *  которых лежит старый пустой `tailwind.config.ts` — без перезаписи адаптированный
 *  шаблон остался бы без токенов. */
function applyDesignSystem(
  files: GeneratedAppFile[],
  brief: DesignBrief,
  name: string,
  description: string,
): GeneratedAppFile[] {
  const rendered = renderDesignSystemFiles(brief, name, description)
  const owned = new Set<string>(DESIGN_SYSTEM_PATHS)
  return [...files.filter((f) => !owned.has(f.path)), ...rendered]
}

/** Сохраняет счётчик расхода генерации (колонки 095).
 *
 *  «С первого раза» — самый строгий из возможных смыслов: приложение признано
 *  работоспособным (`passed`) и при этом не потребовало НИ ОДНОГО ремонта.
 *  Вердикт `repaired` сюда не входит намеренно: платформа его починила, значит
 *  с первого раза не получилось, и засчитывать это себе в успех — самообман.
 *  Отдельным стейтментом от `status='ready'` по тому же принципу, что 090/091:
 *  новая колонка не имеет права уронить генерацию (урок #59). */
function persistGenerationMeter(
  projectId: number,
  report: EngineeringReport,
) {
  const firstTry = report.verdict === "passed" && report.repairs.length === 0
  try {
    const row = db.prepare(`SELECT gen_meter AS meter FROM projects WHERE id = ?`).get(projectId) as
      | { meter: string | null }
      | undefined
    let meter: Record<string, unknown> = {}
    try {
      meter = row?.meter ? JSON.parse(row.meter) : {}
    } catch {
      meter = {}
    }
    db.prepare(
      `UPDATE projects SET gen_first_try = ?, gen_meter = ? WHERE id = ?`,
    ).run(
      firstTry ? 1 : 0,
      JSON.stringify({
        ...meter,
        repairRounds: report.attempts,
        repairedFiles: report.repairs.length,
        verdict: report.verdict,
      }),
      projectId,
    )
  } catch (err) {
    captureError("[projects.generate] meter persist skipped (schema without 095 columns):", err)
  }
  return firstTry
}

function persistProjectUsageDelta(
  projectId: number,
  current: TelemetrySnapshot,
  previous: TelemetrySnapshot | null,
): void {
  const before = previous ?? {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    aiMs: 0,
    elapsedMs: 0,
    unmeasured: 0,
    failed: 0,
    byProvider: {},
  }
  const calls = Math.max(0, current.calls - before.calls)
  const tokensIn = Math.max(0, current.inputTokens - before.inputTokens)
  const tokensOut = Math.max(0, current.outputTokens - before.outputTokens)
  const durationMs = Math.max(0, current.elapsedMs - before.elapsedMs)
  const aiMs = Math.max(0, current.aiMs - before.aiMs)
  const unmeasured = Math.max(0, current.unmeasured - before.unmeasured)
  const failedCalls = Math.max(0, current.failed - before.failed)

  try {
    const transaction = db.transaction(() => {
      const row = db.prepare(`SELECT gen_meter AS meter FROM projects WHERE id = ?`).get(projectId) as
        | { meter: string | null }
        | undefined
      let meter: Record<string, any> = {}
      try {
        meter = row?.meter ? JSON.parse(row.meter) : {}
      } catch {
        meter = {}
      }

      const byProvider: Record<string, { calls: number; tokens: number }> = { ...(meter.byProvider || {}) }
      for (const [provider, usage] of Object.entries(current.byProvider)) {
        const oldUsage = before.byProvider[provider] || { calls: 0, tokens: 0 }
        const bucket = byProvider[provider] || { calls: 0, tokens: 0 }
        bucket.calls += Math.max(0, usage.calls - oldUsage.calls)
        bucket.tokens += Math.max(0, usage.tokens - oldUsage.tokens)
        byProvider[provider] = bucket
      }

      const nextMeter = {
        ...meter,
        byProvider,
        aiMs: (Number(meter.aiMs) || 0) + aiMs,
        unmeasured: (Number(meter.unmeasured) || 0) + unmeasured,
        failedCalls: (Number(meter.failedCalls) || 0) + failedCalls,
      }
      db.prepare(
        `UPDATE projects
            SET gen_ai_calls = COALESCE(gen_ai_calls, 0) + ?,
                gen_tokens_in = COALESCE(gen_tokens_in, 0) + ?,
                gen_tokens_out = COALESCE(gen_tokens_out, 0) + ?,
                gen_duration_ms = COALESCE(gen_duration_ms, 0) + ?,
                gen_meter = ?
          WHERE id = ?`,
      ).run(calls, tokensIn, tokensOut, durationMs, JSON.stringify(nextMeter), projectId)
    })
    transaction()
  } catch (error) {
    captureError("[projects.generate] durable usage snapshot skipped:", error)
  }
}

/** Выполняет один запуск генерации внутри durable worker. Клиент получает ответ
 *  сразу после постановки в SQLite-очередь, а worker повторяет временные сбои
 *  с backoff и переводит проект в failed только после последней попытки.
 *
 *  Обёртка существует ради одного: весь джоб целиком выполняется внутри контекста
 *  телеметрии, поэтому КАЖДЫЙ вызов модели на любой глубине (генерация файлов,
 *  арт-дирекция, AI-ремонт в инженерном контуре) попадает в счётчик расхода этого
 *  проекта и не смешивается с параллельными генерациями других пользователей.
 *
 *  Слушатель onUpdate проталкивает расход в SSE по факту каждого вызова модели.
 *  Без него цифры обновлялись бы только на смене стадии, а самая долгая стадия
 *  (`ai`) — одна: человек минуту смотрел бы на замерший счётчик. */
async function runAppGenerationJob(...args: Parameters<typeof runAppGenerationJobInner>) {
  const userId = args[0]
  const projectId = args[1]
  const depth = args[7]
  const kind = args[10] ? "refinement" : "generation"
  const usageRunId = beginGenerationUsageRun({ projectId, userId, kind, depth })
  let previous: TelemetrySnapshot | null = null
  let latest: TelemetrySnapshot | null = null

  const persist = (snapshot: TelemetrySnapshot) => {
    persistProjectUsageDelta(projectId, snapshot, previous)
    updateGenerationUsageRun(usageRunId, snapshot)
    previous = snapshot
    latest = snapshot
  }

  try {
    const { result } = await withGenerationTelemetry(
      () => runAppGenerationJobInner(...args),
      (snapshot) => {
        persist(snapshot)
        emitGenerationMeter(projectId, snapshot)
      },
      persist,
    )
    finishGenerationUsageRun(usageRunId, result ? "completed" : "failed", latest)
    return result
  } catch (error) {
    finishGenerationUsageRun(usageRunId, "failed", latest)
    throw error
  }
}

type DurableGenerationPayload = {
  userId: number
  projectId: number
  name: string
  hint?: string
  quick: { description: string; badge: string; artifacts: AiArtifactSuggestion[] }
  templateId: number | null
  bypassCache: boolean
  depth: GenerationDepth
  design?: { theme?: string; keywords?: string[] }
  profile: AppProfile
  refinement?: { kind: RefinementKind; prompt: string }
}

type DurableGenerationJobRow = {
  project_id: number
  user_id: number
  payload: string
  refinement_id: number | null
  attempts: number
  lease_token: string
}

const GENERATION_JOB_LEASE_MS = 2 * 60_000
const GENERATION_JOB_MAX_ATTEMPTS = 3
const GENERATION_JOB_RETRY_DELAYS_MS = [5_000, 20_000] as const
let generationWorkerTimer: NodeJS.Timeout | null = null
let generationWorkerRunning = false

function generationRetryDelayMs(attempts: number): number {
  return GENERATION_JOB_RETRY_DELAYS_MS[Math.min(Math.max(attempts - 1, 0), GENERATION_JOB_RETRY_DELAYS_MS.length - 1)]
}

function enqueueGenerationJob(payload: DurableGenerationPayload, refinementId?: number): void {
  const now = Date.now()
  const queued = db.prepare(
    `INSERT INTO project_generation_jobs
       (project_id, user_id, payload, refinement_id, status, attempts, available_at,
        lease_until, lease_token, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
       user_id = excluded.user_id,
       payload = excluded.payload,
       refinement_id = excluded.refinement_id,
       status = 'queued',
       attempts = 0,
       available_at = excluded.available_at,
       lease_until = NULL,
       lease_token = NULL,
       last_error = NULL,
        updated_at = excluded.updated_at
      WHERE project_generation_jobs.status NOT IN ('queued', 'running')`,
  ).run(payload.projectId, payload.userId, JSON.stringify(payload), refinementId ?? null, now, now, now)
  if (queued.changes !== 1) throw new Error(`Generation job for project ${payload.projectId} is already active`)
  scheduleGenerationWorker()
}

function claimGenerationJob(): DurableGenerationJobRow | null {
  const now = Date.now()
  db.exec("BEGIN IMMEDIATE")
  try {
    const exhausted = db.prepare(
      `SELECT project_id, user_id, payload, refinement_id
       FROM project_generation_jobs
       WHERE status = 'running' AND attempts >= ? AND COALESCE(lease_until, 0) <= ?`,
    ).all(GENERATION_JOB_MAX_ATTEMPTS, now) as Array<{
      project_id: number
      user_id: number
      payload: string
      refinement_id: number | null
    }>
    for (const job of exhausted) {
      const message = `Generation stopped after ${GENERATION_JOB_MAX_ATTEMPTS} attempts`
      const refinementJob = isRefinementJobPayload(job.payload)
      db.prepare(
        `UPDATE project_generation_jobs
         SET status = 'failed', lease_until = NULL, lease_token = NULL, last_error = ?, updated_at = ?
         WHERE project_id = ?`,
      ).run(message, now, job.project_id)
      db.prepare(`UPDATE projects SET status = ?, generation_error = ? WHERE id = ?`).run(
        refinementJob ? "ready" : "failed",
        message,
        job.project_id,
      )
      if (job.refinement_id != null) {
        failRefinementWithRefund(job.refinement_id)
      }
    }

    const row = db.prepare(
      `SELECT project_id, user_id, payload, refinement_id, attempts
       FROM project_generation_jobs
       WHERE attempts < ?
         AND ((status = 'queued' AND available_at <= ?)
           OR (status = 'running' AND COALESCE(lease_until, 0) <= ?))
       ORDER BY created_at ASC LIMIT 1`,
    ).get(GENERATION_JOB_MAX_ATTEMPTS, now, now) as Omit<DurableGenerationJobRow, "lease_token"> | undefined

    if (!row) {
      db.exec("COMMIT")
      for (const job of exhausted) {
        reportTerminalGenerationFailure(job, `Generation stopped after ${GENERATION_JOB_MAX_ATTEMPTS} attempts`)
      }
      return null
    }

    const leaseToken = randomUUID()
    db.prepare(
      `UPDATE project_generation_jobs
       SET status = 'running', attempts = attempts + 1, lease_until = ?, lease_token = ?, updated_at = ?
       WHERE project_id = ?`,
    ).run(now + GENERATION_JOB_LEASE_MS, leaseToken, now, row.project_id)
    db.prepare(`UPDATE projects SET status = 'generating', generation_error = NULL WHERE id = ?`).run(row.project_id)
    db.exec("COMMIT")
    for (const job of exhausted) {
      reportTerminalGenerationFailure(job, `Generation stopped after ${GENERATION_JOB_MAX_ATTEMPTS} attempts`)
    }
    return { ...row, attempts: row.attempts + 1, lease_token: leaseToken }
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

function nextGenerationLeaseDelay(): number | null {
  const row = db.prepare(
    `SELECT MIN(next_at) AS nextAt
     FROM (
       SELECT available_at AS next_at FROM project_generation_jobs WHERE status = 'queued'
       UNION ALL
       SELECT lease_until AS next_at FROM project_generation_jobs WHERE status = 'running'
     )`,
  ).get() as { nextAt: number | null }
  if (row.nextAt == null) return null
  return Math.max(1_000, row.nextAt - Date.now() + 100)
}

function generationDepthFromJobPayload(payload: string): GenerationDepth {
  try {
    return resolveDepth((JSON.parse(payload) as { depth?: unknown }).depth)
  } catch {
    return "quick"
  }
}

function isRefinementJobPayload(payload: string): boolean {
  try {
    const parsed = JSON.parse(payload) as { refinement?: unknown }
    return !!parsed.refinement && typeof parsed.refinement === "object"
  } catch {
    return false
  }
}

export function reportTerminalGenerationFailure(
  job: Pick<DurableGenerationJobRow, "project_id" | "user_id" | "payload">,
  message: string,
): void {
  const project = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(job.project_id) as { name: string } | undefined
  const refinementJob = isRefinementJobPayload(job.payload)
  const makegoodGranted = grantMakegood({
    userId: job.user_id,
    projectId: job.project_id,
    depth: generationDepthFromJobPayload(job.payload),
    reason: "crashed",
  })
  emitGenerationStage({
    projectId: job.project_id,
    stage: "failed",
    label: refinementJob ? "Доработка не выполнена" : "Ошибка генерации",
    progress: 1,
    error: message,
    makegood: makegoodGranted,
  })
  createNotification({
    userId: job.user_id,
    type: "generation_failed",
    entityType: "project",
    entityId: job.project_id,
    text: refinementJob
      ? makegoodGranted
        ? `Доработка проекта «${project?.name ?? `#${job.project_id}`}» оборвалась. Рабочая версия сохранена, следующая генерация за счёт платформы.`
        : `Не удалось доработать проект «${project?.name ?? `#${job.project_id}`}». Рабочая версия не изменена.`
      : makegoodGranted
        ? `Генерация проекта «${project?.name ?? `#${job.project_id}`}» оборвалась по вине платформы. Следующая генерация за счёт платформы.`
        : `Не удалось сгенерировать проект «${project?.name ?? `#${job.project_id}`}». Можно попробовать снова.`,
  })
}

function scheduleGenerationWorker(delayMs = 0): void {
  if (generationWorkerRunning || generationWorkerTimer) return
  generationWorkerTimer = setTimeout(() => {
    generationWorkerTimer = null
    void drainGenerationJobs()
  }, delayMs)
  generationWorkerTimer.unref?.()
}

async function drainGenerationJobs(): Promise<void> {
  if (generationWorkerRunning) return
  generationWorkerRunning = true
  try {
    for (;;) {
      const job = claimGenerationJob()
      if (!job) break

      let heartbeat: NodeJS.Timeout | null = null
      try {
        const payload = JSON.parse(job.payload) as DurableGenerationPayload
        heartbeat = setInterval(() => {
          db.prepare(
            `UPDATE project_generation_jobs SET lease_until = ?, updated_at = ?
             WHERE project_id = ? AND status = 'running' AND lease_token = ?`,
          ).run(Date.now() + GENERATION_JOB_LEASE_MS, Date.now(), job.project_id, job.lease_token)
        }, Math.floor(GENERATION_JOB_LEASE_MS / 3))
        heartbeat.unref?.()

        const template = payload.templateId == null ? null : getTemplateById(payload.templateId)
        const completed = await runAppGenerationJob(
          payload.userId,
          payload.projectId,
          payload.name,
          payload.hint,
          payload.quick,
          template,
          payload.bypassCache,
          payload.depth,
          payload.design,
          payload.profile,
          payload.refinement,
        )

        const project = db.prepare(`SELECT generation_error FROM projects WHERE id = ?`).get(job.project_id) as
          | { generation_error: string | null }
          | undefined
        const queueUpdate = db.prepare(
          `UPDATE project_generation_jobs
           SET status = ?, lease_until = NULL, lease_token = NULL, last_error = ?, updated_at = ?
           WHERE project_id = ? AND status = 'running' AND lease_token = ?`,
        ).run(
          completed ? "completed" : "failed",
          completed ? null : project?.generation_error ?? "generation failed",
          Date.now(),
          job.project_id,
          job.lease_token,
        )
        if (queueUpdate.changes > 0 && job.refinement_id != null) {
          if (completed) {
            db.prepare(`UPDATE project_refinements SET status = 'ready' WHERE id = ?`).run(job.refinement_id)
          } else {
            failRefinementWithRefund(job.refinement_id)
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "generation worker failed"
        const finalAttempt = job.attempts >= GENERATION_JOB_MAX_ATTEMPTS
        const availableAt = finalAttempt ? Date.now() : Date.now() + generationRetryDelayMs(job.attempts)
        const queueUpdate = db.prepare(
          `UPDATE project_generation_jobs
           SET status = CASE WHEN attempts < ? THEN 'queued' ELSE 'failed' END,
               available_at = ?, lease_until = NULL, lease_token = NULL, last_error = ?, updated_at = ?
           WHERE project_id = ? AND status = 'running' AND lease_token = ?`,
        ).run(GENERATION_JOB_MAX_ATTEMPTS, availableAt, message, Date.now(), job.project_id, job.lease_token)
        const stillOwned = queueUpdate.changes > 0
        if (stillOwned && finalAttempt) {
          db.prepare(`UPDATE projects SET status = ?, generation_error = ? WHERE id = ?`).run(
            isRefinementJobPayload(job.payload) ? "ready" : "failed",
            message,
            job.project_id,
          )
          if (job.refinement_id != null) {
            failRefinementWithRefund(job.refinement_id)
          }
          reportTerminalGenerationFailure(job, message)
        } else if (stillOwned) {
          db.prepare(`UPDATE projects SET status = 'generating', generation_error = NULL WHERE id = ?`).run(job.project_id)
        }
        captureError("[projects.generate] durable worker failed:", error)
      } finally {
        if (heartbeat) clearInterval(heartbeat)
      }
    }
  } finally {
    generationWorkerRunning = false
    const delay = nextGenerationLeaseDelay()
    if (delay != null) scheduleGenerationWorker(delay)
  }
}

/** Starts recovery after migrations have created the durable queue table. */
export function resumeProjectGenerationJobs(): void {
  scheduleGenerationWorker()
}

async function runAppGenerationJobInner(
  userId: number,
  projectId: number,
  name: string,
  hint: string | undefined,
  quick: { description: string; badge: string; artifacts: AiArtifactSuggestion[] },
  template: MatchedTemplate | null,
  bypassCache: boolean,
  depth: GenerationDepth,
  design?: { theme?: string; keywords?: string[] },
  profile: AppProfile = DEFAULT_APP_PROFILE,
  refinement?: { kind: RefinementKind; prompt: string },
): Promise<boolean> {
  try {
    let files: GeneratedAppFile[]
    let source: string
    let description = quick.description
    let badge = quick.badge
    let artifactNames: string[] | null = null
    let generatedLessons: Array<{ rule: string; count: number }> = []

    /* Уроки платформы считаются ОДИН раз на генерацию и уходят в ОБА пути (волна 7).
       До неё блок собирался только внутри AI-ветки, а шаблонная адаптация — глубина
       `quick`, то есть путь по умолчанию и основной трафик — не получала уроков вовсе:
       память платформы росла и не доходила до самого частого своего пути.

       Один вызов, а не по одному в каждой ветке: отпечаток набора попадает в ключ кэша,
       и если бы ветки читали память в разные моменты, отпечаток мог бы разойтись с тем,
       что реально стоит в промпте. */
    /* Профиль передаётся сюда же, а не подмешивается на месте вызова AI: иначе
       `lessonsCount` и отпечаток считались бы по одному тексту, а в промпт уходил бы
       другой, да и `markLessonsTaught` внутри сработал бы дважды за генерацию. */
    const lessons = renderLessonsContract(6, profile)
    const lessonsCount = countLessonsInContract(lessons)
    const fingerprint = lessonsFingerprint(lessons)
    /* Сколько уроков дошло до модели в этой генерации. Ноль до тех пор, пока путь не
       доказал, что промпт с уроками действительно собирался: платформа с богатой памятью
       и не обучающейся выдачей — ровно тот случай, который аудит волны 7 и вскрыл. */
    let lessonsTaught = 0
    let learningPath: GenerationPath = "fallback"
    /* Обратное направление обучения: сколько уроков генерация вернула в память. Считается
       отдельно от `lessonsTaught` и складывается по ВСЕМ трём точкам записи — иначе
       генерация, которая учит платформу и сама при этом ничему не учится (так и вёл себя
       шаблонный путь), в одной общей цифре выглядела бы обучающейся. */
    let lessonsLearned = 0

    // Стадия 1: замысел разобран (тема/шаблон уже определены синхронно при создании проекта).
    emitGenerationStage({ projectId, stage: "analyzing", label: "Анализирую замысел", progress: 0.1 })

    // Существующий бриф — признак доработки: облик уже выбран, второй раз не изобретаем.
    const existingBrief = loadProjectBrief(projectId)
    let brief: DesignBrief =
      existingBrief ?? deriveDesignBrief({ name, hint, theme: design?.theme, keywords: design?.keywords })

    // Стадия 2: дизайн-система. Раньше её не было вовсе — приложение получало
    // пустой tailwind.config и голый layout, и каждый файл изобретал палитру сам.
    emitGenerationStage({
      projectId,
      stage: "designing",
      label: existingBrief ? "Сохраняю дизайн-систему проекта" : "Проектирую дизайн-систему",
      progress: 0.2,
    })

    if (refinement) {
      emitGenerationStage({ projectId, stage: "ai", label: "Планирую точечную доработку", progress: 0.4 })
      const currentFiles = db
        .prepare(`SELECT path, content FROM project_files WHERE project_id = ? ORDER BY path ASC`)
        .all(projectId) as GeneratedAppFile[]
      const result = await refineExistingApp({
        name,
        request: refinement.prompt,
        kind: refinement.kind,
        files: currentFiles,
        brief,
        profile,
        lessons,
      })
      files = result.files
      source = "ai"
      learningPath = "ai"
      lessonsTaught = lessonsCount
    } else if (template) {
      // Стадия 3a: найден подходящий шаблон — адаптируем (быстрее и дешевле AI).
      emitGenerationStage({ projectId, stage: "template", label: "Адаптирую шаблон", progress: 0.4 })
      const adapted = await adaptTemplate(template, name, hint, { lessons })
      files = adapted.files
      source = adapted.source
      description = adapted.description
      badge = adapted.badge
      artifactNames = adapted.artifactNames

      /* Локальный фоллбэк адаптации модель не зовёт вообще (замена строк), поэтому
         уроки до неё не доходят — и записывать их как дошедшие нельзя. */
      learningPath = adapted.source === "template-ai" ? "template-ai" : "template-local"
      lessonsTaught = adapted.source === "template-ai" ? lessonsCount : 0

      incrementTemplateUsage(template.id, estimateTokensSaved(template.files.length))
    } else {
      // Стадия 3b: шаблона нет — полная генерация кода через AI (дольше).
      emitGenerationStage({ projectId, stage: "ai", label: "Генерирую код приложения", progress: 0.4 })
      const result = await generateApp(name, hint, {
        bypassCache,
        theme: design?.theme,
        keywords: design?.keywords,
        description: quick.description,
        brief: existingBrief,
        // Платформа учится на себе: в промпт каждого файла подмешивается реальная
        // статистика собственных поломок (lib/craft-corpus). Пустая статистика —
        // пустая строка, поведение как раньше.
        lessons,
        profile,
      })
      files = result.files
      source = result.source
      brief = result.brief
      /* Попадание в кэш — не обучение ЭТОЙ генерации: ни одного промпта не собиралось.
         Код при этом рождён под тем же набором уроков (отпечаток входит в ключ кэша,
         волна 7), но выдавать «повлияли раньше» за «дошли сейчас» — значит завысить долю
         обучающихся генераций собственным кэшем. Поэтому ветвь пишется отдельно. */
      learningPath = result.source === "fallback" ? "fallback" : result.cached ? "ai-cached" : "ai"
      lessonsTaught = result.source === "ai" && !result.cached ? lessonsCount : 0
      /* Уроки досборки, случившейся ВНУТРИ генерации. Записываем здесь, потому
         что повторная сверка ниже их уже не увидит — дефект к тому моменту
         починен. Именно этот разрыв и делал память платформы неполной. */
      generatedLessons = result.lessons ?? []
      if (generatedLessons.length) {
        recordLessons(generatedLessons)
        lessonsLearned += generatedLessons.length
      }
      // Сохранение в корпус переехало ПОСЛЕ инженерного контура: раньше шаблон
      // писался прямо здесь — то есть в память платформы попадал непроверенный
      // код, и следующие проекты наследовали его дефекты.
    }

    // Дизайн-система принадлежит брифу целиком: перезаписываем её файлы поверх любого
    // пути (в т.ч. поверх старого пустого конфига, пришедшего из кэша шаблонов).
    if (!refinement) files = applyDesignSystem(files, brief, name, description)

    // Стадия 4: синтаксическая проверка файлов.
    emitGenerationStage({ projectId, stage: "validating", label: "Проверяю файлы", progress: 0.62, fileCount: files.length })

    /* СВЕРКА С КОНТРАКТОМ ЭКСПОРТОВ — ДО инженерного контура и до выдачи.
       Стоит здесь, а не внутри generateApp, намеренно: этот путь проходят ОБА
       способа получить файлы — и полная AI-генерация, и адаптация шаблона из
       корпуса. Досборка детерминированная (ни одного AI-вызова): файл, который
       импортируют, но которого нет, создаётся по контракту; недостающий экспорт
       дописывается. Остаток расхождений не глотается — он неизбежно всплывёт
       ошибками графа модулей в контуре ниже и повлияет на вердикт. */
    const contractBefore = deriveExportContract(
      files.map((f) => f.path),
      allowsServerCode(profile) ? Object.keys(FULLSTACK_DEPENDENCIES) : [],
    )
    const contractCheck = reconcileWithContract(files, contractBefore)
    if (contractCheck.actions.length > 0) {
      files = contractCheck.files.map((f) => ({ path: f.path, content: f.content }))
      console.log(
        `[projects.generate] контракт экспортов: досборка ${contractCheck.actions.length} — ${contractCheck.actions
          .slice(0, 6)
          .join("; ")}`,
      )
      /* Уроки досборки — в память платформы СРАЗУ. Тонкость: эти дефекты чинятся
         здесь, то есть инженерный контур ниже их уже не увидит и в его lessons
         они не попадут. Без этой строки платформа училась только на том, что
         НЕ смогла починить детерминированно, и продолжала получать от модели
         один и тот же дубль объявления в каждой генерации. */
      recordLessons(contractCheck.lessons)
      lessonsLearned += contractCheck.lessons.length
    }

    // Стадия 5: ИНЖЕНЕРНЫЙ КОНТУР. Раньше здесь ничего не было: проект объявлялся
    // готовым сразу после синтаксической проверки одного файла за раз. Теперь
    // приложение проверяется как ЦЕЛОЕ (граф модулей, клиент/сервер, контракт
    // статического экспорта), дефекты чинятся, и только после этого выносится
    // честный вердикт. Контур никогда не бросает — генерация от него не падает.
    const engineering = await runEngineeringContour(files, {
      name,
      hint,
      brief,
      depth,
      profile,
      logLabel: `contour-${projectId}`,
      onProgress: (p) =>
        emitGenerationStage({
          projectId,
          stage: p.phase,
          label: p.label,
          progress: p.phase === "building" ? 0.74 : 0.82,
          defects: p.defects,
        }),
    })
    files = engineering.files
    const engineeringError = summarizeVerdict(engineering.report)

    // Качество интерфейса считаем по ФИНАЛЬНЫМ файлам — после ремонта, а не до:
    // балл обязан описывать то, что реально получит пользователь.
    // Бриф передаём намеренно: с ним включается проверка контраста ПАР токенов
    // (lib/design-qa) — она считает реальные отношения по палитре ЭТОГО проекта.
    const designReport = explainDesignQuality(files, brief)
    const release = decideProjectRelease(engineering.report)
    const incompleteGeneration = !template && source !== "ai"
      ? "OSGARD 4.0 did not return every file from the OSGARD 5.0/4.8 plan"
      : null
    const finalStatus = incompleteGeneration ? "failed" : release.status
    const finalError = incompleteGeneration ?? release.message ?? engineeringError
    const shouldCommitFiles = !refinement || finalStatus === "ready"
    if (finalStatus === "failed") {
      console.warn(`[projects.generate] project ${projectId} was not released: ${finalError}`)
    }

    /* --- Самообучение платформы (корпус ремесла) ---
       (1) Память ошибок: на каких правилах генератор споткнулся в этот раз.
       (2) Память удач: в корпус шаблонов уходит ТОЛЬКО проверенный код —
           и только если он лучше того, что уже лежит по этой теме.
       (3) Формулировки: правило без текста урока разбирается моделью и получает его
           само — иначе счётчик растёт, а промпт следующей генерации его отбрасывает.
       (4) Пересмотр: формулировка, после которой дефект продолжает повторяться,
           переписывается — знание, не давшее результата, обязано уступить место. */
    recordLessons(engineering.report.lessons)
    lessonsLearned += engineering.report.lessons.length
    learnFromGenerationInBackground(engineering.report, files)

    if (!refinement && source === "ai" && release.status === "ready") {
      cacheVerifiedAppGeneration(
        name,
        hint,
        { files, source, brief, lessons: generatedLessons },
        release.status,
        lessons,
        profile,
      )
    }

    /* Корпус шаблонов — статический: адаптация (`adaptTemplate`) не знает профиля и
       отдаёт набор как есть. Положить туда fullstack-приложение значило бы, что
       следующий статический проект получит из корпуса серверные роуты и не
       соберётся — поэтому fullstack учит платформу уроками, но шаблон не пишет. */
    if (!refinement && source === "ai" && !allowsServerCode(profile) && isWorthLearning(engineering.report.verdict)) {
      saveTemplateFromGeneration({
        name,
        hint,
        description,
        badge,
        manifest: files.map((f) => ({ path: f.path, purpose: f.path })),
        files,
        artifactTypes: quick.artifacts,
        quality: craftQuality({
          verdict: engineering.report.verdict,
          designScore: designReport.score,
          repairs: engineering.report.repairs.length,
        }),
        verdict: engineering.report.verdict,
        designScore: designReport.score,
        repairs: engineering.report.repairs.length,
      })
    }

    /* --- База данных приложения ---
       Для профиля fullstack приложение получает СВОЮ схему и СВОЮ роль в кластере
       Postgres, а объявленные им таблицы (db/schema.sql) сразу применяются. Сама
       строка подключения в файлы не пишется (она бы уехала в архив и деплой) —
       только пример env и инструкция; настоящие креды лежат зашифрованными.

       Отказ кластера генерацию НЕ роняет: приложение отдаётся пользователю, а
       статус базы попадает в отчёт как есть — «не выдана» вместо тихого молчания. */
    if (shouldCommitFiles) {
      const dbBinding = await bindAppDatabase({ projectId, profile, files })
      if (dbBinding.extraFiles.length > 0) files = [...files, ...dbBinding.extraFiles]
      if (dbBinding.status === "provisioned") {
        emitGenerationStage({
          projectId,
          stage: "writing",
          label:
            dbBinding.schemaStatus === "applied"
              ? "База данных приложения готова, таблицы созданы"
              : "База данных приложения готова",
          progress: 0.88,
        })
      }

      emitGenerationStage({ projectId, stage: "writing", label: "Записываю файлы проекта", progress: 0.9, fileCount: files.length })
      const insertFile = db.prepare(
        `INSERT INTO project_files (project_id, path, content, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      )
      const now = Date.now()
      db.exec("BEGIN IMMEDIATE")
      try {
        if (refinement) db.prepare(`DELETE FROM project_files WHERE project_id = ?`).run(projectId)
        for (const file of files) insertFile.run(projectId, file.path, file.content, now)
        db.exec("COMMIT")
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    }

    /* ВЫДАЧА. Раньше статус был безусловным 'ready' при любом вердикте: проект с
       битыми импортами объявлялся готовым, а дефекты уходили текстом в
       generation_error — то есть несовпадение было предупреждением. Теперь оно
       ошибка: приложение, у которого не сходится граф модулей, физически не
       собирается, и показывать его как готовое — враньё.

       Статус для такого случая — существующий 'failed', а НЕ новый 'broken':
       фронт знает ровно три статуса (generating/ready/failed) и уже умеет
       показывать 'failed' вместе с generation_error (project-detail-view.tsx).
       Новый статус означал бы экран, который никто не рисует, — проект завис бы
       в невидимом состоянии. Инженерный вердикт 'broken' при этом сохраняется
       отдельно в build_status (091) — разбор и кнопка ремонта на месте.

       Все прочие дефекты (стиль, клиент/сервер и т.п.) на статус НЕ влияют —
       блокируем ровно то, что делает сборку невозможной. */
    if (refinement && finalStatus === "failed") {
      db.prepare(`UPDATE projects SET status = 'ready', generation_error = ? WHERE id = ?`).run(finalError, projectId)
    } else {
      db.prepare(
        `UPDATE projects SET status = ?, ai_source = ?, generation_error = ?, description = ?, badge = ? WHERE id = ?`,
      ).run(finalStatus, source, finalError, description, badge, projectId)
    }

    // Дизайн-система и разбор её качества — отдельным стейтментом, чтобы схема без
    // колонок 090 не мешала проекту стать ready.
    let firstTry = false
    if (shouldCommitFiles) {
      persistDesign(projectId, brief, designReport)
      persistEngineering(projectId, engineering.report)
      firstTry = currentTelemetry()
        ? persistGenerationMeter(projectId, engineering.report)
        : engineering.report.verdict === "passed" && engineering.report.repairs.length === 0
    }

    /* --- След обучения (миграция 094, волна 7) ---
       Одна строка на генерацию: каким путём получен код, дошли ли уроки до модели и
       сколько уроков вернулось в память. Без этой записи «платформа умнеет с каждой
       генерации» проверить нечем: витрина показывала, ЧТО платформа выучила, и не
       показывала, в какой ДОЛЕ генераций обучение вообще участвует. Ровно в этой слепой
       зоне и жили две дыры аудита — шаблонный путь без уроков и кэш, отдающий код,
       рождённый под прошлым знанием. */
    recordGenerationLearning({
      projectId,
      depth,
      path: learningPath,
      lessonsTaught,
      lessonsLearned,
      /* Отпечаток пишем только когда уроки действительно дошли: иначе строка утверждала
         бы, что код рождён под этим набором, хотя набор до модели не доехал. */
      fingerprint: lessonsTaught > 0 ? fingerprint : null,
    })

    /* ПЕРЕГЕНЕРАЦИЯ ЗА СЧЁТ ПЛАТФОРМЫ. Если выдача неработоспособна — приложение не
       собирается или контур признал вердикт `broken` — виноват генератор, а не человек.
       До этого он платил за наш промах тем же, чем за удачу: кредитами или дневной
       квотой, и «попробуйте снова» шло за его счёт. Теперь провал сразу выдаёт право на
       одну бесплатную перегенерацию (lib/generation-makegood).

       Вердикт `repaired` права НЕ даёт намеренно: платформа нашла и исправила дефект
       сама, пользователь получил работающее приложение — компенсировать нечего. */
    const hasBlockingImportError = release.errors.some((defect) =>
      defect.rule === "import-missing" ||
      defect.rule === "named-import-missing" ||
      defect.rule === "default-export-missing" ||
      defect.rule === "dependency-missing",
    )
    const platformFault: MakegoodReason | null = finalStatus === "failed"
      ? hasBlockingImportError ? "unbuildable" : "broken"
      : null
    const makegoodGranted = platformFault
      ? grantMakegood({ userId, projectId, depth, reason: platformFault })
      : false

    if (artifactNames) {
      const rows = db
        .prepare(`SELECT id FROM artifacts WHERE project_id = ? ORDER BY id ASC`)
        .all(projectId) as Array<{ id: number }>
      const renameArtifact = db.prepare(`UPDATE artifacts SET name = ? WHERE id = ?`)
      rows.forEach((row, i) => {
        if (artifactNames![i]) renameArtifact.run(artifactNames![i], row.id)
      })
    }

    emitGenerationStage({
      projectId,
      stage: finalStatus === "ready" ? "ready" : "failed",
      label:
        finalStatus === "failed"
          ? "Приложение не прошло инженерную проверку"
          : engineering.report.verdict === "repaired"
            ? "Приложение готово — дефекты найдены и исправлены"
            : "Приложение готово и проверено",
      progress: 1,
      fileCount: files.length,
      source,
      verdict: engineering.report.verdict,
      defects: release.errors.length,
      firstTry,
      ...(finalStatus === "failed" ? { error: finalError ?? undefined } : {}),
      /* Компенсация видна в том же событии, что и провал: человек узнаёт про право
         сразу, а не находит его случайно при следующем запуске. */
      makegood: makegoodGranted,
    })

    createNotification({
      userId,
      type: finalStatus === "ready" ? "generation_ready" : "generation_failed",
      entityType: "project",
      entityId: projectId,
      text:
        finalStatus === "ready"
          ? refinement
            ? `Доработка проекта «${name}» готова и прошла независимую проверку.`
            : `Проект «${name}» готов — приложение сгенерировано и проверено.`
          : makegoodGranted
            ? refinement
              ? `Доработка проекта «${name}» не прошла проверку. Рабочая версия сохранена, следующая генерация за счёт платформы.`
              : `Проект «${name}» не прошёл проверку по вине платформы. Следующая генерация за счёт платформы.`
            : refinement
              ? `Доработка проекта «${name}» отклонена проверкой. Рабочая версия приложения не изменена.`
              : `Проект «${name}» не прошёл инженерную проверку. Запустите ремонт после просмотра ошибок.`,
    })
    return finalStatus === "ready"
  } catch (err: any) {
    captureError("[projects.generate] app generation job failed:", err)
    throw err
  }
}

/**
 * Разбирает замысел ДО первого обращения к модели: имя, тема, ключевые слова и —
 * главное — подберётся ли готовый шаблон. Всё это детерминированный код, ни одного
 * AI-вызова.
 *
 * Существует отдельной функцией ради сметы (lib/generation-estimate): пользователю
 * показывают путь и ожидаемый расход ДО списания, и обещание обязано совпасть с тем,
 * что произойдёт. Если бы маршрут сметы повторял эту цепочку своей копией, любое
 * расхождение делало бы смету ложной — а смета, которая врёт, хуже отсутствующей.
 * Поэтому и предсказание, и реальная генерация ходят через ОДНУ функцию.
 */
export function planGeneration(params: {
  name?: string | null
  hint?: string
  depth: GenerationDepth
  /** Режим приложения. По умолчанию статический — поведение как до профилей. */
  profile?: AppProfile
}) {
  const safeHint = typeof params.hint === "string" && params.hint.trim() ? params.hint.trim() : undefined
  const trimmedName = resolveProjectTitle(params.name, safeHint)
  const depthCfg = GENERATION_DEPTHS[params.depth]
  const profile = normalizeAppProfile(params.profile)

  const { theme, keywords } = detectTheme(trimmedName, safeHint)
  /* forceAi (standard/deep) намеренно пропускает шаблонный shortcut → полная AI-генерация.
     Fullstack — тоже: весь корпус шаблонов собран из статических приложений (`output:
     "export"`, без серверных роутов), и адаптация такого шаблона под fullstack дала бы
     приложение БЕЗ базы под видом приложения с базой.

     Решение живёт здесь, а не в `createGeneratedProject`, ровно потому, что этой же
     функцией смета обещает путь до нажатия кнопки: развилка в двух местах означала бы
     обещанный «шаблон» при фактической AI-сборке — тот самый разрыв обещания и факта,
     от которого смету и строили. */
  const template = depthCfg.forceAi || allowsServerCode(profile) ? null : findBestTemplate(theme, keywords)

  return {
    safeHint,
    trimmedName,
    theme,
    keywords,
    template,
    /** Путь, который реально выберет генерация: адаптация шаблона или полная AI-сборка. */
    path: (template ? "template" : "ai") as "template" | "ai",
  }
}

/**
 * Создаёт проект в статусе 'generating' вместе со стартовыми артефактами и немедленно
 * ставит фоновую AI-генерацию в durable SQLite-очередь. Возвращает свежий проект и
 * его артефакты — вызывающая сторона отдаёт их клиенту и опрашивает статус позже.
 *
 * НЕ проверяет лимиты/тарифы/биллинг — это ответственность вызывающего маршрута (веб-квота
 * по тарифу или списание кредитов в B2B API).
 */
export function createGeneratedProject(params: {
  userId: number
  name?: string | null
  hint?: string
  depth?: GenerationDepth
  /** Режим приложения (lib/app-profiles). По умолчанию — статический, как было всегда. */
  profile?: AppProfile
}): { project: any; artifacts: any[]; projectId: number } {
  const depth = params.depth ?? "quick"
  const profile = normalizeAppProfile(params.profile)
  const { safeHint, trimmedName, theme, keywords, template } = planGeneration({
    name: params.name,
    hint: params.hint,
    depth,
    profile,
  })

  const quick: { description: string; badge: string; artifacts: AiArtifactSuggestion[] } = template
    ? {
        description: template.description || `${trimmedName} — проект в теме «${template.theme}».`,
        badge: template.badge || "sparkles",
        artifacts: template.artifactTypes,
      }
    : localFallbackGeneration(trimmedName, safeHint)

  const now = Date.now()

  const projectInfo = db
    .prepare(
      `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income, status, template_id, generation_depth, app_profile, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, 'generating', ?, ?, ?, ?)`,
    )
    .run(params.userId, trimmedName, quick.description, quick.badge, template?.id ?? null, depth, profile, now)

  const projectId = Number(projectInfo.lastInsertRowid)
  insertStarterArtifacts(params.userId, projectId, quick.artifacts, now)
  // «Мастерство Архитектора»: XP за реальную генерацию проекта (аддитивно, no-op при отсутствии колонок).
  addArchitectXp(params.userId, "project_generated")

  const project = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`).get(projectId)
  const artifacts = db
    .prepare(`SELECT ${ARTIFACT_SELECT_COLUMNS} FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId)

  enqueueGenerationJob({
    userId: params.userId,
    projectId,
    name: trimmedName,
    hint: safeHint,
    quick,
    templateId: template?.id ?? null,
    bypassCache: GENERATION_DEPTHS[depth].bypassCache,
    depth,
    design: { theme, keywords },
    profile,
  })

  return { project, artifacts, projectId }
}

/**
 * Повторный прогон инженерного контура по УЖЕ СОХРАНЁННЫМ файлам проекта.
 * Генерация с нуля не запускается: замысел, дизайн-система и артефакты остаются
 * прежними — платформа лишь пробует ещё раз починить то, что осталось битым, и
 * переписывает вердикт. Это ответ на честный статус «broken»: пользователю дают
 * кнопку, а не приговор.
 *
 * Возвращает false, если чинить нечего (нет проекта или нет файлов). Никогда не
 * бросает наружу: любая ошибка возвращает проект в ready и пишет её в вердикт.
 */
export function repairGeneratedProject(params: { userId: number; projectId: number }): boolean {
  const project = db
    .prepare(`SELECT id, name, description, status, app_profile FROM projects WHERE id = ? AND user_id = ?`)
    .get(params.projectId, params.userId) as
    | { id: number; name: string; description: string | null; status: string; app_profile?: string | null }
    | undefined
  if (!project) return false

  /* Профиль обязателен здесь, а не «желателен»: без него повторный ремонт
     fullstack-приложения зашёл бы со статическим контрактом и УДАЛИЛ его
     серверные роуты как несовместимые — то есть кнопка «починить» сломала бы
     работающее приложение. */
  const profile = normalizeAppProfile(project.app_profile)

  const rows = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(project.id) as GeneratedAppFile[]
  if (rows.length === 0) return false

  db.prepare(`UPDATE projects SET status = 'generating', generation_error = NULL WHERE id = ?`).run(project.id)

  void (async () => {
    let usageRunId: number | null = null
    let repairTelemetry: TelemetrySnapshot | null = null
    let usageFinished = false
    try {
      const brief =
        loadProjectBrief(project.id) ?? deriveDesignBrief({ name: project.name, hint: project.description ?? undefined })

      emitGenerationStage({
        projectId: project.id,
        stage: "building",
        label: "Повторная инженерная проверка",
        progress: 0.3,
      })

      usageRunId = beginGenerationUsageRun({ projectId: project.id, userId: params.userId, kind: "repair", depth: "standard" })
      let engineering: Awaited<ReturnType<typeof runEngineeringContour>>
      try {
        const measured = await withGenerationTelemetry(
          () => runEngineeringContour(rows, {
            name: project.name,
            hint: project.description ?? undefined,
            brief,
            depth: "standard",
            profile,
            logLabel: `repair-${project.id}`,
            onProgress: (p) =>
              emitGenerationStage({
                projectId: project.id,
                stage: p.phase,
                label: p.label,
                progress: p.phase === "building" ? 0.5 : 0.7,
                defects: p.defects,
              }),
          }),
          undefined,
          (snapshot) => {
            repairTelemetry = snapshot
            updateGenerationUsageRun(usageRunId, snapshot)
          },
        )
        repairTelemetry = measured.telemetry
        engineering = measured.result
      } catch (error) {
        finishGenerationUsageRun(usageRunId, "failed", repairTelemetry)
        usageFinished = true
        throw error
      }
      persistProjectUsageDelta(project.id, repairTelemetry!, null)

      const release = decideProjectRelease(engineering.report)
      finishGenerationUsageRun(usageRunId, release.status === "ready" ? "completed" : "failed", repairTelemetry)
      usageFinished = true
      /* A failed repair candidate is diagnostic evidence, not a new project
         version. Keep the last usable files intact until the complete static,
         build and independent-review contour accepts the candidate. */
      commitAcceptedRepairFiles(project.id, rows, engineering.files, release.status === "ready")

      db.prepare(`UPDATE projects SET status = ?, generation_error = ? WHERE id = ?`).run(
        release.status,
        release.message ?? summarizeVerdict(engineering.report),
        project.id,
      )
      persistEngineering(project.id, engineering.report)
      persistGenerationMeter(project.id, engineering.report)
      // Ремонт — такой же источник знания о слабых местах генератора, как и сама
      // генерация: дефекты, найденные здесь, тоже идут в память ошибок платформы —
      // включая формулировку урока для правил, которых нет в рукописном словаре.
      recordLessons(engineering.report.lessons)
      learnFromGenerationInBackground(engineering.report, engineering.files)
      if (release.status === "ready") {
        persistDesign(project.id, brief, explainDesignQuality(engineering.files, brief))
      }

      emitGenerationStage({
        projectId: project.id,
        stage: release.status === "ready" ? "ready" : "failed",
        label:
          engineering.report.verdict === "broken"
            ? "Ремонт завершён — часть дефектов осталась"
            : "Ремонт завершён — приложение проверено",
        progress: 1,
        fileCount: engineering.files.length,
        verdict: engineering.report.verdict,
        defects: release.errors.length,
        ...(release.status === "failed" ? { error: release.message ?? summarizeVerdict(engineering.report) ?? undefined } : {}),
      })
    } catch (err) {
      if (!usageFinished) finishGenerationUsageRun(usageRunId, "failed", repairTelemetry)
      captureError("[projects.repair] повторный контур упал:", err)
      // Проект обязан вернуться в рабочее состояние — «generating» навсегда недопустим.
      const message = err instanceof Error ? err.message : "Unknown repair error"
      db.prepare(`UPDATE projects SET status = 'failed', generation_error = ? WHERE id = ?`).run(message, project.id)
      emitGenerationStage({
        projectId: project.id,
        stage: "failed",
        label: "Ремонт не удался",
        progress: 1,
        error: err instanceof Error ? err.message : "Неизвестная ошибка ремонта",
      })
    }
  })()

  return true
}

/** Atomically promote a repair candidate only after the release gate accepts it. */
export function commitAcceptedRepairFiles(
  projectId: number,
  previousFiles: GeneratedAppFile[],
  candidateFiles: GeneratedAppFile[],
  accepted: boolean,
): boolean {
  if (!accepted) return false

  const commitFiles = db.transaction(() => {
    const insertFile = db.prepare(
      `INSERT INTO project_files (project_id, path, content, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    const now = Date.now()
    const keptPaths = new Set(candidateFiles.map((file) => file.path))
    for (const file of candidateFiles) {
      insertFile.run(projectId, file.path, file.content, now)
    }

    const removeFile = db.prepare(`DELETE FROM project_files WHERE project_id = ? AND path = ?`)
    for (const row of previousFiles) {
      if (!keptPaths.has(row.path)) removeFile.run(projectId, row.path)
    }
  })
  commitFiles()
  return true
}

/**
 * Доработка существующего проекта (механика «Доработок», домен Claude B).
 * НЕ создаёт новый проект и НЕ трогает артефакты — переводит проект в
 * status='generating' и заново гоняет тот же фоновой AI-джоб генерации файлов
 * (runAppGenerationJob), передавая промпт доработки как hint. Файлы
 * перезаписываются upsert'ом (ON CONFLICT), исходные артефакты сохраняются.
 *
 * НЕ проверяет владение/квоты/списания — это ответственность вызывающего
 * маршрута (POST /projects/:id/refine). Возвращает false, если проект не найден.
 * force=AI (template=null): промпт доработки должен реально менять код, а не
 * просто переадаптировать шаблон. Результат также выполняется durable worker.
 *
 * onDone (опц.) — колбэк по завершении джоба (обновить статус строки леджера).
 */
export function refineGeneratedProject(params: {
  userId: number
  projectId: number
  prompt: string
  kind?: RefinementKind
  refinementId?: number
}): boolean {
  const project = db
    .prepare(`SELECT id, name, description, badge, app_profile FROM projects WHERE id = ? AND user_id = ?`)
    .get(params.projectId, params.userId) as
    | { id: number; name: string; description: string | null; badge: string | null; app_profile?: string | null }
    | undefined
  if (!project) return false

  /* Доработка идёт в том же режиме, в котором приложение создано — иначе
     fullstack-проект после «доработать словами» вернулся бы статикой без базы. */
  const profile = normalizeAppProfile(project.app_profile)

  const refine = params.prompt.trim()
  // Контекст доработки: имя + текущее описание + задача → AI сохраняет замысел
  // и точечно вносит запрошенное изменение, а не генерирует приложение с нуля.
  const mergedHint = [
    `Доработка существующего приложения «${project.name}».`,
    project.description ? `Текущее описание: ${project.description}.` : "",
    `Задача доработки: ${refine}`,
  ]
    .filter(Boolean)
    .join(" ")

  db.prepare(`UPDATE projects SET status = 'generating', generation_error = NULL WHERE id = ?`).run(project.id)

  const fallback = localFallbackGeneration(project.name, refine)
  const quick = {
    ...fallback,
    description: project.description ?? fallback.description,
    badge: project.badge ?? fallback.badge,
  }

  // Тот же durable job; template=null → полная AI-генерация по промпту.
  // Доработка идёт по стандартной глубине: полная AI-генерация по промпту и
  // такой же инженерный контур, как у обычной генерации.
  try {
    enqueueGenerationJob({
      userId: params.userId,
      projectId: project.id,
      name: project.name,
      hint: mergedHint,
      quick,
      templateId: null,
      bypassCache: true,
      depth: "standard",
      profile,
      refinement: { kind: normalizeRefinementKind(params.kind), prompt: refine },
    }, params.refinementId)
  } catch (error) {
    db.prepare(`UPDATE projects SET status = 'ready', generation_error = ? WHERE id = ?`)
      .run(error instanceof Error ? error.message : "Could not enqueue refinement", project.id)
    return false
  }

  return true
}
