import { z } from "zod"

/* ================================================================
   OSGARD · Агенты сборки проекта — общие типы и Zod-схемы
   ----------------------------------------------------------------
   Пайплайн: description(string) → Specification → ProjectSchema →
   DesignSystem → FrontendArtifact. Каждый агент (BusinessAnalyst,
   Architect, Designer, Frontend) — это BaseAgent<TInput, TOutput>
   (см. base-agent.ts), результат execute() всегда оборачивается в
   PipelineArtifact<T> — единый конверт для передачи между агентами
   (в т.ч. другим подсистемам OSGARD, например оркестратору).

   Название "PipelineArtifact" выбрано намеренно вместо "Artifact",
   т.к. это имя уже занято игровой сущностью (см.
   services/ai-artifact-generator.ts, routes/artifacts.routes.ts) —
   NFT-подобные игровые предметы, не имеющие отношения к этому пайплайну.
   ================================================================ */

export type PipelineArtifactType = "spec" | "schema" | "design" | "frontend"
export type PipelineArtifactSource = "claude" | "deepseek" | "fallback" | "cache"

export interface PipelineArtifact<T> {
  type: PipelineArtifactType
  agent: string
  data: T
  source: PipelineArtifactSource
  createdAt: number
}

/* ---------------- Specification (выход Бизнес-аналитика) ---------------- */

export const FeaturePrioritySchema = z.enum(["must", "should", "could"])

export const FeatureSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  priority: FeaturePrioritySchema,
})

export const SpecificationSchema = z.object({
  projectName: z.string().min(1),
  summary: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  targetUsers: z.array(z.string().min(1)).min(1),
  features: z.array(FeatureSchema).min(1),
  nonFunctionalRequirements: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  successMetrics: z.array(z.string().min(1)),
})

export type Specification = z.infer<typeof SpecificationSchema>

/* ---------------- ProjectSchema (выход Архитектора) ---------------- */

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])

export const DbColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  primaryKey: z.boolean().optional(),
  nullable: z.boolean().optional(),
  references: z.string().optional(),
})

export const DbTableSchema = z.object({
  name: z.string().min(1),
  columns: z.array(DbColumnSchema).min(1),
})

export const ApiEndpointSchema = z.object({
  method: HttpMethodSchema,
  path: z.string().min(1),
  description: z.string().min(1),
  requestBody: z.string().optional(),
  responseBody: z.string().optional(),
})

export const DependencySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  purpose: z.string().min(1),
})

export const FolderEntrySchema = z.object({
  path: z.string().min(1),
  description: z.string().min(1),
})

export const PageEntrySchema = z.object({
  route: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
})

export type PageEntry = z.infer<typeof PageEntrySchema>

export const ProjectSchemaSchema = z.object({
  name: z.string().min(1),
  folderStructure: z.array(FolderEntrySchema).min(1),
  database: z.object({
    tables: z.array(DbTableSchema),
  }),
  apiEndpoints: z.array(ApiEndpointSchema),
  dependencies: z.array(DependencySchema),
  pages: z.array(PageEntrySchema).min(1),
})

export type ProjectSchema = z.infer<typeof ProjectSchemaSchema>

/* ---------------- DesignSystem (выход UI/UX-дизайнера) ---------------- */

export const ColorTokenSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  usage: z.string().min(1),
})

export const IconTokenSchema = z.object({
  name: z.string().min(1),
  usage: z.string().min(1),
})

export const DesignSystemSchema = z.object({
  colors: z.array(ColorTokenSchema).min(1),
  typography: z.object({
    fontFamily: z.string().min(1),
    headingSizes: z.record(z.string(), z.string()),
    bodySize: z.string().min(1),
  }),
  spacing: z.object({
    unit: z.string().min(1),
    scale: z.array(z.number()).min(1),
  }),
  borderRadius: z.string().min(1),
  tailwindConfigExtend: z.record(z.string(), z.any()),
  icons: z.array(IconTokenSchema),
  darkMode: z.boolean(),
})

export type DesignSystem = z.infer<typeof DesignSystemSchema>

/* ---------------- FrontendArtifact (выход Frontend-разработчика) ---------------- */

export const GeneratedFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

export const FrontendArtifactSchema = z.object({
  files: z.array(GeneratedFileSchema).min(1),
  componentsGenerated: z.array(z.string()),
  pagesGenerated: z.array(z.string()),
  notes: z.string(),
})

export type FrontendArtifact = z.infer<typeof FrontendArtifactSchema>
