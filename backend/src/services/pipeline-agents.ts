import type { Agent, ArtifactType } from "../types/pipeline.types"
import { adaptEnvelopeAgent, adaptCompositeAgent, findArtifactContent } from "./agent-adapter"
import { BusinessAnalystAgent, ArchitectAgent, DesignerAgent, FrontendAgent } from "../agents"
import { BackendAgent } from "./agents/backend-agent"
import { TesterAgent } from "./agents/tester-agent"
import { OptimizerAgent } from "./agents/optimizer-agent"
import { SecurityAgent } from "./agents/security-agent"
import { DeployAgent } from "./agents/deploy.agent"
import { adaptProjectSchema } from "./agents/adapters/schema-adapter"
import { adaptFrontendArtifact } from "./agents/adapters/frontend-adapter"
import type { GeneratedFile } from "./agents/types"

/** slug для имени Vercel-проекта/GitHub-репозитория — та же схема, что и в
 *  app-generator.ts/frontend.agent.ts/pipeline-bridge.ts (свой slugify в
 *  каждом модуле, а не общий util — устоявшийся в проекте паттерн). */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "osgard-app"
}

/** optimized.files/security.files — только переписанные по applied-предложениям файлы
 *  (см. types.ts), не весь проект. Деплою нужен полный набор: frontend+backend как база,
 *  поверх — патчи optimizer/security по path (та же логика, что в pipeline-bridge.ts). */
function mergeFiles(...fileLists: GeneratedFile[][]): GeneratedFile[] {
  const byPath = new Map<string, GeneratedFile>()
  for (const list of fileLists) {
    for (const file of list) byPath.set(file.path, file)
  }
  return [...byPath.values()]
}

/* ================================================================
   OSGARD · Заглушки агентов пайплайна генерации проекта
   ----------------------------------------------------------------
   Больше не используется в проде (см. DEFAULT_PIPELINE внизу файла) —
   оставлена как STUB_PIPELINE для локальной разработки/тестов
   ChainManager без реальных AI-вызовов и внешних интеграций.
   ================================================================ */

class StubAgent implements Agent {
  constructor(public readonly type: ArtifactType, private readonly label: string) {}

  async execute(input: any): Promise<any> {
    return { stub: true, step: this.label, receivedInput: input }
  }
}

export const STUB_PIPELINE: Agent[] = [
  new StubAgent("spec", "Аналитик"),
  new StubAgent("schema", "Архитектор"),
  new StubAgent("design", "Дизайнер"),
  new StubAgent("frontend", "Фронтенд"),
  new StubAgent("backend", "Бэкенд"),
  new StubAgent("tests", "Тестировщик"),
  new StubAgent("optimized", "Оптимизатор"),
  new StubAgent("security", "Безопасник"),
  new StubAgent("deployed", "Деплой"),
]

/* ================================================================
   Реальная цепочка — собрана из агентов Клода #2 (analyst/architect/
   designer/frontend, конверт PipelineArtifact) и Клода #3 (backend/
   tester/optimizer/security, артефакт напрямую), через agent-adapter.ts.

   `ProjectSchema` и `FrontendArtifact` определены ДВАЖДЫ, по-разному, в
   agents/types.ts (Клод #2 — Zod-схема с database/apiEndpoints/dependencies/
   pages) и services/agents/types.ts (Клод #3 — плоский {name, description,
   entities, auth}). FrontendAgent (Клод #2) получает "schema" в исходной
   форме Клода #2 — это тот же пайплайн, что и у ArchitectAgent, менять не
   нужно. А вот Backend/Tester/Optimizer/Security (Клод #3) ожидают форму
   Клода #3 — поэтому "schema"/"frontend" из истории адаптируются через
   adaptProjectSchema/adaptFrontendArtifact (services/agents/adapters/*,
   тот же маппер, что уже используется в pipeline-bridge.ts) именно на
   границе перехода Клод #2 → Клод #3, а не глобально при сохранении
   артефакта в context.artifacts. */
export function createRealPipeline(): (Agent | Agent[])[] {
  const analyst = new BusinessAnalystAgent()
  const architect = new ArchitectAgent()
  const designer = new DesignerAgent()
  const frontend = new FrontendAgent()
  const backend = new BackendAgent()
  const tester = new TesterAgent()
  const optimizer = new OptimizerAgent()
  const security = new SecurityAgent()
  const deploy = new DeployAgent()

  return [
    adaptEnvelopeAgent("spec", analyst),
    adaptEnvelopeAgent("schema", architect),
    adaptEnvelopeAgent("design", designer),
    adaptCompositeAgent("frontend", frontend, (ctx) => ({
      schema: findArtifactContent(ctx, "schema"),
      design: findArtifactContent(ctx, "design"),
    })),
    adaptCompositeAgent("backend", backend, (ctx) => ({
      schema: adaptProjectSchema(findArtifactContent(ctx, "schema")),
      frontend: adaptFrontendArtifact(findArtifactContent(ctx, "frontend")),
    })),
    adaptCompositeAgent("tests", tester, (ctx) => ({
      frontend: adaptFrontendArtifact(findArtifactContent(ctx, "frontend")),
      backend: findArtifactContent(ctx, "backend"),
    })),
    /* optimized + security — параллельная стадия: оба независимо читают только
       schema/frontend/backend/tests из истории (adaptCompositeAgent игнорирует
       позиционный current) и не зависят друг от друга — см. комментарий в
       chain-manager.ts про Agent | Agent[]. */
    [
      adaptCompositeAgent("optimized", optimizer, (ctx) => ({
        schema: adaptProjectSchema(findArtifactContent(ctx, "schema")),
        frontend: adaptFrontendArtifact(findArtifactContent(ctx, "frontend")),
        backend: findArtifactContent(ctx, "backend"),
        tests: findArtifactContent(ctx, "tests"),
      })),
      adaptCompositeAgent("security", security, (ctx) => ({
        schema: adaptProjectSchema(findArtifactContent(ctx, "schema")),
        frontend: adaptFrontendArtifact(findArtifactContent(ctx, "frontend")),
        backend: findArtifactContent(ctx, "backend"),
        tests: findArtifactContent(ctx, "tests"),
      })),
    ],
    adaptCompositeAgent("deployed", deploy, (ctx) => {
      const schema = adaptProjectSchema(findArtifactContent(ctx, "schema"))
      const frontendFiles: GeneratedFile[] = adaptFrontendArtifact(findArtifactContent(ctx, "frontend")).files
      const backendFiles: GeneratedFile[] = findArtifactContent(ctx, "backend").files
      const optimizedFiles: GeneratedFile[] = findArtifactContent(ctx, "optimized").files
      const securityFiles: GeneratedFile[] = findArtifactContent(ctx, "security").files
      return {
        files: mergeFiles(frontendFiles, backendFiles, optimizedFiles, securityFiles),
        projectName: slugify(schema.name),
      }
    }),
  ]
}

/** Инстанцируется один раз при старте процесса (см. generate-project.routes.ts:
 *  `new ChainManager(DEFAULT_PIPELINE)`) — агенты сами по себе не хранят состояние
 *  между вызовами execute(), общий инстанс безопасен для конкурентных задач. */
export const DEFAULT_PIPELINE: (Agent | Agent[])[] = createRealPipeline()
