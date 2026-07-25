/* ================================================================
   OSGARD · Proof-of-Craft — статы артефакта из реального труда
   ----------------------------------------------------------------
   Заменяет чистый ГСЧ в Кузнице детерминированной функцией реальной
   субстанции проекта. Три честных сигнала, каждый — реальная ветка в
   коде генерации, а не косметика:

     • depth   — глубина генерации (projects.generation_depth):
                 quick (шаблон) < standard (полный AI) < deep (свежий AI).
                 Прямая мера вложенного усилия/токенов.
     • files   — число файлов проекта (COUNT project_files). Реальный
                 объём созданного, а не флейвор-текст.
     • aiReal  — настоящая AI-генерация (ai_source задан И template_id
                 пуст), а не переиспользованный шаблон.

   Из них считается craftScore ∈ [0..1] — «честность» артефакта. Дальше
   craftScore детерминированно задаёт СИЛУ статов (сумму), а стабильный
   хеш проекта — их ПРОФИЛЬ (распределение по power/defense/magic/speed),
   чтобы у каждого проекта был воспроизводимый «характер», а не каша.

   Свойства дизайна:
   • Детерминизм: одинаковый проект → одинаковый артефакт. Ковка
     воспроизводима, фарм рулеткой невозможен (нечего перекручивать).
   • Grandfather: старые артефакты не пересчитываются (craft_score=NULL).
   • Совместимость с валютной экономикой: statMult валюты сохраняется
     как множитель поверх Proof-of-Craft (слабее монета → слабее артефакт).
   • Ковка без проекта возможна, но craftScore низкий (базовый пол) —
     мягкий стимул ковать ИЗ проекта, без обнуления UX.

   Чистый модуль, без БД. Маршрут сам собирает сигналы и пишет результат.
   ================================================================ */

export type GenerationDepth = "quick" | "standard" | "deep"

/** Сырьё для расчёта: реальные метрики проекта, из которого куётся артефакт. */
export interface CraftSignals {
  /** projects.generation_depth. undefined → трактуется как самый дешёвый путь. */
  depth?: GenerationDepth | null
  /** COUNT(*) project_files для проекта. */
  fileCount?: number | null
  /** projects.ai_source — была ли реальная AI-генерация. */
  aiSource?: string | null
  /** projects.template_id — если задан, проект опёрт на шаблон (слабее сигнал). */
  templateId?: number | null
  /** Ковка вообще без привязки к проекту. */
  hasProject: boolean
}

export interface CraftedStats {
  power: number
  defense: number
  magic: number
  speed: number
  rarity: string
  /** craftScore ∈ [0..1], пишется в artifacts.craft_score. */
  craftScore: number
}

/* --- Веса сигналов (в сумме = 1). Глубина усилия важнее всего, затем
   реальный объём, затем факт настоящей AI-генерации. --- */
const W_DEPTH = 0.45
const W_FILES = 0.35
const W_AI = 0.2

const DEPTH_SCORE: Record<GenerationDepth, number> = { quick: 0.25, standard: 0.65, deep: 1 }

/** Насыщение по числу файлов: 0 → 0, ~FILES_SATURATION файлов → 1 (дальше плато). */
const FILES_SATURATION = 24

/** Ковка без проекта: жёсткий потолок честности (нельзя доказать труд). */
const NO_PROJECT_CRAFT_CAP = 0.15

/** Диапазон суммы 4 статов, интерполируемый по craftScore. */
const STAT_SUM_MIN = 60 /* craftScore=0 → слабый артефакт */
const STAT_SUM_MAX = 200 /* craftScore=1 → топовая ковка (до множителя валюты) */

/* Пороги редкости по craftScore. Ковка максимум до epic — legendary/mythic
   остаются наградой за evolve/fusion (не раздаём на входе). */
const RARITY_THRESHOLDS: Array<{ min: number; rarity: string }> = [
  { min: 0.85, rarity: "epic" },
  { min: 0.6, rarity: "rare" },
  { min: 0, rarity: "common" },
]

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Считает craftScore ∈ [0..1] из реальных сигналов проекта.
 * Чистая, детерминированная — одни и те же сигналы дают один результат.
 */
export function computeCraftScore(signals: CraftSignals): number {
  if (!signals.hasProject) return NO_PROJECT_CRAFT_CAP

  const depth = signals.depth && DEPTH_SCORE[signals.depth] !== undefined ? DEPTH_SCORE[signals.depth] : DEPTH_SCORE.quick
  const files = clamp01((signals.fileCount ?? 0) / FILES_SATURATION)
  // Настоящая AI-генерация: ai_source задан И это не шаблонный проект.
  const aiReal = signals.aiSource && !signals.templateId ? 1 : 0

  return clamp01(W_DEPTH * depth + W_FILES * files + W_AI * aiReal)
}

/** Стабильный 32-битный хеш строки (FNV-1a). Даёт воспроизводимый «характер» проекта. */
function stableHash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function rarityFor(craftScore: number): string {
  for (const t of RARITY_THRESHOLDS) if (craftScore >= t.min) return t.rarity
  return "common"
}

/**
 * Выводит статы артефакта из craftScore (сила) и seed (профиль распределения).
 * @param craftScore ∈ [0..1] — из computeCraftScore.
 * @param statMult   множитель силы валюты ковки (совместимость с текущей экономикой).
 * @param seed       стабильный ключ проекта (напр. `${projectId}:${name}`) — задаёт «характер».
 */
export function deriveCraftedStats(craftScore: number, statMult: number, seed: string): CraftedStats {
  const cs = clamp01(craftScore)
  const targetSum = (STAT_SUM_MIN + (STAT_SUM_MAX - STAT_SUM_MIN) * cs) * statMult

  // Профиль: 4 детерминированных веса из хеша seed (разные для каждого стата),
  // нормируем — сумма распределяется по характеру проекта, а не поровну.
  const h = stableHash(seed)
  const raw = [
    ((h >>> 0) & 0xff) + 32,
    ((h >>> 8) & 0xff) + 32,
    ((h >>> 16) & 0xff) + 32,
    ((h >>> 24) & 0xff) + 32,
  ]
  const rawSum = raw[0] + raw[1] + raw[2] + raw[3]

  const stat = (i: number) => Math.max(1, Math.round((raw[i] / rawSum) * targetSum))

  return {
    power: stat(0),
    defense: stat(1),
    magic: stat(2),
    speed: stat(3),
    rarity: rarityFor(cs),
    craftScore: cs,
  }
}
