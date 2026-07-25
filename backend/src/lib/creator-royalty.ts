/* ================================================================
   OSGARD · Роялти творца (creator royalties)
   ----------------------------------------------------------------
   Первый кузнец артефакта (artifacts.creator_id, миграция 080)
   получает долю комиссии маркетплейса при КАЖДОЙ перепродаже своей
   ковки. Ключевые свойства дизайна:

   • Из платформенной части комиссии. Net продавца (price − fee) и
     цена покупателя (price) НЕ меняются — роялти отдаёт платформа из
     уже удержанного fee. Никаких сюрпризов для сторон сделки.

   • Anti-wash по построению: роялти = доля от fee, значит роялти < fee.
     Прогонять артефакт по кругу (сам себе продавать через подставных)
     убыточно — каждый цикл теряет комиссию, а возвращает лишь её часть.

   • Творец не платит роялти сам себе: если он же продавец или
     покупатель текущей сделки — выплаты нет (иначе фарм на собственных
     артефактах).

   Чистая функция, без БД — маршрут сам списывает/начисляет и логирует.
   ================================================================ */

/** Доля комиссии маркетплейса, уходящая первому кузнецу при перепродаже. */
export const CREATOR_ROYALTY_SHARE_OF_FEE = 0.2

export interface RoyaltyParties {
  creatorId: number | null | undefined
  sellerId: number
  buyerId: number
}

/**
 * Считает роялти творцу от комиссии сделки.
 * @param fee    платформенная комиссия сделки (в валюте лота)
 * @param shareOfFee доля комиссии для творца (по умолчанию CREATOR_ROYALTY_SHARE_OF_FEE)
 * @returns { amount, creatorId } к выплате, либо null если роялти не положено
 */
export function computeCreatorRoyalty(
  fee: number,
  { creatorId, sellerId, buyerId }: RoyaltyParties,
  shareOfFee: number = CREATOR_ROYALTY_SHARE_OF_FEE,
): { amount: number; creatorId: number } | null {
  if (!creatorId) return null
  if (!(fee > 0)) return null
  // Ни самонакрутки продавцом-творцом, ни выкупа собственной ковки покупателем-творцом.
  if (creatorId === sellerId || creatorId === buyerId) return null

  const amount = fee * shareOfFee
  if (!(amount > 0)) return null

  return { amount, creatorId }
}
