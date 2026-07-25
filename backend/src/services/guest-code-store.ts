import { randomUUID } from "crypto"
import { generateApp, type AppGenerationResult } from "./app-generator"
import { captureError } from "../lib/sentry"

/* ================================================================
   OSGARD · Guest Code Store — анонимная генерация кода (Part 2)
   ----------------------------------------------------------------
   Самодостаточный in-memory task-store для ГОСТЕВОЙ генерации кода.
   СОЗНАТЕЛЬНО не использует ChainManager/generation_tasks (те требуют
   userId и пишут в БД) — здесь аноним без аккаунта. Опирается только
   на публичный экспорт app-generator.ts::generateApp(name, hint) →
   {files, source}, который сам файл не меняет.

   Это отдельная от сессии A реализация «анонимного варианта пайплайна»
   на static-export генераторе (app-generator). Если сессия A выкатит
   свой вариант на 9-стадийном ChainManager — этот store легко
   заменить, фронт подключён через адаптер (одна правка). См.
   PART3_STATUS.md.
   ================================================================ */

export type GuestTaskStatus = "processing" | "done" | "error"

export type GuestTask = {
  status: GuestTaskStatus
  result?: AppGenerationResult
  error?: string
  createdAt: number
}

const tasks = new Map<string, GuestTask>()

const TASK_TTL_MS = 30 * 60 * 1000 // 30 минут — результат живёт недолго, это демо

/* Глобальный потолок одновременных генераций: каждая — это дорогая цепочка
   AI-вызовов. Без него всплеск гостевых запросов (в пределах IP-лимита, но с
   разных IP) может завалить провайдеров и бюджет. Аноним не должен уметь этого. */
const MAX_CONCURRENT = 4

/** Кидается роутом → 429, когда очередь занята. */
export class GuestGenerationBusyError extends Error {
  constructor() {
    super("Сервис генерации сейчас занят, попробуйте через минуту")
    this.name = "GuestGenerationBusyError"
  }
}

function countProcessing(): number {
  let n = 0
  for (const task of tasks.values()) if (task.status === "processing") n++
  return n
}

/* Ленивая очистка протухших задач — вызывается при каждом обращении, без
   отдельного setInterval (проще и не держит event loop). */
function sweepExpired() {
  const now = Date.now()
  for (const [id, task] of tasks) {
    if (now - task.createdAt > TASK_TTL_MS) tasks.delete(id)
  }
}

/** Запускает генерацию в фоне (fire-and-forget), сразу возвращает taskId.
 *  Бросает GuestGenerationBusyError, если превышен потолок одновременных. */
export function startGuestGeneration(name: string, hint?: string): string {
  sweepExpired()
  if (countProcessing() >= MAX_CONCURRENT) {
    throw new GuestGenerationBusyError()
  }
  const taskId = randomUUID()
  tasks.set(taskId, { status: "processing", createdAt: Date.now() })

  generateApp(name, hint)
    .then((result) => {
      tasks.set(taskId, { status: "done", result, createdAt: Date.now() })
    })
    .catch((err) => {
      captureError("[guest-code] generateApp failed", err)
      tasks.set(taskId, {
        status: "error",
        error: err instanceof Error ? err.message : "Ошибка генерации",
        createdAt: Date.now(),
      })
    })

  return taskId
}

export function getGuestTask(taskId: string): GuestTask | undefined {
  sweepExpired()
  return tasks.get(taskId)
}
