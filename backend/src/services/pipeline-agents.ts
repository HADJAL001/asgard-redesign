import type { Agent, ArtifactType } from "../types/pipeline.types"
import { adaptEnvelopeAgent, adaptCompositeAgent, findArtifactContent } from "./agent-adapter"
import { BusinessAnalystAgent, ArchitectAgent, DesignerAgent, FrontendAgent } from "../agents"
import { BackendAgent } from "./agents/backend-agent"
import { TesterAgent } from "./agents/tester-agent"
import { OptimizerAgent } from "./agents/optimizer-agent"
import { SecurityAgent } from "./agents/security-agent"
import { adaptProjectSchema } from "./agents/adapters/schema-adapter"
import { adaptFrontendArtifact } from "./agents/adapters/frontend-adapter"

/* ================================================================
   OSGARD · Заглушки агентов пайплайна генерации проекта
   ----------------------------------------------------------------
   Временные реализации Agent (types/pipeline.types.ts), нужны только
   чтобы ChainManager (chain-manager.ts) был компилируемым и рабочим
   до готовности настоящих агентов (Аналитик/Архитектор/Дизайнер/
   Фронтенд/Бэкенд/Тестировщик/Оптимизатор/Безопасник). Каждый класс
   заменяется реальным импортом по мере готовности — сам ChainManager
   менять не нужно, только состав DEFAULT_PIPELINE.

   Деплой-агент ('deployed', интеграции) сюда не входит — вне зоны
   ответственности этого модуля, добавляется в цепочку отдельно.
   ================================================================ */

class StubAgent implements Agent {
  constructor(public readonly type: ArtifactType, private readonly label: string) {}

  async execute(input: any): Promise<any> {
    return { stub: true, step: this.label, receivedInput: input }
  }
}

export const DEFAULT_PIPELINE: Agent[] = [
  new StubAgent("spec", "Аналитик"),
  new StubAgent("schema", "Архитектор"),
  new StubAgent("design", "Дизайнер"),
  new StubAgent("frontend", "Фронтенд"),
  new StubAgent("backend", "Бэкенд"),
  new StubAgent("tests", "Тестировщик"),
  new StubAgent("optimized", "Оптимизатор"),
  new StubAgent("security", "Безопасник"),
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
export function createRealPipeline(): Agent[] {
  const analyst = new BusinessAnalystAgent()
  const architect = new ArchitectAgent()
  const designer = new DesignerAgent()
  const frontend = new FrontendAgent()
  const backend = new BackendAgent()
  const tester = new TesterAgent()
  const optimizer = new OptimizerAgent()
  const security = new SecurityAgent()

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
  ]
}
