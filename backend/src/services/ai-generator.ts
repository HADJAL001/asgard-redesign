import dotenv from "dotenv"

dotenv.config()

/* ================================================================
   OSGARD · AI Generator Service
   ----------------------------------------------------------------
   Генерирует контент проекта (описание, бейдж, стартовые артефакты)
   через цепочку AI-провайдеров: Claude → DeepSeek → Grok. Claude —
   основной провайдер для создания проектов, остальные — резерв,
   если Claude недоступен. Если ни один ключ не задан или все запросы
   упали — используется детерминированный локальный fallback, так что
   фича работает даже без реального AI-провайдера.
   ================================================================ */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

const GROK_API_KEY = process.env.GROK_API_KEY || ""
const GROK_API_URL = "https://api.x.ai/v1/chat/completions"
const GROK_MODEL = process.env.GROK_MODEL || "grok-4-fast" /* grok-2-latest снят с производства xAI, возвращает "Model not found" */

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ""
/* Временно можно указать CLAUDE_API_URL в .env, чтобы направить запросы через сторонний
   шлюз (например, на время отсутствия прямого ключа Anthropic). По умолчанию — офиц. API. */
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || "https://api.anthropic.com/v1/messages"
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"

export type AiArtifactSuggestion = {
  name: string
  type: "neural" | "crystal" | "weapon" | "shield" | "artifact"
}

export type AiProjectGeneration = {
  description: string
  badge: string
  artifacts: AiArtifactSuggestion[]
  /** источник генерации: конкретный провайдер или "fallback" для локального генератора */
  source: "deepseek" | "grok" | "claude" | "fallback"
}

const BADGE_POOL = [
  "brain", "cpu", "network", "circuit", "bot", "component",
  "hammer", "anvil", "wrench", "cog", "pickaxe", "flame",
  "folderkanban", "folder", "boxes", "package", "layers",
  "orbit", "rocket", "globe", "satellite", "moon", "sun", "atom", "compass",
  "zap", "bolt", "battery", "radiation",
  "shield", "shieldcheck", "shieldhalf", "lock", "key",
  "target", "crosshair", "trophy", "award", "medal", "eye",
  "sparkles", "wand", "feather", "sword", "skull", "infinity",
  "gem", "diamond", "crown", "star", "hexagon",
]

const ARTIFACT_TYPES: AiArtifactSuggestion["type"][] = ["neural", "crystal", "weapon", "shield", "artifact"]

/** Простой детерминированный хэш строки → число (для стабильного fallback-выбора). */
export function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Локальный fallback-генератор — работает без внешнего API, без сети, без ключей. */
function localFallbackGeneration(name: string, hint?: string): AiProjectGeneration {
  const seed = hashString(name + (hint || ""))
  const badge = BADGE_POOL[seed % BADGE_POOL.length]

  const themeWords = (hint || name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")

  const description = hint
    ? `${name} — проект в направлении «${hint}». Автоматически сгенерированное описание: команда создаёт цифровые артефакты, развивающие идею ${themeWords || name}, с упором на инновации и качество исполнения.`
    : `${name} — амбициозный проект экосистемы OSGARD. Автоматически сгенерированное описание: команда создаёт уникальные цифровые артефакты, формирующие новую грань цифровой вселенной.`

  const artifactCount = 3 + (seed % 3) // 3-5 артефактов
  const artifacts: AiArtifactSuggestion[] = Array.from({ length: artifactCount }).map((_, i) => {
    const type = ARTIFACT_TYPES[(seed + i * 7) % ARTIFACT_TYPES.length]
    const suffixes = ["Ядро", "Осколок", "Импульс", "Матрица", "Сфера", "Кристалл", "Клинок", "Щит"]
    const suffix = suffixes[(seed + i * 13) % suffixes.length]
    return { name: `${suffix} ${name}`, type }
  })

  return { description, badge, artifacts, source: "fallback" }
}

/** Пытается распарсить JSON-объект из текстового ответа модели (может быть обёрнут в ```json ... ```). */
export function extractJson(text: string): any | null {
  const cleaned = text.replace(/```json/gi, "```").trim()
  const fenced = cleaned.match(/```([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : cleaned
  try {
    return JSON.parse(candidate)
  } catch {
    // попробуем найти первую { ... } подстроку
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function isValidType(t: any): t is AiArtifactSuggestion["type"] {
  return ARTIFACT_TYPES.includes(t)
}

function buildPrompt(name: string, hint?: string): string {
  return `Ты — генератор контента для игровой платформы OSGARD, где пользователи создают "проекты" и цифровые "артефакты".
Дан проект с названием: "${name}"${hint ? ` и описанием намерения пользователя: "${hint}"` : ""}.

Верни СТРОГО валидный JSON (без пояснений, без markdown) со следующей структурой:
{
  "description": "краткое яркое описание проекта на русском языке, 1-2 предложения",
  "badge": "один из: ${BADGE_POOL.join(", ")}",
  "artifacts": [
    { "name": "название артефакта на русском", "type": "один из: neural, crystal, weapon, shield, artifact" },
    { "name": "...", "type": "..." },
    { "name": "...", "type": "..." }
  ]
}
Верни ровно 3 артефакта. Ответь только JSON.`
}

/** Парсит и валидирует JSON-ответ модели в общую структуру генерации. */
function parseGeneration(text: string, source: AiProjectGeneration["source"]): AiProjectGeneration | null {
  const parsed = extractJson(text)
  if (!parsed) return null

  const description = typeof parsed.description === "string" ? parsed.description : null
  const badge = typeof parsed.badge === "string" && BADGE_POOL.includes(parsed.badge) ? parsed.badge : null
  const rawArtifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : []

  const artifacts: AiArtifactSuggestion[] = rawArtifacts
    .filter((a: any) => a && typeof a.name === "string" && isValidType(a.type))
    .map((a: any) => ({ name: a.name, type: a.type }))
    .slice(0, 3)

  if (!description || !badge || artifacts.length === 0) return null

  return { description, badge, artifacts, source }
}

/** Общий вызов для OpenAI-совместимых chat/completions API (DeepSeek, Grok/xAI). */
export async function callOpenAiCompatible<T>(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  parser: (text: string) => T | null,
  logLabel: string,
): Promise<T | null> {
  if (!apiKey) return null

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
      }),
    })

    if (!res.ok) {
      console.error(`[ai-generator] ${logLabel} API error: ${res.status} ${res.statusText}`)
      return null
    }

    const data: any = await res.json()
    const text: string = data?.choices?.[0]?.message?.content || ""
    return parser(text)
  } catch (err) {
    console.error(`[ai-generator] ${logLabel} API call failed:`, err)
    return null
  }
}

/** Вызывает DeepSeek API для генерации описания проекта, бейджа и стартовых артефактов. */
async function callDeepSeek(name: string, hint?: string): Promise<AiProjectGeneration | null> {
  return callOpenAiCompatible(
    DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL,
    buildPrompt(name, hint), (text) => parseGeneration(text, "deepseek"), "deepseek",
  )
}

/** Вызывает Grok (xAI) API для генерации описания проекта, бейджа и стартовых артефактов. */
async function callGrok(name: string, hint?: string): Promise<AiProjectGeneration | null> {
  return callOpenAiCompatible(
    GROK_API_URL, GROK_API_KEY, GROK_MODEL,
    buildPrompt(name, hint), (text) => parseGeneration(text, "grok"), "grok",
  )
}

/** Вызывает Claude API для генерации описания проекта, бейджа и стартовых артефактов. */
async function callClaude(name: string, hint?: string): Promise<AiProjectGeneration | null> {
  if (!CLAUDE_API_KEY) return null

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: buildPrompt(name, hint) }],
      }),
    })

    if (!res.ok) {
      console.error(`[ai-generator] Claude API error: ${res.status} ${res.statusText}`)
      return null
    }

    const data: any = await res.json()
    const text: string = data?.content?.[0]?.text || ""
    return parseGeneration(text, "claude")
  } catch (err) {
    console.error("[ai-generator] Claude API call failed:", err)
    return null
  }
}

const PROVIDER_CHAIN = [callClaude, callDeepSeek, callGrok]

/**
 * Основная точка входа: пробует провайдеров по очереди (Claude → DeepSeek → Grok),
 * при отсутствии ключа или ошибке переходит к следующему. Если все отказали —
 * откатывается на локальный fallback.
 */
export async function generateProjectContent(name: string, hint?: string): Promise<AiProjectGeneration> {
  for (const provider of PROVIDER_CHAIN) {
    const result = await provider(name, hint)
    if (result) return result
  }
  return localFallbackGeneration(name, hint)
}

/** true, если хотя бы один реальный AI-провайдер сконфигурирован (иначе всегда используется fallback). */
export function isAiConfigured(): boolean {
  return !!(DEEPSEEK_API_KEY || GROK_API_KEY || CLAUDE_API_KEY)
}
