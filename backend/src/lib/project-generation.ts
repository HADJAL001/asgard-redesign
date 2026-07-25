import db from "./db"
import { localFallbackGeneration, type AiArtifactSuggestion } from "../services/ai-generator"
import { generateApp, validateGeneratedFiles, GeneratedAppFile } from "../services/app-generator"
import {
  detectTheme,
  findBestTemplate,
  saveTemplateFromGeneration,
  incrementTemplateUsage,
  estimateTokensSaved,
  type MatchedTemplate,
} from "../services/template-store"
import { adaptTemplate } from "../services/template-adapter"
import { captureError } from "./sentry"
import { GENERATION_DEPTHS, type GenerationDepth } from "./generation-depths"
import { createNotification } from "./notifications"
import { emitGenerationStage } from "./generation-events"
import { getForgeBonusForUser } from "./forge-loadout"
import { nextFloats } from "./provably-fair"
import { addArchitectXp } from "./architect-progression"

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
       deploy_status as deployStatus, deploy_error as deployError, live_url as liveUrl`

export const ARTIFACT_SELECT_COLUMNS = `id, project_id as projectId, name, type, rarity, level, power, defense, magic, speed,
       status, views_24h as views24h, supply, price, list_currency as listCurrency, created_at as createdAt`

function computePrice(a: { power: number; defense: number; magic: number; speed: number }): number {
  const statSum = a.power + a.defense + a.magic + a.speed
  return Math.round(statSum * 5) // базовая цена common-артефакта без спроса
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

/** Асинхронный джоб генерации реального приложения — вызывается fire-and-forget сразу
 *  после ответа клиенту. Никогда не бросает наружу: любая ошибка помечает проект failed. */
async function runAppGenerationJob(
  userId: number,
  projectId: number,
  name: string,
  hint: string | undefined,
  quick: { description: string; badge: string; artifacts: AiArtifactSuggestion[] },
  template: MatchedTemplate | null,
  bypassCache: boolean,
) {
  try {
    let files: GeneratedAppFile[]
    let source: string
    let description = quick.description
    let badge = quick.badge
    let artifactNames: string[] | null = null

    // Стадия 1: замысел разобран (тема/шаблон уже определены синхронно при создании проекта).
    emitGenerationStage({ projectId, stage: "analyzing", label: "Анализирую замысел", progress: 0.1 })

    if (template) {
      // Стадия 2a: найден подходящий шаблон — адаптируем (быстрее и дешевле AI).
      emitGenerationStage({ projectId, stage: "template", label: "Адаптирую шаблон", progress: 0.35 })
      const adapted = await adaptTemplate(template, name, hint)
      files = adapted.files
      source = adapted.source
      description = adapted.description
      badge = adapted.badge
      artifactNames = adapted.artifactNames

      incrementTemplateUsage(template.id, estimateTokensSaved(template.files.length))
    } else {
      // Стадия 2b: шаблона нет — полная генерация кода через AI (дольше).
      emitGenerationStage({ projectId, stage: "ai", label: "Генерирую код приложения", progress: 0.35 })
      const result = await generateApp(name, hint, { bypassCache })
      files = result.files
      source = result.source

      if (result.source === "ai") {
        saveTemplateFromGeneration({
          name,
          hint,
          description: quick.description,
          badge: quick.badge,
          manifest: files.map((f) => ({ path: f.path, purpose: f.path })),
          files,
          artifactTypes: quick.artifacts,
        })
      }
    }

    // Стадия 3: проверяем сгенерированные файлы.
    emitGenerationStage({ projectId, stage: "validating", label: "Проверяю файлы", progress: 0.7, fileCount: files.length })
    const errors = validateGeneratedFiles(files)

    // Стадия 4: записываем файлы проекта.
    emitGenerationStage({ projectId, stage: "writing", label: "Записываю файлы проекта", progress: 0.85, fileCount: files.length })
    const insertFile = db.prepare(
      `INSERT INTO project_files (project_id, path, content, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    const now = Date.now()
    for (const file of files) {
      insertFile.run(projectId, file.path, file.content, now)
    }

    db.prepare(
      `UPDATE projects SET status = 'ready', ai_source = ?, generation_error = ?, description = ?, badge = ? WHERE id = ?`,
    ).run(source, errors.length > 0 ? errors.join("\n") : null, description, badge, projectId)

    if (artifactNames) {
      const rows = db
        .prepare(`SELECT id FROM artifacts WHERE project_id = ? ORDER BY id ASC`)
        .all(projectId) as Array<{ id: number }>
      const renameArtifact = db.prepare(`UPDATE artifacts SET name = ? WHERE id = ?`)
      rows.forEach((row, i) => {
        if (artifactNames![i]) renameArtifact.run(artifactNames![i], row.id)
      })
    }

    // Терминальная стадия ready: живой лог рождения проекта завершён успехом.
    emitGenerationStage({
      projectId,
      stage: "ready",
      label: "Приложение готово",
      progress: 1,
      fileCount: files.length,
      source,
    })

    // Реальное асинхронное событие завершения: мгновенно пушим уведомление через SSE.
    createNotification({
      userId,
      type: "generation_ready",
      entityType: "project",
      entityId: projectId,
      text: `Проект «${name}» готов — приложение сгенерировано.`,
    })
  } catch (err: any) {
    captureError("[projects.generate] app generation job failed:", err)
    const message = err?.message || "Неизвестная ошибка генерации"
    db.prepare(`UPDATE projects SET status = 'failed', generation_error = ? WHERE id = ?`).run(
      message,
      projectId,
    )
    // Терминальная стадия failed: клиент показывает ошибку и кнопку «попробовать снова».
    emitGenerationStage({ projectId, stage: "failed", label: "Ошибка генерации", progress: 1, error: message })
    createNotification({
      userId,
      type: "generation_failed",
      entityType: "project",
      entityId: projectId,
      text: `Не удалось сгенерировать проект «${name}». Можно попробовать снова.`,
    })
  }
}

/**
 * Создаёт проект в статусе 'generating' вместе со стартовыми артефактами и немедленно
 * запускает фоновую AI-генерацию файлов (fire-and-forget). Возвращает свежий проект и
 * его артефакты — вызывающая сторона отдаёт их клиенту и опрашивает статус позже.
 *
 * НЕ проверяет лимиты/тарифы/биллинг — это ответственность вызывающего маршрута (веб-квота
 * по тарифу или списание кредитов в B2B API).
 */
export function createGeneratedProject(params: {
  userId: number
  name: string
  hint?: string
  depth?: GenerationDepth
}): { project: any; artifacts: any[]; projectId: number } {
  const trimmedName = params.name.trim()
  const safeHint = typeof params.hint === "string" && params.hint.trim() ? params.hint.trim() : undefined

  const depth = params.depth ?? "quick"
  const depthCfg = GENERATION_DEPTHS[depth]

  const { theme, keywords } = detectTheme(trimmedName, safeHint)
  // forceAi (standard/deep) намеренно пропускает шаблонный shortcut → полная AI-генерация.
  const template = depthCfg.forceAi ? null : findBestTemplate(theme, keywords)

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
      `INSERT INTO projects (user_id, name, description, badge, artifact_count, sold, income, status, template_id, generation_depth, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, 'generating', ?, ?, ?)`,
    )
    .run(params.userId, trimmedName, quick.description, quick.badge, template?.id ?? null, depth, now)

  const projectId = Number(projectInfo.lastInsertRowid)
  insertStarterArtifacts(params.userId, projectId, quick.artifacts, now)
  // «Мастерство Архитектора»: XP за реальную генерацию проекта (аддитивно, no-op при отсутствии колонок).
  addArchitectXp(params.userId, "project_generated")

  const project = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM projects WHERE id = ?`).get(projectId)
  const artifacts = db
    .prepare(`SELECT ${ARTIFACT_SELECT_COLUMNS} FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId)

  void runAppGenerationJob(params.userId, projectId, trimmedName, safeHint, quick, template, depthCfg.bypassCache)

  return { project, artifacts, projectId }
}
