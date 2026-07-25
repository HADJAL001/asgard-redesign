/* ================================================================
   OSGARD · Artifact Identity — «артефакт-как-зеркало-приложения»
   ----------------------------------------------------------------
   Proof-of-Craft связал СИЛУ артефакта с реальным трудом. Но артефакт
   всё ещё был дженериком по смыслу: число + родословная, без лица.
   Этот модуль даёт артефакту ИДЕНТИЧНОСТЬ, выведенную из конкретного
   приложения, из которого он выкован:

     • archetype  — «класс» из типа проекта (neural → Нейрокристалл,
                    game → Игровой Идол, api → Сервер-Сердце …).
     • material   — субстанция из редкости (обсидиан … первичный эфир).
     • palette    — детерминированная пара цветов из стабильного хеша
                    проекта (у каждого проекта — свой воспроизводимый вид).
     • essence    — одно слово-настроение (из хеша).
     • originMyth — короткий «миф происхождения»: честный нарратив,
                    собранный из РЕАЛЬНЫХ сигналов ковки (глубина, объём,
                    настоящая AI, честность). Не выдумка — пересказ факта.

   Тот же принцип, что у Proof-of-Craft: всё ДЕТЕРМИНИРОВАНО и воспроизводимо
   (одинаковый проект → одинаковое лицо), никакого ГСЧ. Чистый модуль без БД:
   маршрут сам собирает сигналы, вызывает derive и персистит результат.
   Идентичность — это ПРЕЗЕНТАЦИЯ (в отличие от статов — заработанной
   ценности), поэтому её можно честно вывести и для legacy-артефактов на
   лету из того, что о них известно (тип/редкость/имя), без backfill.
   ================================================================ */

import type { GenerationDepth } from "./proof-of-craft"

export interface IdentitySignals {
  /** Тип артефакта/проекта (свободная строка: neural, web, game, api …). */
  type?: string | null
  /** Имя артефакта — входит в seed и в миф. */
  name: string
  /** Редкость — задаёт материал. */
  rarity: string
  /** craftScore ∈ [0..1] или null (legacy — выковано до Proof-of-Craft). */
  craftScore?: number | null
  /** Глубина генерации проекта (для мифа). */
  depth?: GenerationDepth | null
  /** Число файлов проекта (для мифа). */
  fileCount?: number | null
  /** Была ли настоящая AI-генерация (не шаблон). */
  aiReal?: boolean
  /** Стабильный ключ проекта, напр. `${projectId ?? "solo"}:${name}`. */
  seed: string
}

export interface ArtifactPalette {
  primary: string
  accent: string
}

export interface ArtifactIdentity {
  archetype: string
  material: string
  essence: string
  palette: ArtifactPalette
  originMyth: string
}

/** Стабильный 32-битный хеш (FNV-1a). Тот же класс, что в proof-of-craft. */
function stableHash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/* Архетип из типа: сопоставляем по ключевому слову. Каждая запись —
   [список подстрок типа, имя архетипа]. Первое совпадение выигрывает. */
const ARCHETYPE_BY_TYPE: Array<[string[], string]> = [
  [["neural", "ai", "ml", "gpt", "llm", "brain"], "Нейрокристалл"],
  [["game", "play", "arcade", "quest"], "Игровой Идол"],
  [["web", "site", "landing", "page", "portal"], "Веб-Тотем"],
  [["mobile", "app", "ios", "android"], "Карманный Голем"],
  [["api", "backend", "server", "service"], "Сервер-Сердце"],
  [["bot", "agent", "assistant", "automation"], "Дух-Автомат"],
  [["data", "db", "database", "analytics", "dashboard"], "Хранилище Памяти"],
  [["tool", "util", "cli", "kit"], "Инструмент Мастера"],
  [["shop", "store", "commerce", "market", "pay"], "Торговый Реликт"],
  [["social", "chat", "feed", "community"], "Голос Толпы"],
]

/* Резерв, если тип не распознан: выбираем из пула по хешу (детерминированно). */
const ARCHETYPE_FALLBACK = ["Артефакт-Химера", "Безымянный Осколок", "Кованый Странник", "Эхо-Конструкт"]

/* Материал из редкости. Неизвестная редкость → кованая сталь. */
const MATERIAL_BY_RARITY: Record<string, string> = {
  common: "обсидиан",
  rare: "лунное серебро",
  epic: "квантовое стекло",
  legendary: "звёздный сплав",
  mythic: "первичный эфир",
}

/* Слово-настроение — из хеша. */
const ESSENCE_POOL = ["Порядок", "Хаос", "Поток", "Воля", "Эхо", "Искра", "Тишина", "Гроза", "Ясность", "Глубина"]

function archetypeFor(type: string | null | undefined, h: number): string {
  const t = (type ?? "").toLowerCase()
  for (const [keys, name] of ARCHETYPE_BY_TYPE) {
    if (keys.some((k) => t.includes(k))) return name
  }
  return ARCHETYPE_FALLBACK[h % ARCHETYPE_FALLBACK.length]
}

function materialFor(rarity: string): string {
  return MATERIAL_BY_RARITY[(rarity ?? "").toLowerCase()] ?? "кованая сталь"
}

function hslToHex(hh: number, s: number, l: number): string {
  l /= 100
  const a = (s * Math.min(l, 1 - l)) / 100
  const f = (n: number) => {
    const k = (n + hh / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/* Палитра: hue из хеша (у каждого проекта свой), accent — комплементарный.
   Насыщенность/светлота слегка растут с честностью — «честнее ковка → ярче
   артефакт», но остаются в валидном диапазоне и для legacy (craftScore=null). */
function paletteFor(h: number, craftScore: number | null | undefined): ArtifactPalette {
  const cs = craftScore == null ? 0.5 : craftScore < 0 ? 0 : craftScore > 1 ? 1 : craftScore
  const hue = h % 360
  const sat = 55 + Math.round(cs * 30) // 55..85
  const light = 45 + Math.round(cs * 10) // 45..55
  return {
    primary: hslToHex(hue, sat, light),
    accent: hslToHex((hue + 150) % 360, Math.min(90, sat + 10), Math.min(65, light + 12)),
  }
}

const DEPTH_MYTH: Record<GenerationDepth, string> = {
  quick: "рождён быстрым наброском",
  standard: "выкован в полной AI-генерации",
  deep: "выкован в глубокой, свежей AI-генерации",
}

/**
 * Выводит идентичность артефакта из его сигналов. Чистая, детерминированная —
 * одинаковый вход даёт одинаковое лицо. Миф честен: пересказывает реальные
 * сигналы ковки, ничего не выдумывая.
 */
export function deriveArtifactIdentity(sig: IdentitySignals): ArtifactIdentity {
  const h = stableHash(sig.seed)
  const archetype = archetypeFor(sig.type, h)
  const material = materialFor(sig.rarity)
  const essence = ESSENCE_POOL[(h >>> 5) % ESSENCE_POOL.length]
  const palette = paletteFor(h, sig.craftScore)

  // Миф: «Имя» — редкость архетип из материала. Далее честный факт ковки.
  const rarityWord = (sig.rarity ?? "").toLowerCase()
  const head = `«${sig.name}» — ${rarityWord ? rarityWord + " " : ""}${archetype} из ${material}`

  let body: string
  if (sig.craftScore == null) {
    // Legacy: выковано до Proof-of-Craft — честно об этом и говорим.
    body = "выкован до эпохи Proof-of-Craft: его статы честны по старым правилам"
  } else {
    const parts: string[] = []
    if (sig.depth) parts.push(DEPTH_MYTH[sig.depth])
    const files = sig.fileCount ?? 0
    if (files > 0) parts.push(`вобрал ${files} ${files === 1 ? "файл" : "файлов"} живого кода`)
    if (sig.aiReal) parts.push("несёт подпись настоящей AI")
    const honesty = `честность ковки — ${Math.round((sig.craftScore ?? 0) * 100)}%`
    body = parts.length ? `${parts.join(", ")}; ${honesty}` : honesty
  }

  return {
    archetype,
    material,
    essence,
    palette,
    originMyth: `${head}. ${body[0].toUpperCase()}${body.slice(1)}.`,
  }
}
