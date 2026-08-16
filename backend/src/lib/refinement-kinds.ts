export const REFINEMENT_KINDS = ["feature", "design", "fix", "performance", "custom"] as const

export type RefinementKind = (typeof REFINEMENT_KINDS)[number]

export function normalizeRefinementKind(value: unknown): RefinementKind {
  return REFINEMENT_KINDS.includes(value as RefinementKind) ? (value as RefinementKind) : "custom"
}

export const REFINEMENT_KIND_INSTRUCTIONS: Record<RefinementKind, string> = {
  feature: "Add the requested product capability end to end, including UI, states, data flow, and persistence when available.",
  design: "Improve the existing interface hierarchy, spacing, typography, responsiveness, accessibility, and visual consistency without removing working behavior.",
  fix: "Reproduce the described defect from the source, correct its root cause, and preserve unrelated behavior.",
  performance: "Remove measurable rendering, loading, or data-flow waste without changing the product contract.",
  custom: "Implement the requested change precisely while preserving every unrelated capability.",
}
