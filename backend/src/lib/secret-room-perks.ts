import db from "./db"

/* ================================================================
   OSGARD · Secret Room perks — экономическая ценность комнаты
   ----------------------------------------------------------------
   Первая ставка: активная Тайная комната (см. secret-room.routes.ts,
   миграция 070) даёт владельцу надбавку к APR стейкинга. Надбавка
   применяется ТОЛЬКО в момент открытия стейка (замораживается в
   stake.apr, как и базовый APR по сроку) — продление/истечение
   комнаты не меняет APR уже открытых позиций.
   ================================================================ */

/** Надбавка к APR за активную Тайную комнату (0.02 = +2 процентных пункта). */
export const SECRET_ROOM_STAKE_APR_BONUS = 0.02
export const SECRET_ROOM_MARKET_FEE = 0

/** true, если у пользователя сейчас активная (неистёкшая) Тайная комната. */
export function hasActiveSecretRoom(userId: number): boolean {
  try {
    const row: any = db
      .prepare(`SELECT access_until FROM secret_rooms WHERE owner_id = ?`)
      .get(userId)
    return !!row && row.access_until > Date.now()
  } catch {
    // Таблица не мигрирована (старый снапшот БД) — считаем, что комнаты нет.
    return false
  }
}

/** Marketplace and auctions use this instead of trusting a client-side badge. */
export function secretRoomMarketFeeRate(userId: number): number | null {
  return hasActiveSecretRoom(userId) ? SECRET_ROOM_MARKET_FEE : null
}
