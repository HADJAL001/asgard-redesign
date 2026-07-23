import db from "./db"
import { AddonProduct } from "./addons"

/* ================================================================
   OSGARD ADDON PROGRESSION — XP / уровни / достижения
   ================================================================
   Прогрессия ДЖАРВИС/ВАЛЛИ Premium строится на активности пользователя,
   а не на времени подписки (см. migration 056). Полностью отдельная
   от walli_abilities/training/quests/items (migration 012) система.

   Уровень растёт линейно: XP_PER_LEVEL очков опыта на уровень.
   По достижении ELITE_LEVEL_THRESHOLD тир автоматически переключается
   на 'elite' — этот статус не продаётся отдельно, а зарабатывается.
   ================================================================ */

export const XP_PER_LEVEL = 100
export const ELITE_LEVEL_THRESHOLD = 10

export type AddonProgressRow = {
  id: number
  user_id: number
  product: AddonProduct
  level: number
  xp: number
  tier: "premium" | "elite"
  updated_at: number
}

export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function getAddonProgress(userId: number, product: AddonProduct): AddonProgressRow | undefined {
  return db
    .prepare(`SELECT * FROM addon_progress WHERE user_id = ? AND product = ?`)
    .get(userId, product) as AddonProgressRow | undefined
}

export type AwardXpResult = {
  xp: number
  level: number
  tier: "premium" | "elite"
  leveledUp: boolean
  reachedElite: boolean
}

/* ================================================================
   awardAddonXp(userId, product, eventKey, xpAwarded)

   Пишет событие в append-only журнал addon_xp_events и пересчитывает
   денормализованный кэш addon_progress (level/xp/tier). Идемпотентности
   по eventKey здесь нет намеренно — вызывающий код сам решает, разово
   или многократно начисляемое это событие (например "лайк ответа" можно
   начислять многократно, а "первый вход" — только один раз, проверяя
   это до вызова awardAddonXp).
   ================================================================ */
export function awardAddonXp(
  userId: number,
  product: AddonProduct,
  eventKey: string,
  xpAwarded: number,
): AwardXpResult {
  const now = Date.now()

  db.prepare(
    `INSERT INTO addon_xp_events (user_id, product, event_key, xp_awarded, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, product, eventKey, xpAwarded, now)

  const existing = getAddonProgress(userId, product)
  const prevLevel = existing?.level ?? 1
  const prevTier = existing?.tier ?? "premium"
  const newXp = (existing?.xp ?? 0) + xpAwarded
  const newLevel = levelForXp(newXp)
  const newTier: "premium" | "elite" = newLevel >= ELITE_LEVEL_THRESHOLD ? "elite" : prevTier

  if (!existing) {
    db.prepare(
      `INSERT INTO addon_progress (user_id, product, level, xp, tier, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, product, newLevel, newXp, newTier, now)
  } else {
    db.prepare(
      `UPDATE addon_progress SET level = ?, xp = ?, tier = ?, updated_at = ? WHERE user_id = ? AND product = ?`,
    ).run(newLevel, newXp, newTier, now, userId, product)
  }

  return {
    xp: newXp,
    level: newLevel,
    tier: newTier,
    leveledUp: newLevel > prevLevel,
    reachedElite: newTier === "elite" && prevTier !== "elite",
  }
}

export function hasUnlockedAchievement(userId: number, product: AddonProduct, achievementKey: string): boolean {
  const row = db
    .prepare(`SELECT id FROM addon_achievements WHERE user_id = ? AND product = ? AND achievement_key = ?`)
    .get(userId, product, achievementKey)
  return !!row
}

/* Разблокирует достижение (если ещё не разблокировано) — вызывающий код
   сам решает, какое xp начислить вместе с этим через awardAddonXp. */
export function unlockAddonAchievement(userId: number, product: AddonProduct, achievementKey: string): boolean {
  if (hasUnlockedAchievement(userId, product, achievementKey)) return false
  db.prepare(
    `INSERT INTO addon_achievements (user_id, product, achievement_key, unlocked_at) VALUES (?, ?, ?, ?)`,
  ).run(userId, product, achievementKey, Date.now())
  return true
}
