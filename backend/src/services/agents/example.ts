import { BackendAgent } from "./backend-agent"
import { TesterAgent } from "./tester-agent"
import { OptimizerAgent } from "./optimizer-agent"
import { SecurityAgent } from "./security-agent"
import type { FrontendArtifact, ProjectSchema } from "./types"

/* ================================================================
   OSGARD · Пример использования пайплайна из 4 агентов
   ----------------------------------------------------------------
   Backend → Tester → Optimizer → Security. Вход для Backend/Tester —
   ProjectSchema + FrontendArtifact, которые в реальном пайплайне
   приходят от агентов Claude #2 (Аналитик/Архитектор/Дизайнер/
   Фронтенд); здесь для наглядности они заданы вручную.
   Запуск: npx ts-node backend/src/services/agents/example.ts
   ================================================================ */

const schema: ProjectSchema = {
  name: "TaskBoard",
  description: "Простой таск-трекер с досками и задачами",
  entities: [
    {
      name: "Task",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "done", type: "boolean" },
      ],
    },
  ],
  auth: { required: true, roles: ["user", "admin"] },
}

const frontend: FrontendArtifact = {
  type: "frontend",
  files: [
    {
      path: "app/tasks/page.tsx",
      content: `export default function TasksPage() {
  return <main>Tasks</main>
}
`,
    },
  ],
}

async function main() {
  // .run() вместо .execute() — тот же результат, но дополнительно пишет метрики
  // (agent_executions), кеширует по хешу входа и шлёт прогресс (без taskId — no-op).
  const backendResult = await new BackendAgent().run({ schema, frontend })
  console.log(`[backend] source=${backendResult.source} files=${backendResult.files.length}`)

  const testResult = await new TesterAgent().run({ frontend, backend: backendResult })
  console.log(`[tester] source=${testResult.source} files=${testResult.files.length}`)

  const optimizedResult = await new OptimizerAgent().run({
    schema,
    frontend,
    backend: backendResult,
    tests: testResult,
  })
  console.log(`[optimizer] source=${optimizedResult.source} suggestions=${optimizedResult.suggestions.length} patchedFiles=${optimizedResult.files.length}`)

  const securityResult = await new SecurityAgent().run({
    schema,
    frontend,
    backend: backendResult,
    tests: testResult,
  })
  console.log(`[security] source=${securityResult.source} findings=${securityResult.findings.length} patchedFiles=${securityResult.files.length}`)
  for (const finding of securityResult.findings) {
    console.log(`  - [${finding.severity}] ${finding.file}: ${finding.vulnerability} — ${finding.description}${finding.fixed ? " (исправлено)" : ""}`)
  }
}

main().catch((err) => {
  console.error("[agents-example] pipeline failed:", err)
  process.exit(1)
})
