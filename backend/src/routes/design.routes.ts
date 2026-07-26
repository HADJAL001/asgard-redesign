import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { captureError } from "../lib/sentry"
import {
  ARCHETYPE_MENU,
  DESIGN_SYSTEM_PATHS,
  FONT_MENU,
  clampBriefProposal,
  deriveDesignBrief,
  renderDesignSystemFiles,
  type BriefProposal,
  type DesignBrief,
} from "../lib/design-system"
import { explainDesignQuality } from "../lib/design-qa"

/* ================================================================
   OSGARD · Дизайн-студия проекта
   ----------------------------------------------------------------
   Дизайн-система (миграция 090) выводится при генерации и до сих пор
   была НЕИЗМЕНЯЕМОЙ: единственный способ поменять облик приложения —
   заново прогнать генерацию, потратив квоту или кредиты и получив
   заодно другой КОД. Это неправильно по существу: оформление и логика
   приложения — разные вещи, и менять первое, рискуя вторым, странно.

   Здесь перенастройка облика отделена от генерации кода:
   • `GET /design/options` — закрытое меню допустимых решений;
   • `POST /design/projects/:id/retune` — пересобрать палитру/типографику/
     ритм и ПЕРЕПИСАТЬ только три файла дизайн-системы
     (tailwind.config.ts, app/globals.css, app/layout.tsx).

   Свойства операции, важные для доверия:
   - **Код приложения не трогается вообще** — ни один .tsx страниц и
     компонентов не переписывается, статус проекта не меняется.
   - **AI не зовётся**, кредиты не списываются, квота не тратится:
     всё считается детерминированно в lib/design-system.ts.
   - **Выбор зажат** тем же `clampBriefProposal`, что и ответ AI-арт-
     директора: контраст WCAG пересчитывается алгоритмом, поэтому
     пользователь физически не может настроить себе нечитаемый интерфейс.
   - Балл интерфейса пересчитывается заново — и уже с НОВОЙ палитрой,
     так что проверка пар токенов (a11y/token-pair-contrast) честно
     покажет, если существующий код с новым обликом стал хуже.
   ================================================================ */

const router = Router()

/** Человекочитаемые названия архетипов для UI (паритет с ARCHETYPE_LABEL на фронте). */
const ARCHETYPE_LABELS: Record<string, string> = {
  arcane: "Тайное знание",
  console: "Приборная панель",
  boutique: "Витрина",
  editorial: "Издание",
  cockpit: "Кабина пилота",
  playful: "Игровой",
  commons: "Сообщество",
  gallery: "Галерея",
  studio: "Студия",
}

const DENSITIES = [
  { id: "compact", label: "Плотная" },
  { id: "comfortable", label: "Обычная" },
  { id: "spacious", label: "Просторная" },
]

const RADIUS_STYLES = [
  { id: "sharp", label: "Острые углы" },
  { id: "default", label: "По архетипу" },
  { id: "soft", label: "Мягкие" },
  { id: "pill", label: "Капсулы" },
]

/* ---------------- GET /design/options — каталог допустимых решений ----------------
   Закрытое меню: фронт показывает ровно то, что примет сервер, — иначе пользователь
   выбирал бы варианты, которые зажим всё равно отбросит. */
router.get("/options", requireAuth, (_req: AuthRequest, res) => {
  res.json({
    archetypes: ARCHETYPE_MENU.map((id) => ({ id, label: ARCHETYPE_LABELS[id] ?? id })),
    schemes: [
      { id: "dark", label: "Тёмная" },
      { id: "light", label: "Светлая" },
    ],
    densities: DENSITIES,
    radiusStyles: RADIUS_STYLES,
    fonts: FONT_MENU,
    /** Оттенок задаётся числом 0..359 — сырые цвета не принимаются принципиально. */
    hueRange: { min: 0, max: 359 },
  })
})

/** Достаёт бриф проекта. Колонок 090 может не быть на старой схеме — тогда undefined. */
function loadBrief(projectId: number): DesignBrief | undefined {
  try {
    const row = db.prepare(`SELECT design_brief as designBrief FROM projects WHERE id = ?`).get(projectId) as
      | { designBrief: string | null }
      | undefined
    if (!row?.designBrief) return undefined
    const parsed = JSON.parse(row.designBrief)
    return parsed && typeof parsed === "object" ? (parsed as DesignBrief) : undefined
  } catch {
    return undefined
  }
}

/* ---------------- POST /design/projects/:id/retune — перенастроить облик ---------------- */
router.post(
  "/projects/:id/retune",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const projectId = Number(req.params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Некорректный id проекта" })
    }

    const project = db
      .prepare(`SELECT id, name, description FROM projects WHERE id = ? AND user_id = ?`)
      .get(projectId, req.user!.userId) as { id: number; name: string; description: string | null } | undefined

    // 404 и на чужой, и на отсутствующий — чужое существование не раскрываем.
    if (!project) return res.status(404).json({ error: "Проект не найден" })

    const files = db.prepare(`SELECT path, content FROM project_files WHERE project_id = ?`).all(projectId) as Array<{
      path: string
      content: string
    }>
    if (files.length === 0) {
      return res.status(400).json({ error: "У проекта ещё нет файлов — дождитесь окончания генерации" })
    }

    // База: сохранённый бриф проекта. Его нет (legacy до 090) — выводим детерминированно
    // из имени, чтобы перенастройка работала и для старых проектов.
    const base = loadBrief(projectId) ?? deriveDesignBrief({ name: project.name })

    // Пользовательский выбор проходит ТОТ ЖЕ зажим, что и ответ AI-арт-директора:
    // архетип/шрифты только из меню, насыщенность — в коридоре, контраст —
    // пересчитывается алгоритмом. Нечитаемый интерфейс настроить нельзя.
    const proposal: BriefProposal = {
      archetype: typeof req.body?.archetype === "string" ? req.body.archetype : undefined,
      scheme: typeof req.body?.scheme === "string" ? req.body.scheme : undefined,
      hue: typeof req.body?.hue === "number" ? req.body.hue : undefined,
      accentHue: typeof req.body?.accentHue === "number" ? req.body.accentHue : undefined,
      saturation: typeof req.body?.saturation === "number" ? req.body.saturation : undefined,
      density: typeof req.body?.density === "string" ? req.body.density : undefined,
      radiusStyle: typeof req.body?.radiusStyle === "string" ? req.body.radiusStyle : undefined,
      displayFont: typeof req.body?.displayFont === "string" ? req.body.displayFont : undefined,
      bodyFont: typeof req.body?.bodyFont === "string" ? req.body.bodyFont : undefined,
    }

    const brief = clampBriefProposal(base, proposal)

    // Переписываем ТОЛЬКО файлы дизайн-системы. Страницы и компоненты не трогаем —
    // это перенастройка оформления, а не перегенерация приложения.
    const rendered = renderDesignSystemFiles(brief, project.name, project.description ?? "")
    const now = Date.now()
    const upsert = db.prepare(
      `INSERT INTO project_files (project_id, path, content, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )

    const owned = new Set<string>(DESIGN_SYSTEM_PATHS)
    const nextFiles = [...files.filter((f) => !owned.has(f.path)), ...rendered]

    // Одна транзакция: либо облик применён целиком, либо не применён вовсе —
    // полу-применённая дизайн-система дала бы конфиг от одной палитры и CSS от другой.
    db.transaction(() => {
      for (const file of rendered) upsert.run(projectId, file.path, file.content, now)
    })()

    // Балл считаем заново и уже с НОВОЙ палитрой: проверка пар токенов честно покажет,
    // если существующий код с этим обликом стал читаться хуже.
    const report = explainDesignQuality(nextFiles, brief)

    try {
      db.prepare(`UPDATE projects SET design_brief = ?, design_score = ?, design_report = ? WHERE id = ?`).run(
        JSON.stringify(brief),
        report.score,
        JSON.stringify({ factors: report.factors, issues: report.issues.slice(0, 40), analyzedFiles: report.analyzedFiles }),
        projectId,
      )
    } catch (err) {
      // Схема без колонок 090: файлы уже обновлены, это главное — но честно скажем,
      // что бриф не сохранён, вместо тихого успеха.
      captureError("[design.retune] не удалось сохранить бриф (схема без колонок 090):", err)
      return res.json({ brief, score: report.score, report, persisted: false })
    }

    return res.json({ brief, score: report.score, report, persisted: true })
  }),
)

export default router
