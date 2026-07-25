import db from "./db"

/* ================================================================
   OSGARD · Снаряжение Кузницы (forge loadout) — 💎 ставка платформы
   ----------------------------------------------------------------
   Единый источник правды механики «надетые артефакты усиливают
   генерацию». Пользователь надевает до FORGE_MAX_SLOTS своих
   артефактов (status='kept'); их совокупная сила даёт ОГРАНИЧЕННЫЙ
   бонус, реально применяемый к артефактам, которые рождаются со
   следующим проектом (insertStarterArtifacts):

     - statBonus       — плоская добавка к каждому стату новорождённого
                         артефакта (power/defense/magic/speed).
     - rarityUpChance  — вероятность [0..CAP], что артефакт родится
                         сразу 'rare' вместо 'common'.

   Всё завязано на РЕАЛЬНЫЕ значения в БД (статы/редкость/уровень
   надетых артефактов) и жёстко ограничено сверху, чтобы экономику
   нельзя было разогнать. Пустой лоадаут → нулевой бонус → генерация
   ведёт себя ровно как раньше (аддитивно, prod-safe).
   ================================================================ */

/** Сколько артефактов можно надеть одновременно. */
export const FORGE_MAX_SLOTS = 3

/** Потолок плоской добавки к каждому стату (базовый ролл 10..40, +12 ощутимо, но не ломает баланс). */
export const STAT_BONUS_CAP = 12

/** Потолок шанса «родиться редким». */
export const RARITY_UP_CHANCE_CAP = 0.3

/** Вклад одного надетого артефакта в statBonus: доля от его среднего стата. */
const STAT_CONTRIB_FACTOR = 0.06

/** Вклад одного надетого артефакта в rarityUpChance: вес редкости × это. */
const RARITY_CONTRIB_FACTOR = 0.025

/** Веса редкости (совпадают с RARITY_MULT в artifacts.routes.ts). */
const RARITY_WEIGHT: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 }

export type EquippedArtifactStats = {
  power: number
  defense: number
  magic: number
  speed: number
  rarity: string
  level: number
}

export type ForgeBonus = {
  /** Число надетых артефактов, из которых посчитан бонус. */
  equippedCount: number
  /** Плоская добавка к каждому стату новорождённого артефакта (целое, ≥0, ≤ STAT_BONUS_CAP). */
  statBonus: number
  /** Вероятность родиться 'rare' вместо 'common' (0..RARITY_UP_CHANCE_CAP). */
  rarityUpChance: number
}

export const ZERO_FORGE_BONUS: ForgeBonus = { equippedCount: 0, statBonus: 0, rarityUpChance: 0 }

/** Чистый расчёт бонуса из списка надетых артефактов — детерминированный и ограниченный. */
export function computeForgeBonus(equipped: EquippedArtifactStats[]): ForgeBonus {
  if (!equipped.length) return { ...ZERO_FORGE_BONUS }

  let rawStat = 0
  let rawRarity = 0
  for (const a of equipped.slice(0, FORGE_MAX_SLOTS)) {
    const statAvg = (a.power + a.defense + a.magic + a.speed) / 4
    // Уровень слегка повышает вклад (усиленный артефакт — более ценный слот).
    const levelFactor = 1 + Math.max(0, (a.level ?? 1) - 1) * 0.05
    rawStat += statAvg * STAT_CONTRIB_FACTOR * levelFactor
    rawRarity += (RARITY_WEIGHT[a.rarity] ?? 1) * RARITY_CONTRIB_FACTOR * levelFactor
  }

  return {
    equippedCount: Math.min(equipped.length, FORGE_MAX_SLOTS),
    statBonus: Math.min(STAT_BONUS_CAP, Math.round(rawStat)),
    rarityUpChance: Math.min(RARITY_UP_CHANCE_CAP, Number(rawRarity.toFixed(4))),
  }
}

/** Возвращает надетые артефакты владельца (до FORGE_MAX_SLOTS, свежие сверху). */
export function getEquippedArtifacts(userId: number): Array<EquippedArtifactStats & { id: number; name: string; type: string }> {
  try {
    return db
      .prepare(
        `SELECT id, name, type, rarity, level, power, defense, magic, speed
         FROM artifacts
         WHERE owner_id = ? AND equipped_at IS NOT NULL
         ORDER BY equipped_at DESC
         LIMIT ?`,
      )
      .all(userId, FORGE_MAX_SLOTS) as Array<EquippedArtifactStats & { id: number; name: string; type: string }>
  } catch {
    // Колонка equipped_at ещё не мигрирована (старый снапшот БД) → лоадаут пуст.
    return []
  }
}

/** Готовый бонус для генерации у конкретного пользователя. Никогда не бросает. */
export function getForgeBonusForUser(userId: number): ForgeBonus {
  return computeForgeBonus(getEquippedArtifacts(userId))
}
