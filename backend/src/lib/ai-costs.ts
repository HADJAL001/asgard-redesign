export type AiModelPricing = {
  inputPerMillionUsd: number
  outputPerMillionUsd: number
}

export type AiUsageForCost = {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  estimated: boolean
}

export type AiCostSummary = {
  pricedUsd: number
  pricedCalls: number
  unpricedCalls: number
  estimatedCalls: number
}

function validRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/** Parses the server-only AI_MODEL_PRICING_JSON configuration without ever treating bad data as free. */
export function parseAiModelPricing(raw = process.env.AI_MODEL_PRICING_JSON): Record<string, AiModelPricing> {
  if (!raw) return {}
  try {
    const decoded: unknown = JSON.parse(raw)
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return {}
    const pricing: Record<string, AiModelPricing> = {}
    for (const [key, value] of Object.entries(decoded as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue
      const entry = value as Record<string, unknown>
      if (validRate(entry.inputPerMillionUsd) && validRate(entry.outputPerMillionUsd)) {
        pricing[key] = {
          inputPerMillionUsd: entry.inputPerMillionUsd,
          outputPerMillionUsd: entry.outputPerMillionUsd,
        }
      }
    }
    return pricing
  } catch {
    return {}
  }
}

export function aiModelPricingKey(provider: string, model: string): string {
  return `${provider}:${model}`
}

export function summarizeAiCost(calls: AiUsageForCost[], pricing = parseAiModelPricing()): AiCostSummary {
  let pricedUsd = 0
  let pricedCalls = 0
  let unpricedCalls = 0
  let estimatedCalls = 0
  for (const call of calls) {
    if (call.estimated) estimatedCalls += 1
    const rate = pricing[aiModelPricingKey(call.provider, call.model)]
    if (!rate) {
      unpricedCalls += 1
      continue
    }
    pricedCalls += 1
    pricedUsd += (Math.max(0, call.inputTokens) * rate.inputPerMillionUsd
      + Math.max(0, call.outputTokens) * rate.outputPerMillionUsd) / 1_000_000
  }
  return { pricedUsd, pricedCalls, unpricedCalls, estimatedCalls }
}
