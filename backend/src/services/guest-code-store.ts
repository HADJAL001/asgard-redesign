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
  projectName: string
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

export function guestArchiveFilename(projectName: string, taskId: string): string {
  const slug = projectName
    .replace(/\.zip$/i, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const fallbackId = taskId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "download"
  return `${slug || `osgard-project-${fallbackId}`}.zip`
}

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
  const canonicalFiles = result.files.map((file) => ({ ...file, path: file.path.replace(/^\/+/, "") }))
  const exactPaths = new Set<string>()
  const caseFoldedPaths = new Map<string, string>()
  for (const file of canonicalFiles) {
    if (exactPaths.has(file.path)) errors.push(`duplicate file path: ${file.path}`)
    exactPaths.add(file.path)

    const foldedPath = file.path.toLocaleLowerCase("en-US")
    const existingPath = caseFoldedPaths.get(foldedPath)
    if (existingPath && existingPath !== file.path) {
      errors.push(`case-colliding file paths: ${existingPath}, ${file.path}`)
    } else {
      caseFoldedPaths.set(foldedPath, file.path)
    }
  }

  const packageFile = canonicalFiles.find((file) => file.path === "package.json")
  const pageFile = canonicalFiles.find((file) => file.path === "app/page.tsx")
  if (!packageFile) {
    errors.push("missing package.json")
  } else {
    try {
      const parsed = JSON.parse(packageFile.content)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push("invalid package.json")
      } else {
        if (parsed.scripts?.dev !== "next dev") errors.push("unsupported dev script")
        for (const dependency of ["next", "react", "react-dom"]) {
          if (typeof parsed.dependencies?.[dependency] !== "string" || !parsed.dependencies[dependency].trim()) {
            errors.push(`missing runtime dependency: ${dependency}`)
          }
        }
      }
    } catch {
      errors.push("invalid package.json")
    }
  }
  if (!pageFile) errors.push("missing app/page.tsx")
  else if (!pageFile.content.trim()) errors.push("empty app/page.tsx")
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
  tasks.set(taskId, { status: "processing", projectName: name, createdAt: Date.now() })

  generateApp(name, hint)
    .then((result) => {
      const releaseErrors = guestReleaseErrors(result)
      if (releaseErrors.length > 0) {
        throw new Error(`guest release gate rejected output: ${releaseErrors.slice(0, 5).join("; ")}`)
      }
      tasks.set(taskId, { status: "done", projectName: name, result, createdAt: Date.now() })
    })
    .catch((err) => {
      captureError("[guest-code] generateApp failed", err)
      tasks.set(taskId, {
        status: "error",
        projectName: name,
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
