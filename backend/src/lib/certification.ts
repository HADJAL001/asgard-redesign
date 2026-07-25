import db from "./db"
import { getArchitectState, ARCHITECT_TIERS } from "./architect-progression"

/* ================================================================
   OSGARD · Academy — «Экзамен делом» (движок готовности к сертификации)
   ----------------------------------------------------------------
   Право на credential «OSGARD Certified Vibecoder» НЕ покупается и НЕ
   зазубривается через quiz. Оно ВЫЧИСЛЯЕТСЯ из уже существующих
   реальных достижений пользователя на платформе:

     1. Тир «Архитектора»          (architect_xp/architect_tier, 079)
     2. Задеплоенные проекты        (projects.deploy_status='deployed', live_url)
     3. Пиковый craft_score         (artifacts.craft_score, 081; 0..1)
     4. Авторские артефакты          (artifacts.creator_id, 080)

   Ни одной новой таблицы, ни одной записи: чистое ЧТЕНИЕ поверх того,
   что уже накоплено платформой. «Отгрузить нельзя сфармить» — критерии
   отражают реальную работу, а не факт оплаты.

   Полностью guarded: каждый сигнал в своём try/catch. Если колонка ещё
   не мигрирована (старый снапшот БД) — критерий честно деградирует в
   current=0, met=false, а не роняет эндпоинт. Аддитивно и prod-safe:
   у нового пользователя все критерии met=false, eligible=false.

   Пороги — конфиг (env с дефолтами), не хардкод в логике сравнения,
   чтобы «команда мечты» могла калибровать планку без правки кода.
   ================================================================ */

/** Индекс тира «Архитектор» — цель по прогрессии (Подмастерье=0 … Легенда=4). */
const ARCHITECT_TARGET_INDEX = (() => {
  const raw = Number(process.env.ACADEMY_CERT_MIN_TIER_INDEX)
  if (Number.isFinite(raw) && raw >= 0 && raw < ARCHITECT_TIERS.length) return Math.floor(raw)
  return 2 // «Архитектор» по умолчанию
})()

/** Пороги остальных критериев (env-override, иначе разумные дефолты). */
function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}
function envFloat(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : fallback
}

const TARGET_DEPLOYS = envInt("ACADEMY_CERT_MIN_DEPLOYS", 3)
const TARGET_CRAFT = envFloat("ACADEMY_CERT_MIN_CRAFT", 0.7)
const TARGET_AUTHORED = envInt("ACADEMY_CERT_MIN_AUTHORED", 10)

export type CriterionKey =
  | "architect_tier"
  | "deployed_projects"
  | "peak_craft_score"
  | "authored_artifacts"

export type EligibilityCriterion = {
  /** Машинный ключ (для i18n на фронте). */
  key: CriterionKey
  /** Русская подпись-fallback. */
  label: string
  /** Текущее значение сигнала. */
  current: number
  /** Целевой порог. */
  target: number
  /** Единица измерения для фронта: счётчик / индекс тира / доля 0..1. */
  unit: "count" | "tier" | "ratio"
  /** Достигнут ли критерий. */
  met: boolean
}

export type EligibilityResult = {
  /** Готов ли пользователь к выдаче credential (все критерии met). */
  eligible: boolean
  /** Сколько критериев уже выполнено (для краткой сводки на фронте). */
  metCount: number
  /** Всего критериев. */
  totalCount: number
  criteria: EligibilityCriterion[]
}

/** Число задеплоенных проектов пользователя (терминальный успех деплоя). */
function countDeployedProjects(userId: number): number {
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND deploy_status = 'deployed'`,
      )
      .get(userId) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

/** Пиковый craft_score (0..1) среди артефактов, выкованных пользователем. */
function peakCraftScore(userId: number): number {
  try {
    const row = db
      .prepare(
        `SELECT MAX(craft_score) AS peak FROM artifacts
         WHERE creator_id = ? AND craft_score IS NOT NULL`,
      )
      .get(userId) as { peak: number | null } | undefined
    const peak = row?.peak ?? 0
    return peak > 0 ? peak : 0
  } catch {
    return 0
  }
}

/** Число артефактов, автором (первым кузнецом) которых является пользователь. */
function countAuthoredArtifacts(userId: number): number {
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM artifacts WHERE creator_id = ?`)
      .get(userId) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

/** Индекс достигнутого тира «Архитектора» (guarded внутри getArchitectState). */
function architectTierIndex(userId: number): number {
  try {
    return getArchitectState(userId).tierIndex
  } catch {
    return 0
  }
}

/**
 * Вычисляет готовность пользователя к сертификации из РЕАЛЬНЫХ сигналов.
 * Только чтение существующих таблиц; никогда не бросает.
 */
export function computeEligibility(userId: number): EligibilityResult {
  const tierIdx = architectTierIndex(userId)
  const deploys = countDeployedProjects(userId)
  const craft = peakCraftScore(userId)
  const authored = countAuthoredArtifacts(userId)

  const criteria: EligibilityCriterion[] = [
    {
      key: "architect_tier",
      label: `Достичь тира «${ARCHITECT_TIERS[ARCHITECT_TARGET_INDEX]?.name ?? "Архитектор"}»`,
      current: tierIdx,
      target: ARCHITECT_TARGET_INDEX,
      unit: "tier",
      met: tierIdx >= ARCHITECT_TARGET_INDEX,
    },
    {
      key: "deployed_projects",
      label: "Задеплоить проекты",
      current: deploys,
      target: TARGET_DEPLOYS,
      unit: "count",
      met: deploys >= TARGET_DEPLOYS,
    },
    {
      key: "peak_craft_score",
      label: "Достичь мастерства ковки (craft-score)",
      current: Math.round(craft * 100) / 100,
      target: TARGET_CRAFT,
      unit: "ratio",
      met: craft >= TARGET_CRAFT,
    },
    {
      key: "authored_artifacts",
      label: "Выковать авторские артефакты",
      current: authored,
      target: TARGET_AUTHORED,
      unit: "count",
      met: authored >= TARGET_AUTHORED,
    },
  ]

  const metCount = criteria.reduce((n, c) => n + (c.met ? 1 : 0), 0)

  return {
    eligible: metCount === criteria.length,
    metCount,
    totalCount: criteria.length,
    criteria,
  }
}
