import type { Agent, AgentContext, ArtifactType } from "../types/pipeline.types"

/* ================================================================
   OSGARD · Адаптер реальных агентов (Клод #2 / Клод #3) под ChainManager
   ----------------------------------------------------------------
   Клод #2 (backend/src/agents/*) и Клод #3 (backend/src/services/agents/*)
   реализовали ДВА разных, несовместимых между собой базовых класса:

   - agents/base-agent.ts (Клод #2): execute(input) возвращает конверт
     PipelineArtifact<T> = { type, agent, data, source, createdAt } —
     полезная нагрузка лежит в .data, а не в самом результате.
   - services/agents/base-agent.ts (Клод #3): execute(input) возвращает
     артефакт НАПРЯМУЮ (BackendArtifact/TestArtifact/...), без конверта.

   Кроме того, ни один из них не имеет свойства `type: ArtifactType`
   (у Клода #2 — `artifactType`, у Клода #3 — `name`), поэтому оба не
   подходят под контракт Agent (types/pipeline.types.ts) напрямую —
   отсюда обёртки ниже, а не `implements Agent` на самих классах.

   Второе несоответствие — часть реальных агентов принимают на вход
   НЕСКОЛЬКО предыдущих артефактов сразу (FrontendAgent — schema+design,
   BackendAgent — schema+frontend, Tester/Optimizer/Security — ещё больше),
   а ChainManager передаёт агенту только output предыдущего шага (`current`).
   Поэтому adaptCompositeAgent игнорирует переданный `input` и вместо
   этого собирает нужный объект из context.artifacts (полная история
   уже выполненных шагов, см. chain-manager.ts).
   ================================================================ */

/** Возвращает content последнего артефакта заданного типа из истории цепочки. */
function findArtifactContent(context: AgentContext, type: ArtifactType): any {
  for (let i = context.artifacts.length - 1; i >= 0; i--) {
    if (context.artifacts[i].type === type) return context.artifacts[i].content
  }
  throw new Error(`agent-adapter: артефакт типа "${type}" отсутствует в контексте задачи ${context.taskId}`)
}

/**
 * Адаптер для агентов Клода #2 (agents/*.agent.ts) — execute(input) отдаёт
 * PipelineArtifact<T>, разворачиваем до .data, чтобы следующий шаг цепочки
 * получил ту же полезную нагрузку, что и в их собственном runAgentPipeline
 * (agents/index.ts), а не обёртку целиком.
 */
export function adaptEnvelopeAgent(
  type: ArtifactType,
  agent: { execute(input: any): Promise<{ data: any }> },
): Agent {
  return {
    type,
    async execute(input: any): Promise<any> {
      const result = await agent.execute(input)
      return result.data
    },
  }
}

/**
 * Адаптер для агентов, которым нужен НЕ единственный предыдущий output, а
 * составной объект из нескольких прошлых артефактов (FrontendAgent у
 * Клода #2; все агенты Клода #3 — services/agents/*). `buildInput` сам
 * решает, какие типы артефактов ему нужны (обычно через findArtifactContent).
 *
 * Если у агента есть `.run()` (Клод #3 — services/agents/base-agent.ts),
 * используем его вместо голого `.execute()`: `.run()` — это тот же
 * `.execute()`, обёрнутый метриками (agent_executions), кешем по хешу
 * входа (AgentCache) и прогрессом в pipelineEvents (тот же канал
 * task:${taskId}, что слушает SSE-роут) — без этого шаги Backend/Tester/
 * Optimizer/Security/Deploy при прогоне через ChainManager молча теряли
 * бы всю эту телеметрию, которая есть у них при прогоне через
 * pipeline-bridge.ts. FrontendAgent (Клод #2) `.run()` не имеет —
 * для него ветка ниже уходит в обычный `.execute()`, как раньше.
 */
export function adaptCompositeAgent(
  type: ArtifactType,
  agent: { execute(input: any): Promise<any>; run?(input: any, taskId?: string): Promise<any> },
  buildInput: (context: AgentContext) => any,
): Agent {
  return {
    type,
    async execute(_input: any, context: AgentContext): Promise<any> {
      const input = buildInput(context)
      return agent.run ? agent.run(input, context.taskId) : agent.execute(input)
    },
  }
}

export { findArtifactContent }
