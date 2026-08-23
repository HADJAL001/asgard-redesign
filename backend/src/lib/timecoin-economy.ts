export const TIMECOIN_USD_CENTS = 1_000
export const PROJECT_CREATION_COST_TC = 1

export function parseTimecoinQuantity(raw: unknown, max = 1_000): number | null {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null
}

export function timecoinPurchaseCents(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Invalid TimeCoin quantity")
  return quantity * TIMECOIN_USD_CENTS
}
