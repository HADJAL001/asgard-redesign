import db from "./db"

export type PromoCharge = { grantId: number; amount: number }

/** Must run in the transaction that creates the paid refinement. */
export function recordPromoRefinementCharges(refinementId: number, charges: PromoCharge[], now = Date.now()): void {
  const insert = db.prepare(
    `INSERT INTO promo_credit_charges (grant_id, refinement_id, amount, created_at) VALUES (?, ?, ?, ?)`,
  )
  for (const charge of charges) insert.run(charge.grantId, refinementId, charge.amount, now)
}

export function availablePromoCredits(userId: number, now = Date.now()): number {
  const row = db.prepare(`SELECT COALESCE(SUM(remaining), 0) AS amount FROM promo_credit_grants WHERE user_id = ? AND expires_at > ?`).get(userId, now) as { amount: number }
  return Number(row.amount || 0)
}

/** Must run inside the caller's BEGIN IMMEDIATE transaction. */
export function chargeCreditsWithPromo(userId: number, amount: number, now = Date.now()): { promo: PromoCharge[]; regular: number } | null {
  const grants = db.prepare(`SELECT id, remaining FROM promo_credit_grants WHERE user_id = ? AND expires_at > ? AND remaining > 0 ORDER BY expires_at ASC, id ASC`).all(userId, now) as Array<{ id: number; remaining: number }>
  let rest = amount
  const promo: PromoCharge[] = []
  const reduce = db.prepare(`UPDATE promo_credit_grants SET remaining = remaining - ? WHERE id = ? AND remaining >= ?`)
  for (const grant of grants) {
    if (rest <= 0) break
    const take = Math.min(rest, grant.remaining)
    if (reduce.run(take, grant.id, take).changes !== 1) return null
    promo.push({ grantId: grant.id, amount: take })
    rest -= take
  }
  if (rest > 0) {
    const debit = db.prepare(`UPDATE wallets SET credits = credits - ?, updated_at = ? WHERE user_id = ? AND credits >= ?`).run(rest, now, userId, rest)
    if (debit.changes !== 1) return null
  }
  return { promo, regular: rest }
}

export function refundPromoCharge(charge: { promo: PromoCharge[]; regular: number }, userId: number, now = Date.now()) {
  const restore = db.prepare(`UPDATE promo_credit_grants SET remaining = MIN(amount, remaining + ?) WHERE id = ? AND user_id = ?`)
  for (const entry of charge.promo) restore.run(entry.amount, entry.grantId, userId)
  if (charge.regular > 0) db.prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`).run(charge.regular, now, userId)
}
