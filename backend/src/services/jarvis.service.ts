import dotenv from "dotenv"
import db from "../lib/db"

dotenv.config()

/* ================================================================
   OSGARD · JARVIS Service
   ----------------------------------------------------------------
   Обрабатывает вопросы пользователя с 4-уровневой маршрутизацией:

   1. КЕШ (in-memory)      — мгновенный ответ на повторяющиеся вопросы
   2. ЛОКАЛЬНЫЕ ОТВЕТЫ     — баланс/артефакты/проекты из БД, без AI
   3. DeepSeek             — простые/непредсказуемые вопросы (дёшево и быстро)
   4. Grok (xAI)           — вопросы средней сложности
   5. Claude (Anthropic)   — сложные/творческие вопросы

   Если ключ провайдера не задан или запрос упал — откат на
   следующий уровень по цепочке DeepSeek → Grok → Claude → fallback-текст,
   так что сервис работает даже без внешних API.
   ================================================================ */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

const XAI_API_KEY = process.env.XAI_API_KEY || ""
const XAI_API_URL = "https://api.x.ai/v1/chat/completions"
const XAI_MODEL = process.env.XAI_MODEL || "grok-2-latest"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ""
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"

const JARVIS_SYSTEM_PROMPT =
  "Ты — ВАЛЛИ, AI-ассистент платформы OSGARD (игровая экосистема с артефактами, валютами и стейкингом). " +
  "Отвечай кратко, по делу, дружелюбно, на русском языке."

export type JarvisRoute = "cache" | "local" | "deepseek" | "grok" | "claude" | "fallback"

export type JarvisAnswer = {
  answer: string
  route: JarvisRoute
  cached: boolean
}

/* ================================================================
   1. КЕШ — простое in-memory хранилище с TTL
   ================================================================ */

type CacheEntry = { answer: string; route: JarvisRoute; expiresAt: number }

const CACHE_TTL_MS = 15 * 60 * 1000 // 15 минут
const cache = new Map<string, CacheEntry>()

/** Нормализует вопрос для использования в качестве ключа кеша. */
function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?!.,;:]+$/g, "")
}

/** Ключ кеша учитывает userId, т.к. локальные ответы (баланс) — персональные. */
function cacheKey(userId: number, question: string): string {
  return `${userId}::${normalizeQuestion(question)}`
}

function getFromCache(userId: number, question: string): CacheEntry | null {
  const key = cacheKey(userId, question)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry
}

function setCache(userId: number, question: string, answer: string, route: JarvisRoute) {
  const key = cacheKey(userId, question)
  cache.set(key, { answer, route, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Полностью очищает кеш (все пользователи). */
export function clearJarvisCache(): number {
  const size = cache.size
  cache.clear()
  return size
}

/** Очищает кеш только для одного пользователя. */
export function clearJarvisCacheForUser(userId: number): number {
  let removed = 0
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}::`)) {
      cache.delete(key)
      removed++
    }
  }
  return removed
}

export function getJarvisCacheStats() {
  return { size: cache.size, ttlMs: CACHE_TTL_MS }
}

/* ================================================================
   2. ЛОКАЛЬНЫЕ ОТВЕТЫ — баланс / артефакты / проекты (без обращения к AI)
   ================================================================ */

type WalletRow = {
  credits: number
  shards: number
  crystals: number
  timecoin: number
  cash_usd: number
}

const BALANCE_KEYWORDS = [
  "баланс", "кошел", "сколько у меня", "сколько кредит", "сколько осколк",
  "сколько кристалл", "сколько timecoin", "сколько тайм", "деньги", "средств",
]

const ARTIFACT_KEYWORDS = [
  "артефакт", "сколько у меня артефакт", "мои артефакты", "инвентарь",
]

const PROJECT_KEYWORDS = ["проект", "мои проекты", "сколько проектов"]

function matchesAny(question: string, keywords: string[]): boolean {
  const q = question.toLowerCase()
  return keywords.some((k) => q.includes(k))
}

function formatWalletAnswer(wallet: WalletRow): string {
  return (
    `Ваш текущий баланс:\n` +
    `⚡ Кредиты: ${Math.round(wallet.credits).toLocaleString("ru-RU")}\n` +
    `♦ Осколки: ${Math.round(wallet.shards).toLocaleString("ru-RU")}\n` +
    `💎 Кристаллы: ${wallet.crystals.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}\n` +
    `∞ TimeCoin: ${wallet.timecoin.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}\n` +
    `💵 Наличные: $${wallet.cash_usd.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`
  )
}

function tryLocalAnswer(userId: number, question: string): string | null {
  if (matchesAny(question, BALANCE_KEYWORDS)) {
    const wallet = db
      .prepare(
        `SELECT credits, shards, crystals, timecoin, cash_usd FROM wallets WHERE user_id = ?`,
      )
      .get(userId) as WalletRow | undefined

    if (!wallet) return "Кошелёк не найден. Похоже, ваш аккаунт ещё не инициализирован."
    return formatWalletAnswer(wallet)
  }

  if (matchesAny(question, ARTIFACT_KEYWORDS)) {
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM artifacts WHERE owner_id = ?`)
      .get(userId) as { cnt: number } | undefined

    const rarities = db
      .prepare(
        `SELECT rarity, COUNT(*) as cnt FROM artifacts WHERE owner_id = ? GROUP BY rarity`,
      )
      .all(userId) as { rarity: string; cnt: number }[]

    const total = row?.cnt ?? 0
    if (total === 0) return "У вас пока нет артефактов. Загляните в Кузницу, чтобы создать первый!"

    const breakdown = rarities.map((r) => `${r.rarity}: ${r.cnt}`).join(", ")
    return `У вас ${total} артефакт(ов). Разбивка по редкости — ${breakdown}.`
  }

  if (matchesAny(question, PROJECT_KEYWORDS)) {
    const row = db
      .prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(income), 0) as income FROM projects WHERE user_id = ?`)
      .get(userId) as { cnt: number; income: number } | undefined

    const total = row?.cnt ?? 0
    if (total === 0) return "У вас пока нет проектов. Создайте первый проект вручную или с помощью AI!"
    return `У вас ${total} проект(ов), суммарный доход с них: ${Math.round(row?.income ?? 0).toLocaleString("ru-RU")} кредитов.`
  }

  return null
}

/* ================================================================
   3. Классификация сложности вопроса (простая эвристика)
   ================================================================ */

type Complexity = "simple" | "medium" | "complex"

const COMPLEX_HINTS = [
  "напиши", "придумай", "сочини", "стих", "рассказ", "сценарий", "код", "функци",
  "алгоритм", "объясни подробно", "проанализируй", "сравни", "стратег", "план",
  "почему", "как лучше", "оптимизир",
]

const MEDIUM_HINTS = [
  "как", "что такое", "расскажи", "объясни", "разница", "чем отличается", "посоветуй",
]

function classifyComplexity(question: string): Complexity {
  const q = question.toLowerCase()
  if (COMPLEX_HINTS.some((h) => q.includes(h)) || question.length > 180) return "complex"
  if (MEDIUM_HINTS.some((h) => q.includes(h)) || question.length > 60) return "medium"
  return "simple"
}

/* ================================================================
   4. Вызовы внешних AI-провайдеров
   ================================================================ */

async function callDeepSeek(question: string): Promise<string | null> {
  if (!DEEPSEEK_API_KEY) return null
  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: JARVIS_SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
        max_tokens: 512,
      }),
    })
    if (!res.ok) {
      console.error(`[jarvis] DeepSeek API error: ${res.status} ${res.statusText}`)
      return null
    }
    const data: any = await res.json()
    const text = data?.choices?.[0]?.message?.content
    return typeof text === "string" && text.trim() ? text.trim() : null
  } catch (err) {
    console.error("[jarvis] DeepSeek call failed:", err)
    return null
  }
}

async function callGrok(question: string): Promise<string | null> {
  if (!XAI_API_KEY) return null
  try {
    const res = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages: [
          { role: "system", content: JARVIS_SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
        max_tokens: 768,
      }),
    })
    if (!res.ok) {
      console.error(`[jarvis] Grok (xAI) API error: ${res.status} ${res.statusText}`)
      return null
    }
    const data: any = await res.json()
    const text = data?.choices?.[0]?.message?.content
    return typeof text === "string" && text.trim() ? text.trim() : null
  } catch (err) {
    console.error("[jarvis] Grok call failed:", err)
    return null
  }
}

async function callClaude(question: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: JARVIS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: question }],
      }),
    })
    if (!res.ok) {
      console.error(`[jarvis] Claude API error: ${res.status} ${res.statusText}`)
      return null
    }
    const data: any = await res.json()
    const text = data?.content?.[0]?.text
    return typeof text === "string" && text.trim() ? text.trim() : null
  } catch (err) {
    console.error("[jarvis] Claude call failed:", err)
    return null
  }
}

/** Локальный fallback, если ни один провайдер не ответил (нет ключей / все упали). */
function localFallbackAnswer(question: string): string {
  return (
    "Я ВАЛЛИ, но сейчас не могу связаться с внешними AI-провайдерами " +
    "(проверьте DEEPSEEK_API_KEY / XAI_API_KEY / ANTHROPIC_API_KEY на сервере). " +
    "Попробуйте спросить про баланс или артефакты — на такие вопросы я отвечаю мгновенно без AI."
  )
}

/**
 * Маршрутизация по цепочке провайдеров в зависимости от сложности:
 * simple → DeepSeek → Grok → Claude → fallback
 * medium → Grok → DeepSeek → Claude → fallback
 * complex → Claude → Grok → DeepSeek → fallback
 */
async function routeToProvider(question: string, complexity: Complexity): Promise<{ answer: string; route: JarvisRoute }> {
  const chains: Record<Complexity, Array<{ name: JarvisRoute; fn: (q: string) => Promise<string | null> }>> = {
    simple: [
      { name: "deepseek", fn: callDeepSeek },
      { name: "grok", fn: callGrok },
      { name: "claude", fn: callClaude },
    ],
    medium: [
      { name: "grok", fn: callGrok },
      { name: "deepseek", fn: callDeepSeek },
      { name: "claude", fn: callClaude },
    ],
    complex: [
      { name: "claude", fn: callClaude },
      { name: "grok", fn: callGrok },
      { name: "deepseek", fn: callDeepSeek },
    ],
  }

  for (const provider of chains[complexity]) {
    const answer = await provider.fn(question)
    if (answer) return { answer, route: provider.name }
  }

  return { answer: localFallbackAnswer(question), route: "fallback" }
}

/* ================================================================
   Основная точка входа
   ================================================================ */

export async function askJarvis(userId: number, rawQuestion: string): Promise<JarvisAnswer> {
  const question = (rawQuestion || "").trim()
  if (!question) {
    return { answer: "Задайте вопрос, и я постараюсь помочь.", route: "fallback", cached: false }
  }

  /* 1. Кеш */
  const cached = getFromCache(userId, question)
  if (cached) {
    return { answer: cached.answer, route: cached.route, cached: true }
  }

  /* 2. Локальные ответы (баланс/артефакты/проекты) — без AI, без кеша не нужны, но кешируем тоже */
  const localAnswer = tryLocalAnswer(userId, question)
  if (localAnswer) {
    setCache(userId, question, localAnswer, "local")
    return { answer: localAnswer, route: "local", cached: false }
  }

  /* 3-5. Маршрутизация к внешним AI по сложности вопроса */
  const complexity = classifyComplexity(question)
  const { answer, route } = await routeToProvider(question, complexity)

  setCache(userId, question, answer, route)
  return { answer, route, cached: false }
}

export function isAnyProviderConfigured(): boolean {
  return !!DEEPSEEK_API_KEY || !!XAI_API_KEY || !!ANTHROPIC_API_KEY
}
