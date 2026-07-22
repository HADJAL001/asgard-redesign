import db from "../lib/db"
import { createChain, executeChain, validateGraph, executionEvents, GraphValidationError } from "../services/orchestrator.service"
import type { OrchestratorGraphNode, OrchestratorGraphEdge } from "../services/orchestrator.service"

/* ================================================================
   Ad-hoc проверка оркестратора (без jest — по конвенции проекта,
   см. scripts/test-db.ts). Все узлы — prompt_template, чтобы тест
   не бил по реальным AI-провайдерам и не требовал API-ключей.
   Запуск: npx tsx src/scripts/test-orchestrator.ts
   ================================================================ */

let failed = false
function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`✅ ${label}`)
  } else {
    failed = true
    console.error(`❌ ${label}`)
  }
}

async function testCycleDetection() {
  const nodes: OrchestratorGraphNode[] = [
    { id: "a", data: { type: "prompt_template", template: "{{input}}" } },
    { id: "b", data: { type: "prompt_template", template: "{{input}}" } },
  ]
  const edges: OrchestratorGraphEdge[] = [
    { source: "a", target: "b" },
    { source: "b", target: "a" },
  ]

  try {
    validateGraph(nodes, edges)
    assert(false, "validateGraph должен бросить исключение на циклическом графе")
  } catch (err) {
    assert(err instanceof GraphValidationError && err.message === "cycle_detected", "validateGraph отклоняет цикл (cycle_detected)")
  }
}

async function testThreeNodeChain() {
  const username = `orch_test_${Date.now()}`
  const userResult = db
    .prepare(`INSERT INTO users (username, display_name) VALUES (?, ?)`)
    .run(username, "Orchestrator Test")
  const userId = Number(userResult.lastInsertRowid)

  const nodes: OrchestratorGraphNode[] = [
    { id: "n1", data: { type: "prompt_template", template: "Hello {{input}}!" } },
    { id: "n2", data: { type: "prompt_template", template: "[[{{input}}]]" } },
    { id: "n3", data: { type: "prompt_template", template: "<<{{input}}>>" } },
  ]
  const edges: OrchestratorGraphEdge[] = [
    { source: "n1", target: "n2" },
    { source: "n2", target: "n3" },
  ]

  const chain = createChain(userId, { name: "Test Snake", nodes, edges })
  assert(chain.id > 0, "createChain сохранил цепочку и вернул строку с id")
  assert(chain.nodes.length === 3 && chain.edges.length === 2, "createChain корректно сериализовал/десериализовал nodes и edges")

  const execResult = db
    .prepare(`INSERT INTO orchestrator_executions (chain_id, user_id, status, input, created_at) VALUES (?, ?, 'pending', ?, ?)`)
    .run(chain.id, userId, "World", Date.now())
  const executionId = Number(execResult.lastInsertRowid)

  const observedEvents: string[] = []
  const channel = `exec:${executionId}`
  const onEvent = (payload: any) => observedEvents.push(payload.type)
  executionEvents.on(channel, onEvent)

  const output = await executeChain(executionId, nodes, edges, "World")
  executionEvents.off(channel, onEvent)

  assert(output === "<<[[Hello World!]]>>", `executeChain выполнил узлы последовательно, итог: "${output}"`)

  const row = db.prepare(`SELECT status, output FROM orchestrator_executions WHERE id = ?`).get(executionId) as any
  assert(row.status === "success" && row.output === output, "orchestrator_executions обновлена (status=success, output совпадает)")

  const expectedEventSequence = ["node_start", "node_done", "node_start", "node_done", "node_start", "node_done", "chain_done"]
  assert(observedEvents.join(",") === expectedEventSequence.join(","), "executionEvents эмитировал корректную последовательность событий")

  db.prepare(`DELETE FROM orchestrator_executions WHERE id = ?`).run(executionId)
  db.prepare(`DELETE FROM orchestrator_chains WHERE id = ?`).run(chain.id)
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)
}

async function main() {
  await testCycleDetection()
  await testThreeNodeChain()

  if (failed) {
    console.error("\n❌ Проверка оркестратора провалена")
    process.exit(1)
  }
  console.log("\n✅ Все проверки оркестратора пройдены")
}

main().catch((err) => {
  console.error("❌ Неперехваченная ошибка теста:", err)
  process.exit(1)
})
