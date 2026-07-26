import db from "./db"
import { localFallbackGeneration, type AiArtifactSuggestion } from "../services/ai-generator"
import { generateApp, GeneratedAppFile } from "../services/app-generator"
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
import { deriveDesignBrief, renderDesignSystemFiles, DESIGN_SYSTEM_PATHS, type DesignBrief } from "./design-system"
import { explainDesignQuality } from "./design-qa"
import { runEngineeringContour, summarizeVerdict, type EngineeringReport } from "./project-engineering"
import { craftQuality, isWorthLearning, recordLessons, renderLessonsContract } from "./craft-corpus"

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
  depth: GenerationDepth,
  design?: { theme?: string; keywords?: string[] },
) {
  try {
    let files: GeneratedAppFile[]
    let source: string
    let description = quick.description
    let badge = quick.badge
    let artifactNames: string[] | null = null

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

    if (template) {
      // Стадия 3a: найден подходящий шаблон — адаптируем (быстрее и дешевле AI).
      emitGenerationStage({ projectId, stage: "template", label: "Адаптирую шаблон", progress: 0.4 })
      const adapted = await adaptTemplate(template, name, hint)
      files = adapted.files
      source = adapted.source
      description = adapted.description
      badge = adapted.badge
      artifactNames = adapted.artifactNames

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
        lessons: renderLessonsContract(),
      })
      files = result.files
      source = result.source
      brief = result.brief
      // Сохранение в корпус переехало ПОСЛЕ инженерного контура: раньше шаблон
      // писался прямо здесь — то есть в память платформы попадал непроверенный
      // код, и следующие проекты наследовали его дефекты.
    }

    // Дизайн-система принадлежит брифу целиком: перезаписываем её файлы поверх любого
    // пути (в т.ч. поверх старого пустого конфига, пришедшего из кэша шаблонов).
    files = applyDesignSystem(files, brief, name, description)

    // Стадия 4: синтаксическая проверка файлов.
    emitGenerationStage({ projectId, stage: "validating", label: "Проверяю файлы", progress: 0.62, fileCount: files.length })

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
    const designReport = explainDesignQuality(files)

    /* --- Самообучение платформы (корпус ремесла) ---
       (1) Память ошибок: на каких правилах генератор споткнулся в этот раз.
       (2) Память удач: в корпус шаблонов уходит ТОЛЬКО проверенный код —
           и только если он лучше того, что уже лежит по этой теме. */
    recordLessons(engineering.report.lessons)

    if (source === "ai" && isWorthLearning(engineering.report.verdict)) {
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

    // Стадия 6: записываем файлы проекта.
    emitGenerationStage({ projectId, stage: "writing", label: "Записываю файлы проекта", progress: 0.9, fileCount: files.length })
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
    ).run(source, engineeringError, description, badge, projectId)

    // Дизайн-система и разбор её качества — отдельным стейтментом, чтобы схема без
    // колонок 090 не мешала проекту стать ready.
    persistDesign(projectId, brief, designReport)
    // То же для инженерного вердикта (колонки 091).
    persistEngineering(projectId, engineering.report)

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
      label:
        engineering.report.verdict === "repaired"
          ? "Приложение готово — дефекты найдены и исправлены"
          : engineering.report.verdict === "broken"
            ? "Приложение готово, но проверка нашла дефекты"
            : "Приложение готово и проверено",
      progress: 1,
      fileCount: files.length,
      source,
      verdict: engineering.report.verdict,
      defects: engineering.report.defects.filter((d) => d.severity === "error").length,
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

  void runAppGenerationJob(params.userId, projectId, trimmedName, safeHint, quick, template, depthCfg.bypassCache, depth, {
    theme,
    keywords,
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
    .prepare(`SELECT id, name, description, status FROM projects WHERE id = ? AND user_id = ?`)
    .get(params.projectId, params.userId) as
    | { id: number; name: string; description: string | null; status: string }
    | undefined
  if (!project) return false

  const rows = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(project.id) as GeneratedAppFile[]
  if (rows.length === 0) return false

  const previousStatus = project.status
  db.prepare(`UPDATE projects SET status = 'generating', generation_error = NULL WHERE id = ?`).run(project.id)

  void (async () => {
    try {
      const brief =
        loadProjectBrief(project.id) ?? deriveDesignBrief({ name: project.name, hint: project.description ?? undefined })

      emitGenerationStage({
        projectId: project.id,
        stage: "building",
        label: "Повторная инженерная проверка",
        progress: 0.3,
      })

      const engineering = await runEngineeringContour(rows, {
        name: project.name,
        hint: project.description ?? undefined,
        brief,
        depth: "standard",
        logLabel: `repair-${project.id}`,
        onProgress: (p) =>
          emitGenerationStage({
            projectId: project.id,
            stage: p.phase,
            label: p.label,
            progress: p.phase === "building" ? 0.5 : 0.7,
            defects: p.defects,
          }),
      })

      const insertFile = db.prepare(
        `INSERT INTO project_files (project_id, path, content, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      )
      const now = Date.now()
      const keptPaths = new Set(engineering.files.map((f) => f.path))
      for (const file of engineering.files) {
        insertFile.run(project.id, file.path, file.content, now)
      }
      // Контур мог снести файл, несовместимый со сборкой (например, api-роут) —
      // тогда его надо убрать и из проекта, иначе вердикт разойдётся с содержимым.
      const removeFile = db.prepare(`DELETE FROM project_files WHERE project_id = ? AND path = ?`)
      for (const row of rows) {
        if (!keptPaths.has(row.path)) removeFile.run(project.id, row.path)
      }

      db.prepare(`UPDATE projects SET status = 'ready', generation_error = ? WHERE id = ?`).run(
        summarizeVerdict(engineering.report),
        project.id,
      )
      persistEngineering(project.id, engineering.report)
      persistDesign(project.id, brief, explainDesignQuality(engineering.files))

      emitGenerationStage({
        projectId: project.id,
        stage: "ready",
        label:
          engineering.report.verdict === "broken"
            ? "Ремонт завершён — часть дефектов осталась"
            : "Ремонт завершён — приложение проверено",
        progress: 1,
        fileCount: engineering.files.length,
        verdict: engineering.report.verdict,
        defects: engineering.report.defects.filter((d) => d.severity === "error").length,
      })
    } catch (err) {
      captureError("[projects.repair] повторный контур упал:", err)
      // Проект обязан вернуться в рабочее состояние — «generating» навсегда недопустим.
      db.prepare(`UPDATE projects SET status = ? WHERE id = ?`).run(
        previousStatus === "generating" ? "ready" : previousStatus,
        project.id,
      )
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
 * просто переадаптировать шаблон. Никогда не бросает наружу.
 *
 * onDone (опц.) — колбэк по завершении джоба (обновить статус строки леджера).
 */
export function refineGeneratedProject(params: {
  userId: number
  projectId: number
  prompt: string
  onDone?: (ok: boolean) => void
}): boolean {
  const project = db
    .prepare(`SELECT id, name, description FROM projects WHERE id = ? AND user_id = ?`)
    .get(params.projectId, params.userId) as { id: number; name: string; description: string | null } | undefined
  if (!project) return false

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

  const quick = localFallbackGeneration(project.name, refine)

  // fire-and-forget тот же джоб; template=null → полная AI-генерация по промпту.
  // onDone вызываем после завершения (успех/ошибка) для отметки в леджере.
  // Доработка идёт по стандартной глубине: полная AI-генерация по промпту и
  // такой же инженерный контур, как у обычной генерации.
  void runAppGenerationJob(params.userId, project.id, project.name, mergedHint, quick, null, true, "standard")
    .then(() => {
      const row = db.prepare(`SELECT status FROM projects WHERE id = ?`).get(project.id) as
        | { status: string }
        | undefined
      params.onDone?.(row?.status === "ready")
    })

  return true
}
