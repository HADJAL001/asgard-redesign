import dotenv from "dotenv"
import { cacheService } from "./cache.service"
import {
  hashString,
  extractJson,
  callOpenAiCompatible,
  callClaudeApi,
  callClaudeRaw,
  callDeepSeekRaw,
  callGrokRaw,
  isAiConfigured,
} from "./ai-router"

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

   Вызовы провайдеров и общие хелперы (extractJson, hashString) живут
   в ai-router.ts — здесь только project-generation-специфичная
   логика: промпт, парсинг, fallback и кеш результата.
   ================================================================ */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY || ""
const GROK_API_URL = "https://api.x.ai/v1/chat/completions"
const GROK_MODEL = process.env.GROK_MODEL || process.env.XAI_MODEL || "grok-4-fast"

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

/** Локальный fallback-генератор — работает без внешнего API, без сети, без ключей. */
export function localFallbackGeneration(name: string, hint?: string): AiProjectGeneration {
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
  const text = await callClaudeApi(buildPrompt(name, hint), 1024)
  if (text == null) return null
  return parseGeneration(text, "claude")
}

const PROVIDER_CHAIN = [callClaude, callDeepSeek, callGrok]

/**
 * Пробует провайдеров по очереди (Claude → DeepSeek → Grok), при отсутствии
 * ключа или ошибке переходит к следующему. Если все отказали — откатывается
 * на локальный fallback.
 */
async function generateProjectContentUncached(name: string, hint?: string): Promise<AiProjectGeneration> {
  for (const provider of PROVIDER_CHAIN) {
    const result = await provider(name, hint)
    if (result) return result
  }
  return localFallbackGeneration(name, hint)
}

const PROJECT_GEN_CACHE_TTL_SECONDS = 60 * 60 // 1 час

/**
 * Основная точка входа: как generateProjectContentUncached, но с кешем по
 * хэшу (name + hint) — одинаковые название и подсказка проекта не редкость
 * (частые/generic hints), а генерация детерминирована с точки зрения
 * пользователя, так что повторный вызов API не нужен.
 */
export async function generateProjectContent(name: string, hint?: string): Promise<AiProjectGeneration> {
  const cacheKey = `project-gen:${hashString(name + "::" + (hint || ""))}`
  return cacheService.getOrSet(cacheKey, PROJECT_GEN_CACHE_TTL_SECONDS, () =>
    generateProjectContentUncached(name, hint),
  )
}

export { hashString, extractJson, callOpenAiCompatible, callClaudeRaw, callDeepSeekRaw, callGrokRaw, isAiConfigured }
