import dotenv from "dotenv"

dotenv.config()

import { callOpenAiCompatible, extractJson, hashString } from "./ai-router"

/* ================================================================
   OSGARD · AI Artifact Generator Service
   ----------------------------------------------------------------
   Генерирует уникальные артефакты через цепочку AI-провайдеров:
   Grok → DeepSeek. Первый сконфигурированный и успешно ответивший
   провайдер побеждает. Если ни один ключ не задан или все запросы
   упали — используется детерминированный локальный fallback.
   Работает РЯДОМ с ручной механикой "Кузницы" (artifacts.routes.ts
   POST /forge), не заменяя её. Проверка уникальности по имени и
   логика retry — на стороне роута (POST /generate-ai), этот сервис
   только генерирует контент.
   ================================================================ */

const GROK_API_KEY = process.env.GROK_API_KEY || ""
const GROK_API_URL = "https://api.x.ai/v1/chat/completions"
const GROK_MODEL = process.env.GROK_MODEL || "grok-4-fast" /* grok-2-latest снят с производства xAI, возвращает "Model not found" */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

export const ARTIFACT_RARITIES = ["common", "rare", "epic", "legendary", "mythic"] as const
export type AiArtifactRarity = (typeof ARTIFACT_RARITIES)[number]

export type AiArtifactGeneration = {
  name: string
  description: string
  rarity: AiArtifactRarity
  power: number
  defense: number
  magic: number
  lore: string
  visual: string
  source: "grok" | "deepseek" | "fallback"
}

const NAME_POOL = ["Осколок Вечности", "Клинок Пустоты", "Сфера Резонанса", "Кристалл Забвения", "Пульс Хаоса", "Слеза Звезды", "Печать Бездны"]
const LORE_POOL = [
  "Говорят, этот артефакт был выкован в первые дни существования вселенной, задолго до того, как у времени появилось имя.",
  "Никто не помнит, откуда он взялся — лишь то, что каждый, кто им владел, менял ход истории.",
  "Легенда гласит, что артефакт хранит частицу забытого бога, всё ещё шепчущую тем, кто умеет слушать.",
  "Его создатели исчезли без следа, оставив после себя лишь это — и вопрос без ответа.",
  "Артефакт пробуждается только в руках того, кто готов заплатить цену за его силу.",
]
const VISUAL_POOL = [
  "мерцающий фиолетовый ореол вокруг граней",
  "искры голубой энергии, стекающие по поверхности",
  "пульсирующее золотое свечение изнутри",
  "тёмная дымка, усыпанная микроскопическими звёздами",
  "изумрудные волны света, расходящиеся при движении",
]

function buildArtifactPrompt(hint?: string): string {
  return `Ты — генератор уникальных цифровых артефактов для игровой платформы OSGARD.
${hint ? `Пользователь предлагает тему: "${hint}".` : "Тема свободная — придумай что-то оригинальное."}
Верни СТРОГО валидный JSON (без markdown, без пояснений) со структурой:
{
  "name": "уникальное звучное название артефакта на русском",
  "description": "краткое описание артефакта, 1 предложение",
  "rarity": "один из: common, rare, epic, legendary, mythic",
  "power": число от 10 до 40,
  "defense": число от 10 до 40,
  "magic": число от 10 до 40,
  "lore": "короткая лор-предыстория артефакта, 2-3 предложения",
  "visual": "краткое описание визуального эффекта артефакта"
}
Ответь только JSON.`
}

function clampStat(n: any): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 10 + Math.floor(Math.random() * 31)
  return Math.min(40, Math.max(10, v))
}

function isValidRarity(r: any): r is AiArtifactRarity {
  return ARTIFACT_RARITIES.includes(r)
}

function parseArtifactGeneration(text: string, source: AiArtifactGeneration["source"]): AiArtifactGeneration | null {
  const parsed = extractJson(text)
  if (!parsed) return null

  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null
  const description = typeof parsed.description === "string" && parsed.description.trim() ? parsed.description.trim() : null
  const lore = typeof parsed.lore === "string" && parsed.lore.trim() ? parsed.lore.trim() : null
  const visual = typeof parsed.visual === "string" && parsed.visual.trim() ? parsed.visual.trim() : null
  if (!name || !description || !lore || !visual) return null

  const rarity: AiArtifactRarity = isValidRarity(parsed.rarity) ? parsed.rarity : "common"

  return {
    name,
    description,
    rarity,
    power: clampStat(parsed.power),
    defense: clampStat(parsed.defense),
    magic: clampStat(parsed.magic),
    lore,
    visual,
    source,
  }
}

async function callGrok(hint?: string): Promise<AiArtifactGeneration | null> {
  return callOpenAiCompatible(
    GROK_API_URL, GROK_API_KEY, GROK_MODEL,
    buildArtifactPrompt(hint), (text) => parseArtifactGeneration(text, "grok"), "grok-artifact",
  )
}

async function callDeepSeek(hint?: string): Promise<AiArtifactGeneration | null> {
  return callOpenAiCompatible(
    DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL,
    buildArtifactPrompt(hint), (text) => parseArtifactGeneration(text, "deepseek"), "deepseek-artifact",
  )
}

/** Локальный fallback-генератор — работает без внешнего API, без сети, без ключей. */
function localFallbackArtifact(hint?: string): AiArtifactGeneration {
  const seed = hashString((hint || "") + Date.now().toString())
  const rarity = ARTIFACT_RARITIES[seed % ARTIFACT_RARITIES.length]
  return {
    name: NAME_POOL[seed % NAME_POOL.length],
    description: hint
      ? `Автоматически сгенерированный артефакт в теме «${hint}».`
      : "Автоматически сгенерированный артефакт.",
    rarity,
    power: 10 + (seed % 31),
    defense: 10 + ((seed >> 3) % 31),
    magic: 10 + ((seed >> 6) % 31),
    lore: LORE_POOL[seed % LORE_POOL.length],
    visual: VISUAL_POOL[seed % VISUAL_POOL.length],
    source: "fallback",
  }
}

const ARTIFACT_PROVIDER_CHAIN = [callGrok, callDeepSeek]

/**
 * Основная точка входа: пробует провайдеров по очереди (Grok → DeepSeek),
 * при отсутствии ключа или ошибке переходит к следующему. Если оба отказали —
 * откатывается на локальный fallback.
 */
export async function generateAiArtifactContent(hint?: string): Promise<AiArtifactGeneration> {
  for (const provider of ARTIFACT_PROVIDER_CHAIN) {
    const result = await provider(hint)
    if (result) return result
  }
  return localFallbackArtifact(hint)
}

/** Детерминированный хэш названия+времени для отслеживания уникальности артефакта. */
export function computeUniqueHash(name: string, timestamp: number): string {
  return hashString(`${name}::${timestamp}`).toString(36)
}

/** true, если хотя бы один реальный AI-провайдер сконфигурирован (иначе всегда используется fallback). */
export function isArtifactAiConfigured(): boolean {
  return !!(GROK_API_KEY || DEEPSEEK_API_KEY)
}
