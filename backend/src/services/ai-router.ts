import dotenv from "dotenv"

dotenv.config()

/* ================================================================
   OSGARD · AI Router
   ----------------------------------------------------------------
   Единая точка конфигурации и вызова внешних AI-провайдеров
   (DeepSeek, Grok/xAI, Claude/Anthropic). Раньше каждый сервис
   (ai-generator, ai-artifact-generator, jarvis, twin, app-generator)
   держал собственные копии этого кода с несовпадающими именами
   env-переменных (GROK_API_KEY vs XAI_API_KEY) — из-за чего Grok
   мог тихо отключаться в части сервисов при задании только одного
   из двух вариантов. Здесь оба варианта приняты как алиасы.

   Порядок обхода провайдеров (какой пробовать первым) остаётся на
   усмотрение вызывающего сервиса — у каждого свой профиль задачи
   (проекты — качество через Claude, чат — скорость через DeepSeek,
   артефакты — креативность через Grok).
   ================================================================ */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY || ""
const GROK_API_URL = "https://api.x.ai/v1/chat/completions"
const GROK_MODEL = process.env.GROK_MODEL || process.env.XAI_MODEL || "grok-4-fast" /* grok-2-latest снят с производства xAI, возвращает "Model not found" */

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ""
/* Временно можно указать CLAUDE_API_URL в .env, чтобы направить запросы через сторонний
   шлюз (например, на время отсутствия прямого ключа Anthropic). По умолчанию — офиц. API. */
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || "https://api.anthropic.com/v1/messages"
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"

/** Простой детерминированный хэш строки → число (используется для стабильных fallback-выборов и кеш-ключей). */
export function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Пытается распарсить JSON-объект из текстового ответа модели (может быть обёрнут в ```json ... ```). */
export function extractJson(text: string): any | null {
  const cleaned = text.replace(/```json/gi, "```").trim()
  const fenced = cleaned.match(/```([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : cleaned
  try {
    return JSON.parse(candidate)
  } catch {
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

/** Общий вызов для OpenAI-совместимых chat/completions API (DeepSeek, Grok/xAI). */
export async function callOpenAiCompatible<T>(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  parser: (text: string) => T | null,
  logLabel: string,
  maxTokens: number = 1024,
  systemPrompt?: string,
  temperature?: number,
): Promise<T | null> {
  if (!apiKey) return null

  try {
    const messages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
      : [{ role: "user", content: prompt }]

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    })

    if (!res.ok) {
      console.error(`[ai-router] ${logLabel} API error: ${res.status} ${res.statusText}`)
      return null
    }

    const data: any = await res.json()
    const text: string = data?.choices?.[0]?.message?.content || ""
    return parser(text)
  } catch (err) {
    console.error(`[ai-router] ${logLabel} API call failed:`, err)
    return null
  }
}

/** Общий вызов Claude API (Anthropic messages endpoint), возвращает сырой текст ответа. */
export async function callClaudeApi(
  prompt: string,
  maxTokens: number = 1024,
  systemPrompt?: string,
  temperature?: number,
): Promise<string | null> {
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
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error(`[ai-router] Claude API error: ${res.status} ${res.statusText}`)
      return null
    }

    const data: any = await res.json()
    return data?.content?.[0]?.text || ""
  } catch (err) {
    console.error("[ai-router] Claude API call failed:", err)
    return null
  }
}

/** Сырые (без JSON-парсинга) вызовы провайдеров — для генератора реальных приложений
 *  (`app-generator.ts`), где ответ — исходный код файла, а не JSON-структура. */
export async function callClaudeRaw(prompt: string, maxTokens: number): Promise<string | null> {
  return callClaudeApi(prompt, maxTokens)
}

export async function callDeepSeekRaw(prompt: string, maxTokens: number): Promise<string | null> {
  return callOpenAiCompatible(DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL, prompt, (t) => t, "deepseek-raw", maxTokens)
}

export async function callGrokRaw(prompt: string, maxTokens: number): Promise<string | null> {
  return callOpenAiCompatible(GROK_API_URL, GROK_API_KEY, GROK_MODEL, prompt, (t) => t, "grok-raw", maxTokens)
}

/** Вызывает DeepSeek chat/completions с готовым парсером ответа. */
export async function callDeepSeek<T>(
  prompt: string,
  parser: (text: string) => T | null,
  logLabel: string,
  maxTokens?: number,
  systemPrompt?: string,
  temperature?: number,
): Promise<T | null> {
  return callOpenAiCompatible(DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL, prompt, parser, logLabel, maxTokens, systemPrompt, temperature)
}

/** Вызывает Grok (xAI) chat/completions с готовым парсером ответа. */
export async function callGrok<T>(
  prompt: string,
  parser: (text: string) => T | null,
  logLabel: string,
  maxTokens?: number,
  systemPrompt?: string,
  temperature?: number,
): Promise<T | null> {
  return callOpenAiCompatible(GROK_API_URL, GROK_API_KEY, GROK_MODEL, prompt, parser, logLabel, maxTokens, systemPrompt, temperature)
}

/** true, если хотя бы один реальный AI-провайдер сконфигурирован (иначе везде используется fallback). */
export function isAiConfigured(): boolean {
  return !!(DEEPSEEK_API_KEY || GROK_API_KEY || CLAUDE_API_KEY)
}
