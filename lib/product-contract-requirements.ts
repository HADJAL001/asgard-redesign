type RequirementEvidence = { id: string; kind: "requirement"; hash: string }
type ProductContractRequirement = { id: string; text: string; evidence: RequirementEvidence[] }

export function buildProductContractRequirements(input: {
  blueprintId: string
  revision: number
  contractHash: string
  outcome?: string
  brief: string
  constraints?: string[]
  components: string[]
}): ProductContractRequirement[] {
  const evidence = [{ id: `blueprint:${input.blueprintId}:r${input.revision}`, kind: "requirement" as const, hash: input.contractHash }]
  return [
    { id: "primary-outcome", text: (input.outcome || input.brief).slice(0, 1000), evidence },
    ...(input.constraints || []).map((constraint, index) => ({
      id: `user-constraint-${index + 1}`,
      text: `Honor this user-provided constraint: ${constraint}`.slice(0, 1000),
      evidence,
    })),
    ...input.components.map((component, index) => ({
      id: `storyboard-${index + 1}-${component.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "component"}`,
      text: `Include the approved ${component} component in the product experience.`,
      evidence,
    })),
  ]
}
