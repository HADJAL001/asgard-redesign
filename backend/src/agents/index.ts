export * from "./types"
export { BaseAgent } from "./base-agent"
export { BusinessAnalystAgent } from "./analyst.agent"
export { ArchitectAgent } from "./architect.agent"
export { DesignerAgent } from "./designer.agent"
export { FrontendAgent, type FrontendAgentInput } from "./frontend.agent"
export { CacheMetrics, type CacheMetricsSnapshot } from "./metrics"
export * from "./examples"

import { BusinessAnalystAgent } from "./analyst.agent"
import { ArchitectAgent } from "./architect.agent"
import { DesignerAgent } from "./designer.agent"
import { FrontendAgent } from "./frontend.agent"
import type { PipelineArtifact, Specification, ProjectSchema, DesignSystem, FrontendArtifact } from "./types"

/* ================================================================
   OSGARD · Агенты сборки проекта — точка входа пайплайна
   ----------------------------------------------------------------
   Прогоняет описание проекта через всех 4 агентов последовательно:
   выход каждого — вход следующего (Бизнес-аналитик → Архитектор →
   Дизайнер → Frontend). Каждый шаг никогда не падает (см. base-agent.ts) —
   при отсутствии/сбое AI-провайдеров пайплайн доезжает до конца на
   детерминированных fallback-ах. Единая точка, которую может вызвать
   оркестратор (Клод #1) как узел цепочки, либо любой другой потребитель.
   ================================================================ */

export interface AgentPipelineResult {
  specification: PipelineArtifact<Specification>
  projectSchema: PipelineArtifact<ProjectSchema>
  designSystem: PipelineArtifact<DesignSystem>
  frontend: PipelineArtifact<FrontendArtifact>
}

const analyst = new BusinessAnalystAgent()
const architect = new ArchitectAgent()
const designer = new DesignerAgent()
const frontend = new FrontendAgent()

export async function runAgentPipeline(description: string): Promise<AgentPipelineResult> {
  const specification = await analyst.execute(description)
  const projectSchema = await architect.execute(specification.data)
  const designSystem = await designer.execute(projectSchema.data)
  const frontendArtifact = await frontend.execute({ schema: projectSchema.data, design: designSystem.data })

  return { specification, projectSchema, designSystem, frontend: frontendArtifact }
}
