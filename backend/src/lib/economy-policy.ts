export const MARKET_CURRENCY = "timecoin" as const
export const SOFT_CURRENCY = "credits" as const
export const CRAFT_MATERIALS = ["shards", "crystals"] as const
export type CraftMaterial = (typeof CRAFT_MATERIALS)[number]

export const MATERIAL_OFFERS: Record<CraftMaterial, { credits: number; quantity: number }> = {
  shards: { credits: 40, quantity: 10 },
  crystals: { credits: 120, quantity: 1 },
}

export const FORGE_RECIPE: Record<string, { credits: number; material: CraftMaterial; materialAmount: number }> = {
  neural: { credits: 120, material: "shards", materialAmount: 4 },
  code: { credits: 120, material: "shards", materialAmount: 4 },
  design: { credits: 160, material: "crystals", materialAmount: 1 },
  strategy: { credits: 160, material: "crystals", materialAmount: 1 },
}

export function forgeRecipeFor(type: unknown) {
  return FORGE_RECIPE[String(type)] ?? FORGE_RECIPE.neural
}
