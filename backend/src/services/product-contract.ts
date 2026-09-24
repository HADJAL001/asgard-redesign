import crypto from "node:crypto"
import { z } from "zod"

export const productTypes = ["social", "application", "website", "marketplace", "dashboard", "ai-tool"] as const
export const riskLevels = ["low", "medium", "high"] as const
export const contractGates = ["typecheck", "unit", "a11y", "security", "performance", "visual-diff"] as const

const EvidenceRefSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["requirement", "test", "deploy", "rollback", "user-outcome", "memory"]),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

const WorkflowSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]{0,63}$/),
  actor: z.string().min(1).max(120),
  success: z.string().min(1).max(500),
  risk: z.enum(riskLevels),
}).strict()

const RequirementSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]{0,63}$/),
  text: z.string().min(1).max(1000),
  evidence: z.array(EvidenceRefSchema).max(20),
}).strict()

export const ProductContractSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  productType: z.enum(productTypes),
  designDNA: z.object({
    preset: z.string().min(1).max(40),
    tokens: z.record(z.union([z.string(), z.number()])).refine((value) => Object.keys(value).length <= 200),
  }).strict(),
  workflows: z.array(WorkflowSchema).min(1).max(100),
  requirements: z.array(RequirementSchema).min(1).max(300),
  gates: z.array(z.enum(contractGates)).min(1).max(contractGates.length),
  provenance: z.object({
    sourceMemoryIds: z.array(z.string().min(1).max(120)).max(200),
    playbookVersion: z.string().max(120).optional(),
    createdBy: z.string().min(1).max(120),
  }).strict(),
}).strict()

export type ProductContract = z.infer<typeof ProductContractSchema>

/** Canonical hash used to bind generated artifacts and evidence to one contract revision. */
export function productContractHash(contract: ProductContract): string {
  const parsed = ProductContractSchema.parse(contract)
  return crypto.createHash("sha256").update(JSON.stringify(parsed)).digest("hex")
}

export function parseProductContract(input: unknown): ProductContract {
  return ProductContractSchema.parse(input)
}

export function contractEvidenceIds(contract: ProductContract): string[] {
  return [...new Set(contract.requirements.flatMap((requirement) => requirement.evidence.map((evidence) => evidence.id)))]
}
