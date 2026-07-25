import db from "./db"
import { getForgeBonusForUser } from "./forge-loadout"
import { createActivityEvent } from "./activity"
import { createNotification } from "./notifications"

/* ================================================================
   OSGARD · «Мастерство Архитектора» — прогрессия самого пользователя
   ----------------------------------------------------------------
   До сих пор уровни были только у артефактов; у пользователя не было
   собственной статусной лестницы. Здесь — единый источник правды по
   тирам и начислению XP. XP растёт за РЕАЛЬНЫЕ действия (генерация
   проекта, ковка, продажа) точечными вызовами addArchitectXp() рядом
   с существующими обработчиками — не переписывая их.

   Это НЕ ежедневный стрик (тот уже живёт в проде — daily-login-стрик,
   награда кредитами). Мастерство ортогонально: долгосрочная лестница
   престижа, награда — редкий артефакт-дар на КАЖДОМ новом тире, а не
   ежедневный забор. Так две петли не дублируют друг друга.

   Полностью guarded: если колонки architect_xp/architect_tier ещё не
   мигрированы (старый снапшот БД) — все функции деградируют в no-op /
   нулевое состояние и никогда не бросают. Аддитивно и prod-safe.
   ================================================================ */

export type ArchitectTier = {
  /** Машинный ключ (для i18n на фронте). */
  key: string
  /** Русское имя тира (fallback-подпись). */
  name: string
  /** Минимальный накопленный XP для входа в тир. */
  minXp: number
}

/** Лестница мастерства: Подмастерье → Кузнец → Архитектор → Магистр → Легенда. */
export const ARCHITECT_TIERS: ArchitectTier[] = [
  { key: "apprentice", name: "Подмастерье", minXp: 0 },
  { key: "smith", name: "Кузнец", minXp: 500 },
  { key: "architect", name: "Архитектор", minXp: 2000 },
  { key: "magister", name: "Магистр", minXp: 6000 },
  { key: "legend", name: "Легенда", minXp: 15000 },
]

/** Сколько XP дают ключевые действия (единый прайс-лист, чтобы не разбегался по обработчикам). */
export const ARCHITECT_XP = {
  project_generated: 50,
  artifact_forged: 15,
  artifact_sold: 25,
} as const

export type ArchitectXpReason = keyof typeof ARCHITECT_XP

/** Индекс достигнутого тира для данного XP (наибольший тир, чей порог ≤ xp). */
export function tierIndexForXp(xp: number): number {
  let idx = 0
  for (let i = 0; i < ARCHITECT_TIERS.length; i++) {
    if (xp >= ARCHITECT_TIERS[i].minXp) idx = i
  }
  return idx
}

export type ArchitectState = {
  xp: number
  tierIndex: number
  tierKey: string
  tierName: string
  /** Следующий тир или null, если достигнут максимум. */
  nextTierKey: string | null
  nextTierName: string | null
  /** XP, набранный внутри текущего тира. */
  xpIntoTier: number
  /** Сколько XP всего между текущим и следующим тиром (null на максимуме). */
  xpForNextTier: number | null
  /** Прогресс к следующему тиру [0..1] (1 на максимуме). */
  progress: number
}

/** Собирает производное состояние прогрессии из чистого числа XP. */
export function architectStateFromXp(xp: number): ArchitectState {
  const safeXp = Math.max(0, Math.floor(xp || 0))
  const tierIndex = tierIndexForXp(safeXp)
  const tier = ARCHITECT_TIERS[tierIndex]
  const next = ARCHITECT_TIERS[tierIndex + 1] ?? null

  const xpIntoTier = safeXp - tier.minXp
  const xpForNextTier = next ? next.minXp - tier.minXp : null
  const progress = next ? Math.min(1, xpIntoTier / Math.max(1, next.minXp - tier.minXp)) : 1

  return {
    xp: safeXp,
    tierIndex,
    tierKey: tier.key,
    tierName: tier.name,
    nextTierKey: next?.key ?? null,
    nextTierName: next?.name ?? null,
    xpIntoTier,
    xpForNextTier,
    progress,
  }
}

/** Читает состояние прогрессии пользователя из БД. Никогда не бросает. */
export function getArchitectState(userId: number): ArchitectState {
  try {
    const row = db.prepare(`SELECT architect_xp as xp FROM users WHERE id = ?`).get(userId) as
      | { xp: number | null }
      | undefined
    return architectStateFromXp(row?.xp ?? 0)
  } catch {
    // Колонка ещё не мигрирована → нулевое состояние.
    return architectStateFromXp(0)
  }
}

/* ---- Награда за тир-ап: артефакт-дар через существующую экономику лута ---- */

const RARITY_LADDER = ["common", "rare", "epic", "legendary", "mythic"] as const
type Rarity = (typeof RARITY_LADDER)[number]
const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 }
const LIST_CURRENCY_BY_RARITY: Record<Rarity, string> = {
  common: "credits",
  rare: "shards",
  epic: "shards",
  legendary: "crystals",
  mythic: "timecoin",
}

export type MasteryArtifact = {
  id: number
  name: string
  type: string
  rarity: Rarity
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  price: number
  listCurrency: string
}

/**
 * Выдаёт артефакт-дар за достижение нового тира. Редкость гарантированно
 * растёт с тиром (тир 1 → rare, 2 → epic, 3 → legendary, 4 → mythic),
 * плюс шанс апа от forge-бонуса. Переиспользует тот же путь вставки в
 * `artifacts`, что insertStarterArtifacts/forge — не изобретаем новый лут.
 * project_id = NULL (дар не привязан к проекту; колонка nullable).
 * Guarded/best-effort: при любой ошибке возвращает null, не бросает.
 */
function grantTierUpReward(userId: number, newTierIndex: number): MasteryArtifact | null {
  try {
    const bonus = getForgeBonusForUser(userId)
    const roll = () => 12 + Math.floor(Math.random() * 32)
    const power = roll() + bonus.statBonus
    const defense = roll() + bonus.statBonus
    const magic = roll() + bonus.statBonus
    const speed = roll() + bonus.statBonus

    // Пол редкости = индекс тира (1..4), с шансом апа на одну ступень от forge-бонуса.
    const floorIndex = Math.min(Math.max(newTierIndex, 1), RARITY_LADDER.length - 1)
    let rarityIndex = floorIndex
    if (Math.random() < bonus.rarityUpChance && rarityIndex < RARITY_LADDER.length - 1) {
      rarityIndex += 1
    }
    const rarity = RARITY_LADDER[rarityIndex]

    const statSum = power + defense + magic + speed
    const price = Math.round(statSum * 6 * RARITY_MULT[rarity])

    const tier = ARCHITECT_TIERS[newTierIndex]
    const name = `Регалия «${tier?.name ?? "Мастер"}»`
    const info = db
      .prepare(
        `INSERT INTO artifacts (owner_id, project_id, name, type, rarity, level, power, defense, magic, speed, status, views_24h, supply, price, list_currency)
         VALUES (?, NULL, ?, 'mastery', ?, 1, ?, ?, ?, ?, 'kept', 0, 1, ?, ?)`,
      )
      .run(userId, name, rarity, power, defense, magic, speed, price, LIST_CURRENCY_BY_RARITY[rarity])

    return {
      id: Number(info.lastInsertRowid),
      name,
      type: "mastery",
      rarity,
      level: 1,
      power,
      defense,
      magic,
      speed,
      price,
      listCurrency: LIST_CURRENCY_BY_RARITY[rarity],
    }
  } catch {
    return null
  }
}

export type ArchitectXpResult = ArchitectState & {
  /** Сколько XP реально начислено. */
  gained: number
  /** Поднялся ли тир этим начислением. */
  tierUp: boolean
  /** Артефакт-дар, выданный за новый тир (null, если тир не рос или выдача не удалась). */
  rewardArtifact: MasteryArtifact | null
}

/**
 * Начисляет XP пользователю и пересчитывает тир. Аддитивно: пишет только
 * в новые колонки, ничего в существующей логике не меняет. На тир-апе
 * выдаёт артефакт-дар, пишет событие в ленту и уведомление. При отсутствии
 * колонок — тихий no-op (gained=0). Никогда не бросает — вызов безопасно
 * ставить рядом с createActivityEvent в любом обработчике.
 */
export function addArchitectXp(userId: number, reason: ArchitectXpReason, amountOverride?: number): ArchitectXpResult {
  const amount = Math.max(0, Math.floor(amountOverride ?? ARCHITECT_XP[reason] ?? 0))
  try {
    const before = getArchitectState(userId)
    if (amount <= 0) return { ...before, gained: 0, tierUp: false, rewardArtifact: null }

    const nextXp = before.xp + amount
    const after = architectStateFromXp(nextXp)

    db.prepare(`UPDATE users SET architect_xp = ?, architect_tier = ? WHERE id = ?`).run(
      after.xp,
      after.tierIndex,
      userId,
    )

    const tierUp = after.tierIndex > before.tierIndex
    let rewardArtifact: MasteryArtifact | null = null

    if (tierUp) {
      rewardArtifact = grantTierUpReward(userId, after.tierIndex)
      // Побочные эффекты best-effort — не влияют на начисление XP.
      try {
        createActivityEvent({
          userId,
          type: "architect_tierup",
          entityType: rewardArtifact ? "artifact" : "user",
          entityId: rewardArtifact?.id ?? userId,
          text: `достиг тира «${after.tierName}» 🏛️`,
          metadata: { tier: after.tierKey, tierIndex: after.tierIndex },
        })
      } catch {
        /* лента недоступна — прогрессия важнее */
      }
      try {
        createNotification({
          userId,
          type: "architect",
          entityType: rewardArtifact ? "artifact" : "user",
          entityId: rewardArtifact?.id ?? userId,
          text: `Новый тир мастерства: «${after.tierName}». Кузница вручает вам регалию.`,
        })
      } catch {
        /* уведомления недоступны — прогрессия важнее */
      }
    }

    return { ...after, gained: amount, tierUp, rewardArtifact }
  } catch {
    return { ...architectStateFromXp(0), gained: 0, tierUp: false, rewardArtifact: null }
  }
}
