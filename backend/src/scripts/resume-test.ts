import db from "../lib/db"
import { ChainManager, pipelineEvents, getTaskStatus } from "../services/chain-manager"
import type { Agent, ArtifactType } from "../types/pipeline.types"

/* Тест чекпоинт-resume ChainManager: стадия №2 падает на первой попытке и проходит
   на retry. Проверяем, что стадии 0 и 1 НЕ переигрываются (их execute вызван по
   одному разу суммарно), а retry продолжает с упавшей стадии. Запуск:
     npx tsx src/scripts/resume-test.ts */

const calls: Record<string, number> = {}

function agent(type: ArtifactType, failFirst = false): Agent {
  let attempts = 0
  return {
    type,
    async execute(input: any) {
      calls[type] = (calls[type] || 0) + 1
      if (failFirst && attempts++ === 0) throw new Error(`boom at ${type}`)
      return { type, ok: true }
    },
  }
}

const stages: Agent[] = [
  agent("spec"),
  agent("schema"),
  agent("design", true), // падает на первой попытке
  agent("frontend"),
  agent("backend"),
]

async function waitFor(taskId: string, kind: "task_error" | "task_done"): Promise<void> {
  return new Promise((resolve) => {
    const channel = `task:${taskId}`
    const handler = (ev: any) => {
      if (ev.type === kind) {
        pipelineEvents.off(channel, handler)
        resolve()
      }
    }
    pipelineEvents.on(channel, handler)
  })
}

async function main() {
  const userRow: any = db.prepare(`SELECT id FROM users ORDER BY id LIMIT 1`).get()
  if (!userRow) {
    console.log("Нет ни одного пользователя в БД — тесту нужен существующий user_id. Пропуск.")
    process.exit(0)
  }
  const userId = userRow.id as number

  const cm = new ChainManager(stages)
  const taskId = cm.start(userId, { name: "resume-test" })

  await waitFor(taskId, "task_error")
  const afterFail = getTaskStatus(userId, taskId)!
  console.log(`После падения: status=${afterFail.status}, готовых артефактов=${afterFail.artifacts.length} (ожид. 2: spec, schema)`)
  console.log("Вызовы до retry:", JSON.stringify(calls))

  const ok = cm.retry(userId, taskId)
  console.log("retry() принят:", ok)

  await waitFor(taskId, "task_done")
  const done = getTaskStatus(userId, taskId)!
  console.log(`После retry: status=${done.status}, артефактов=${done.artifacts.length} (ожид. 5)`)
  console.log("Итоговые вызовы:", JSON.stringify(calls))

  const pass =
    done.status === "completed" &&
    calls.spec === 1 &&      // НЕ переигран
    calls.schema === 1 &&    // НЕ переигран
    calls.design === 2 &&    // fail + success
    calls.frontend === 1 &&
    calls.backend === 1

  console.log(pass ? "\n✅ RESUME РАБОТАЕТ — завершённые стадии не переигрываются" : "\n❌ Resume не сработал как ожидалось")

  db.prepare(`DELETE FROM generation_tasks WHERE id = ?`).run(taskId)
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
