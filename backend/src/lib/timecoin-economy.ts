export const TIMECOIN_USD_CENTS = 1_000
export const PROJECT_CREATION_COST_TC = 1

/** A guest receives one project through a separately enforced server-side cap.
 * Its admission price must be zero because guest wallets intentionally start
 * empty. All registered accounts use the public project price. */
export function projectAdmissionCostTimecoin(isGuest: boolean): number {
  return isGuest ? 0 : PROJECT_CREATION_COST_TC
}

export const TIMECOIN_PRICES = {
  artifactForge: 2,
  artifactEvolve: 0.25,
  artifactRarityUpgrade: 2,
  artifactPremiumLevelFactor: 0.25,
  feedbackReward: 0.1,
  demoReward: 1,
  referralOwnerReward: 1,
  referralNewUserReward: 0.5,
  walliExclusive: 5,
  twinRentalBase: 0.1,
  twinRentalPerLevel: 0.05,
} as const

export const ORCHESTRATOR_NODE_COST_TC = {
  claude: 0.25,
  deepseek: 0.1,
  grok: 0.2,
  prompt_template: 0,
  service_call: 0.1,
  webhook_trigger: 0,
} as const

export function parseTimecoinQuantity(raw: unknown, max = 1_000): number | null {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null
}

export function timecoinPurchaseCents(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Invalid TimeCoin quantity")
  return quantity * TIMECOIN_USD_CENTS
}
