import crypto from "node:crypto"
import db from "../lib/db"
import type { GeneratedAppFile, ManifestEntry } from "./app-generator"
import type { AiArtifactSuggestion } from "./ai-generator"

/* ================================================================
   OSGARD · Умные шаблоны — хранилище кэша генераций
   ----------------------------------------------------------------
   Полная AI-генерация реального приложения (app-generator.ts) стоит
   ~2048 + N*8000 токенов. Многие проекты пользователей относятся к
   одной и той же теме (fantasy, sci-fi, ecommerce, ...) — вместо
   генерации с нуля каждый раз, успешный результат сохраняется как
   "шаблон" и переиспользуется/адаптируется для следующих проектов
   той же темы (см. template-adapter.ts).

   Ключ поиска — хэш ТЕМЫ + ключевых слов, никогда не название
   проекта (оно уникально для пользователя — было бы гарантированным
   промахом кэша). В шаблон попадают только поля-ВЫХОД генератора
   (manifest/files/artifact_types/description/badge) — никогда
   user_id/project_id/created_at живого проекта, поэтому отдельный
   regex-анонимизатор не нужен: структурно нечего анонимизировать.
   ================================================================ */

const THEME_KEYWORDS: Record<string, string[]> = {
  fantasy: ["fantasy", "фэнтези", "магия", "magic", "dragon", "дракон", "meч", "sword", "квест", "quest"],
  scifi: ["sci-fi", "scifi", "фантастика", "космос", "space", "робот", "robot", "cyberpunk", "киберпанк", "звездолёт"],
  ecommerce: ["shop", "магазин", "store", "commerce", "маркет", "market", "продажа", "checkout", "каталог", "catalog"],
  blog: ["blog", "блог", "новости", "news", "статья", "article", "журнал", "magazine"],
  dashboard: ["dashboard", "дашборд", "аналитика", "analytics", "admin", "панель", "crm", "erp"],
  game: ["game", "игра", "рпг", "rpg", "arcade", "аркада", "battle", "бой", "level", "уровень"],
  social: ["social", "соц", "чат", "chat", "сообщество", "community", "friends", "друзья", "профиль", "profile"],
  portfolio: ["portfolio", "портфолио", "резюме", "resume", "cv", "лендинг", "landing"],
}

export type TemplateThemeMatch = { theme: string; keywords: string[] }

/** Локальный (без AI) детектор темы по словарю ключевых слов — бесплатный и синхронный. */
export function detectTheme(name: string, hint?: string): TemplateThemeMatch {
  const haystack = `${name} ${hint || ""}`.toLowerCase()

  let bestTheme = "general"
  let bestKeywords: string[] = []

  for (const [theme, words] of Object.entries(THEME_KEYWORDS)) {
    const matched = words.filter((w) => haystack.includes(w))
    if (matched.length > bestKeywords.length) {
      bestTheme = theme
      bestKeywords = matched
    }
  }

  return { theme: bestTheme, keywords: bestKeywords.sort() }
}

/** Хэш по теме+ключевым словам (НЕ по названию проекта — оно per-user-уникально). */
export function computeTemplateHash(theme: string, keywords: string[]): string {
  return crypto.createHash("sha256").update(`${theme}|${[...keywords].sort().join(",")}`).digest("hex")
}

type TemplateRow = {
  id: number
  hash: string
  theme: string
  keywords: string
  name_sample: string | null
  description_sample: string | null
  badge: string | null
  manifest: string
  files: string
  artifact_types: string
  usage_count: number
  tokens_saved_estimate: number
}

export type MatchedTemplate = {
  id: number
  theme: string
  nameSample: string | null
  description: string | null
  badge: string | null
  manifest: ManifestEntry[]
  files: GeneratedAppFile[]
  artifactTypes: AiArtifactSuggestion[]
}

function rowToMatch(row: TemplateRow): MatchedTemplate {
  return {
    id: row.id,
    theme: row.theme,
    nameSample: row.name_sample,
    description: row.description_sample,
    badge: row.badge,
    manifest: JSON.parse(row.manifest),
    files: JSON.parse(row.files),
    artifactTypes: JSON.parse(row.artifact_types),
  }
}

/** Ищет лучший шаблон для темы: сперва точное совпадение хэша (тема+ключевые слова),
 *  иначе — самый переиспользуемый шаблон той же темы. */
export function findBestTemplate(theme: string, keywords: string[]): MatchedTemplate | null {
  if (theme === "general") return null

  const hash = computeTemplateHash(theme, keywords)
  const exact = db.prepare(`SELECT * FROM project_templates WHERE hash = ?`).get(hash) as TemplateRow | undefined
  if (exact) return rowToMatch(exact)

  const byTheme = db
    .prepare(`SELECT * FROM project_templates WHERE theme = ? ORDER BY usage_count DESC LIMIT 1`)
    .get(theme) as TemplateRow | undefined
  return byTheme ? rowToMatch(byTheme) : null
}

/** Сохраняет успешную AI-генерацию как новый шаблон (INSERT OR IGNORE — не дублирует
 *  по одинаковому хэшу). Персистит только выход генератора, никогда данные живого
 *  проекта/пользователя. */
export function saveTemplateFromGeneration(params: {
  name: string
  hint?: string
  description: string
  badge: string
  manifest: ManifestEntry[]
  files: GeneratedAppFile[]
  artifactTypes: AiArtifactSuggestion[]
}) {
  const { theme, keywords } = detectTheme(params.name, params.hint)
  if (theme === "general") return // тема не распознана — нечего кэшировать по теме

  const hash = computeTemplateHash(theme, keywords)
  const now = Date.now()

  db.prepare(
    `INSERT INTO project_templates
       (hash, theme, keywords, name_sample, description_sample, badge, manifest, files, artifact_types,
        usage_count, tokens_saved_estimate, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
     ON CONFLICT(hash) DO NOTHING`,
  ).run(
    hash,
    theme,
    keywords.join(","),
    params.name,
    params.description,
    params.badge,
    JSON.stringify(params.manifest),
    JSON.stringify(params.files),
    JSON.stringify(params.artifactTypes),
    now,
    now,
  )
}

/** Оценка сэкономленных токенов на одно переиспользование: полная генерация тратит
 *  ~2048 (манифест) + N*8000 (файлы), адаптация — один короткий вызов ~800 токенов. */
export function estimateTokensSaved(fileCount: number): number {
  const fullGenerationCost = 2048 + fileCount * 8000
  const adaptationCost = 800
  return Math.max(0, fullGenerationCost - adaptationCost)
}

export function incrementTemplateUsage(templateId: number, tokensSaved: number) {
  db.prepare(
    `UPDATE project_templates SET usage_count = usage_count + 1, tokens_saved_estimate = tokens_saved_estimate + ?, updated_at = ? WHERE id = ?`,
  ).run(tokensSaved, Date.now(), templateId)
}

export function getTemplateSavingsReport() {
  return db
    .prepare(
      `SELECT COUNT(*) as templates, COALESCE(SUM(usage_count), 0) as reuses, COALESCE(SUM(tokens_saved_estimate), 0) as tokensSaved
       FROM project_templates`,
    )
    .get() as { templates: number; reuses: number; tokensSaved: number }
}
