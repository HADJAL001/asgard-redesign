import dotenv from "dotenv"
import { callOpenAiCompatible, extractJson } from "./ai-generator"

dotenv.config()

/* ================================================================
   OSGARD · Digital Twin Service
   ----------------------------------------------------------------
   Логика "обучения" цифрового близнеца на артефактах пользователя
   и генерации новых артефактов в его стиле.

   Статы/тип/редкость генерируются детерминированно (на основе
   style_vector) — это сохраняет экономический паритет и не требует
   AI. Описание артефакта дополнительно обогащается через DeepSeek —
   основной AI-провайдер для ИИ-близнеца; если ключ не задан или
   запрос упал, используется детерминированное локальное описание.
   ================================================================ */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

export type StyleVector = {
  /** Средние показатели характеристик артефактов пользователя. */
  avgPower: number
  avgDefense: number
  avgMagic: number
  avgSpeed: number
  /** Частоты типов и редкостей — какие артефакты пользователь создаёт чаще всего. */
  typeCounts: Record<string, number>
  rarityCounts: Record<string, number>
}

export type TwinArtifactDraft = {
  name: string
  type: string
  rarity: string
  power: number
  defense: number
  magic: number
  speed: number
  styleTag: string
  description: string
  source: "deepseek" | "local"
}

const TYPE_POOL = ["neural", "crystal", "weapon", "shield", "artifact"]
const RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"]

const STYLE_TAGS_BY_TYPE: Record<string, string[]> = {
  neural: ["киберпанк", "нейросеть", "техно-минимализм"],
  crystal: ["кристальный", "магический", "эфемерный"],
  weapon: ["боевой", "агрессивный", "клинковый"],
  shield: ["защитный", "монолитный", "бастион"],
  artifact: ["мистический", "древний", "легендарный"],
}

const NAME_PREFIXES = ["Эхо", "Тень", "Искра", "Осколок", "Пульс", "Грань", "Отражение", "Резонанс"]

/** Простой детерминированный хэш строки → число. */
function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Пустой стартовый style_vector для нового близнеца. */
export function emptyStyleVector(): StyleVector {
  return {
    avgPower: 0,
    avgDefense: 0,
    avgMagic: 0,
    avgSpeed: 0,
    typeCounts: {},
    rarityCounts: {},
  }
}

/**
 * Обновляет style_vector близнеца новым обучающим артефактом (инкрементальное
 * скользящее среднее по характеристикам + счётчики типов/редкостей).
 */
export function updateStyleVector(
  current: StyleVector,
  sample: { power: number; defense: number; magic: number; speed: number; type: string; rarity: string },
  sampleCountBefore: number,
): StyleVector {
  const n = sampleCountBefore
  const nextN = n + 1

  const avg = (prev: number, val: number) => (prev * n + val) / nextN

  const typeCounts = { ...current.typeCounts }
  typeCounts[sample.type] = (typeCounts[sample.type] || 0) + 1

  const rarityCounts = { ...current.rarityCounts }
  rarityCounts[sample.rarity] = (rarityCounts[sample.rarity] || 0) + 1

  return {
    avgPower: avg(current.avgPower, sample.power),
    avgDefense: avg(current.avgDefense, sample.defense),
    avgMagic: avg(current.avgMagic, sample.magic),
    avgSpeed: avg(current.avgSpeed, sample.speed),
    typeCounts,
    rarityCounts,
  }
}

/** Извлекает доминирующий ключ из карты счётчиков (или fallback, если пусто). */
function dominantKey(counts: Record<string, number>, fallback: string): string {
  let best = fallback
  let bestCount = -1
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) {
      best = k
      bestCount = v
    }
  }
  return best
}

/** Сколько XP даёт один обучающий артефакт (влияет на level близнеца). */
export function xpForSample(rarity: string): number {
  const idx = RARITY_ORDER.indexOf(rarity)
  return 10 + Math.max(0, idx) * 8
}

/** Вычисляет уровень близнеца по накопленному XP (прогрессия: 100 XP на уровень, с ростом). */
export function levelForXp(xp: number): number {
  let level = 1
  let need = 100
  let remaining = xp
  while (remaining >= need) {
    remaining -= need
    level += 1
    need = Math.round(need * 1.25)
  }
  return level
}

/** Генерирует список style-тегов на основе доминирующих типов/редкостей. */
export function styleTagsFromVector(vector: StyleVector): string[] {
  const tags = new Set<string>()
  const topType = dominantKey(vector.typeCounts, "artifact")
  const topRarity = dominantKey(vector.rarityCounts, "common")

  for (const tag of STYLE_TAGS_BY_TYPE[topType] || []) tags.add(tag)

  if (topRarity === "legendary" || topRarity === "mythic") tags.add("возвышенный")
  if (vector.avgPower > vector.avgDefense && vector.avgPower > vector.avgMagic) tags.add("силовой")
  if (vector.avgMagic > vector.avgPower && vector.avgMagic > vector.avgDefense) tags.add("магический")
  if (vector.avgSpeed > vector.avgPower && vector.avgSpeed > vector.avgDefense) tags.add("стремительный")

  return Array.from(tags).slice(0, 5)
}

/**
 * Генерирует новый артефакт "в стиле" близнеца — на основе style_vector и
 * уровня близнеца (чем выше уровень, тем выше шанс редкости и статы).
 * prompt — необязательный текст запроса пользователя (например, из Джарвиса).
 */
export function generateTwinArtifact(
  vector: StyleVector,
  level: number,
  prompt?: string,
): TwinArtifactDraft {
  const seed = hashString(JSON.stringify(vector) + (prompt || "") + Date.now())

  const topType = dominantKey(vector.typeCounts, "artifact")
  // с небольшой вероятностью берём случайный тип, чтобы был разброс
  const type = seed % 5 === 0 ? TYPE_POOL[seed % TYPE_POOL.length] : topType

  // шанс повышенной редкости растёт с уровнем близнеца
  const rarityBoost = Math.min(4, Math.floor(level / 5))
  const roll = seed % 100
  let rarityIdx = 0
  if (roll < 3 + rarityBoost * 3) rarityIdx = Math.min(4, 3 + Math.floor(rarityBoost / 2))
  else if (roll < 15 + rarityBoost * 5) rarityIdx = Math.min(4, 2)
  else if (roll < 40 + rarityBoost * 5) rarityIdx = 1
  const rarity = RARITY_ORDER[Math.max(0, Math.min(4, rarityIdx))]

  const statBase = 10 + level * 2
  const jitter = (offset: number) => statBase + ((seed + offset) % 20)

  const power = Math.round((vector.avgPower || statBase) * 0.5 + jitter(1) * 0.5)
  const defense = Math.round((vector.avgDefense || statBase) * 0.5 + jitter(2) * 0.5)
  const magic = Math.round((vector.avgMagic || statBase) * 0.5 + jitter(3) * 0.5)
  const speed = Math.round((vector.avgSpeed || statBase) * 0.5 + jitter(4) * 0.5)

  const tags = styleTagsFromVector(vector)
  const styleTag = tags[seed % Math.max(1, tags.length)] || "уникальный"

  const prefix = NAME_PREFIXES[seed % NAME_PREFIXES.length]
  const suffixPool = STYLE_TAGS_BY_TYPE[type] || ["артефакт"]
  const suffix = suffixPool[(seed >> 3) % suffixPool.length]
  const name = prompt && prompt.trim()
    ? `${prefix} · ${prompt.trim().slice(0, 24)}`
    : `${prefix} ${suffix}`

  const description = `Артефакт в стиле «${styleTag}», рождённый из накопленного опыта близнеца.` +
    (prompt && prompt.trim() ? ` Вдохновлён запросом: «${prompt.trim()}».` : "")

  return {
    name,
    type,
    rarity,
    power: Math.max(1, power),
    defense: Math.max(1, defense),
    magic: Math.max(1, magic),
    speed: Math.max(1, speed),
    styleTag,
    description,
    source: "local",
  }
}

function buildTwinDescriptionPrompt(draft: TwinArtifactDraft, prompt?: string): string {
  return `Ты — генератор описаний для цифрового артефакта, созданного ИИ-близнецом пользователя на платформе OSGARD.
Артефакт уже имеет название "${draft.name}", тип "${draft.type}", редкость "${draft.rarity}", стиль "${draft.styleTag}"${prompt ? `, и создан по запросу пользователя: "${prompt}"` : ""}.
Верни СТРОГО валидный JSON (без markdown, без пояснений) со структурой:
{ "description": "яркое описание артефакта на русском языке, 1-2 предложения" }
Ответь только JSON.`
}

function parseTwinDescription(text: string): { description: string } | null {
  const parsed = extractJson(text)
  if (!parsed) return null
  const description = typeof parsed.description === "string" ? parsed.description.trim() : null
  if (!description) return null
  return { description }
}

async function callDeepSeekForTwin(draft: TwinArtifactDraft, prompt?: string): Promise<{ description: string } | null> {
  return callOpenAiCompatible(
    DEEPSEEK_API_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL,
    buildTwinDescriptionPrompt(draft, prompt), parseTwinDescription, "twin-deepseek",
  )
}

/**
 * Генерирует артефакт в стиле близнеца (детерминированно, как `generateTwinArtifact`)
 * и пытается обогатить его описание через DeepSeek — основной AI-провайдер для
 * ИИ-близнеца. Если ключ не задан или запрос упал, остаётся локальное описание.
 */
export async function generateTwinArtifactWithAi(
  vector: StyleVector,
  level: number,
  prompt?: string,
): Promise<TwinArtifactDraft> {
  const draft = generateTwinArtifact(vector, level, prompt)
  const enriched = await callDeepSeekForTwin(draft, prompt)
  if (enriched) {
    return { ...draft, description: enriched.description, source: "deepseek" }
  }
  return draft
}

/** Рекомендованная цена аренды близнеца в TimeCoin/сутки на основе уровня. */
export function suggestedRentalPrice(level: number): number {
  return Math.round((5 + level * 1.5) * 10) / 10
}
