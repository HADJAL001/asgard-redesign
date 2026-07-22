import { runAgentPipeline } from "../../agents"
import { adaptProjectSchema } from "./adapters/schema-adapter"
import { adaptFrontendArtifact } from "./adapters/frontend-adapter"
import { BackendAgent } from "./backend-agent"
import { TesterAgent } from "./tester-agent"
import { OptimizerAgent } from "./optimizer-agent"
import { SecurityAgent } from "./security-agent"
import { DeployAgent } from "./deploy.agent"
import type { BackendArtifact, DeployArtifact, FrontendArtifact, GeneratedFile, OptimizedArtifact, ProjectSchema, SecurityReport, TestArtifact } from "./types"

/* ================================================================
   OSGARD · Мост между пайплайном Клода #2 (Analyst/Architect/
   Designer/Frontend, backend/src/agents) и пайплайном Клода #3
   (Backend/Tester/Optimizer/Security/Deploy, backend/src/services/agents).
   Разница контрактов (ProjectSchema/FrontendArtifact) устранена
   через adapters/*, а не изменением сигнатур агентов Клода #3 —
   у них уже есть собственный, независимо согласованный контракт
   (см. types.ts), которым также пользуются другие потребители.
   ================================================================ */

export interface FullPipelineResult {
  schema: ProjectSchema
  frontend: FrontendArtifact
  backend: BackendArtifact
  tests: TestArtifact
  optimized: OptimizedArtifact
  security: SecurityReport
  deploy: DeployArtifact
}

const backendAgent = new BackendAgent()
const testerAgent = new TesterAgent()
const optimizerAgent = new OptimizerAgent()
const securityAgent = new SecurityAgent()
const deployAgent = new DeployAgent()

/** slug для имени Vercel-проекта/GitHub-репозитория — та же схема, что и в
 *  app-generator.ts/frontend.agent.ts (свой slugify в каждом модуле, а не
 *  общий util — устоявшийся в проекте паттерн). */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "osgard-app"
}

/** optimized.files/security.files — это только ПЕРЕЗАПИСАННЫЕ по applied-предложениям
 *  файлы (см. комментарии в types.ts), не весь проект. Для деплоя нужен полный набор:
 *  берём frontend+backend как базу и накатываем поверх патчи optimizer/security по path. */
function mergeFiles(...fileLists: GeneratedFile[][]): GeneratedFile[] {
  const byPath = new Map<string, GeneratedFile>()
  for (const list of fileLists) {
    for (const file of list) byPath.set(file.path, file)
  }
  return [...byPath.values()]
}

/** taskId (необязателен) — при передаче каждый шаг пишет метрики (agent_executions) и
 *  шлёт прогресс в канал task:${taskId} (см. BaseAgent.run, base-agent.ts), который уже
 *  слушает SSE-роут GET /api/generate-project/task/:taskId/stream. */
export async function runFullPipeline(description: string, taskId?: string): Promise<FullPipelineResult> {
  const upstream = await runAgentPipeline(description)

  const schema = adaptProjectSchema(upstream.projectSchema.data)
  const frontend = adaptFrontendArtifact(upstream.frontend.data)

  const backend = await backendAgent.run({ schema, frontend }, taskId)
  const tests = await testerAgent.run({ frontend, backend }, taskId)
  const optimized = await optimizerAgent.run({ schema, frontend, backend, tests }, taskId)
  const security = await securityAgent.run({ schema, frontend, backend, tests }, taskId)

  const deployFiles = mergeFiles(frontend.files, backend.files, optimized.files, security.files)
  const deploy = await deployAgent.run({ files: deployFiles, projectName: slugify(schema.name) }, taskId)

  return { schema, frontend, backend, tests, optimized, security, deploy }
}
