import { randomUUID } from "crypto"
import { generateApp, validateGeneratedFiles, type AppGenerationResult } from "./app-generator"
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
const MAX_RETAINED_TASKS = 50
const MAX_GUEST_FILES = 64
const MAX_GUEST_FILE_BYTES = 512 * 1024
const MAX_GUEST_TOTAL_BYTES = 2 * 1024 * 1024

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

function makeRoomForTask() {
  while (tasks.size >= MAX_RETAINED_TASKS) {
    let oldestCompleted: [string, GuestTask] | null = null
    for (const entry of tasks.entries()) {
      if (entry[1].status === "processing") continue
      if (!oldestCompleted || entry[1].createdAt < oldestCompleted[1].createdAt) oldestCompleted = entry
    }
    if (!oldestCompleted) break
    tasks.delete(oldestCompleted[0])
  }
}

export function guestReleaseErrors(result: AppGenerationResult): string[] {
  const errors = validateGeneratedFiles(result.files)
  const paths = new Set(result.files.map((file) => file.path))
  if (!paths.has("package.json")) errors.push("missing package.json")
  if (!paths.has("app/page.tsx")) errors.push("missing app/page.tsx")
  if (result.files.length > MAX_GUEST_FILES) errors.push("too many files")

  let totalBytes = 0
  for (const file of result.files) {
    const bytes = Buffer.byteLength(file.content, "utf8")
    totalBytes += bytes
    if (bytes > MAX_GUEST_FILE_BYTES) errors.push(`file too large: ${file.path}`)
  }
  if (totalBytes > MAX_GUEST_TOTAL_BYTES) errors.push("project too large")
  return errors
}

/** Запускает генерацию в фоне (fire-and-forget), сразу возвращает taskId.
 *  Бросает GuestGenerationBusyError, если превышен потолок одновременных. */
export function startGuestGeneration(name: string, hint?: string): string {
  sweepExpired()
  makeRoomForTask()
  if (countProcessing() >= MAX_CONCURRENT) {
    throw new GuestGenerationBusyError()
  }
  const taskId = randomUUID()
  tasks.set(taskId, { status: "processing", createdAt: Date.now() })

  generateApp(name, hint)
    .then((result) => {
      const releaseErrors = guestReleaseErrors(result)
      if (releaseErrors.length > 0) {
        throw new Error(`guest release gate rejected output: ${releaseErrors.slice(0, 5).join("; ")}`)
      }
      tasks.set(taskId, { status: "done", result, createdAt: Date.now() })
    })
    .catch((err) => {
      captureError("[guest-code] generateApp failed", err)
      tasks.set(taskId, {
        status: "error",
        error: "Не удалось собрать проект. Попробуйте ещё раз через несколько минут.",
        createdAt: Date.now(),
      })
    })

  return taskId
}

export function getGuestTask(taskId: string): GuestTask | undefined {
  sweepExpired()
  return tasks.get(taskId)
}
