import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import db from "../lib/db"
import { captureError } from "../lib/sentry"
import { trackGeneration } from "./generation-metrics.service"
import { notifyGenerationComplete } from "./webhook.service"
import type { Agent, Artifact, TaskStatus } from "../types/pipeline.types"

/* ================================================================
   OSGARD · ChainManager — прогон цепочки агентов генерации проекта
   ----------------------------------------------------------------
   Аналог services/orchestrator.service.ts (executeChain), но как
   переиспользуемый класс над списком Agent (execute(input, context)),
   реализуемых другими модулями. Выполнение — in-process, без
   BullMQ/обязательного Redis: та же причина, что и у оркестратора
   (см. комментарий в orchestrator.service.ts) — Redis в проекте
   опциональная best-effort зависимость (lib/redis.ts).

   Параллелизм ограничивается простым семафором (acquireSlot/
   releaseSlot) — это и есть "воркер"/"очередь" в адаптированном виде.

   Стадия цепочки (элемент stages) — либо один Agent, либо Agent[]
   ("параллельная группа"). Агенты внутри группы выполняются одновременно
   (Promise.all) — используется для optimized+security (pipeline-agents.ts,
   createRealPipeline), которые независимо читают schema/frontend/backend/
   tests и не зависят друг от друга. Артефакты группы кладутся в общую
   историю в порядке элементов массива (Promise.all сохраняет порядок
   входа, а не порядок завершения), step_start/step_done шлются по одному
   на агента — чтобы фронт (useTaskStatus.ts) мог подсвечивать все шаги
   группы активными одновременно, а не только последний стартовавший.
   ================================================================ */

export const pipelineEvents = new EventEmitter()

const MAX_CONCURRENT_TASKS = Number(process.env.GENERATION_MAX_CONCURRENT || 3)
const TASK_TIMEOUT_MS = 10 * 60_000

let runningCount = 0
const waiting: Array<() => void> = []

/* Отменённые задачи (taskId), проверяется на границах шагов run() (перед стартом
   цепочки и между шагами). Agent-интерфейс (types/pipeline.types.ts) не пробрасывает
   AbortSignal внутрь execute(), поэтому уже начатый шаг (долгий AI-вызов) прервать
   нельзя — отмена вступает в силу как только текущий execute() завершится. */
const cancelledTasks = new Set<string>()

class TaskCancelledError extends Error {
  constructor() {
    super("task_cancelled")
  }
}

function acquireSlot(): Promise<void> {
  if (runningCount < MAX_CONCURRENT_TASKS) {
    runningCount++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      runningCount++
      resolve()
    })
  })
}

function releaseSlot() {
  runningCount--
  const next = waiting.shift()
  if (next) next()
}

function rowToStatus(row: any): TaskStatus {
  return {
    taskId: row.id,
    userId: String(row.user_id),
    status: row.status,
    progress: row.progress,
    currentStep: row.current_step,
    artifacts: JSON.parse(row.artifacts),
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error ?? undefined,
  }
}

export function getTaskStatus(userId: number, taskId: string): TaskStatus | null {
  const row = db.prepare(`SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?`).get(taskId, userId)
  return row ? rowToStatus(row) : null
}

function firstAgentType(stages: (Agent | Agent[])[]): string {
  const first = stages[0]
  if (!first) return ""
  return Array.isArray(first) ? (first[0]?.type ?? "") : first.type
}

export class ChainManager {
  constructor(private readonly stages: (Agent | Agent[])[]) {}

  /** Создаёт task-запись (status='queued') и запускает цепочку в фоне. Возвращает taskId немедленно. */
  start(userId: number, input: any): string {
    const taskId = randomUUID()
    const now = Date.now()

    db.prepare(
      `INSERT INTO generation_tasks (id, user_id, status, progress, current_step, input, artifacts, created_at, updated_at)
       VALUES (?, ?, 'queued', 0, ?, ?, '[]', ?, ?)`,
    ).run(taskId, userId, firstAgentType(this.stages), JSON.stringify(input), now, now)

    void this.run(taskId, userId, input)
    return taskId
  }

  /** Помечает задачу отменённой (queued/processing → cancelled). Обновляет статус в БД
      и шлёт событие немедленно (для мгновенной обратной связи в UI/SSE), даже если
      выполняющийся сейчас шаг агента доработает до конца — см. комментарий у cancelledTasks. */
  cancel(userId: number, taskId: string): boolean {
    const row: any = db.prepare(`SELECT status FROM generation_tasks WHERE id = ? AND user_id = ?`).get(taskId, userId)
    if (!row || (row.status !== "queued" && row.status !== "processing")) return false

    cancelledTasks.add(taskId)
    this.persist(taskId, { status: "cancelled", error: "Отменено пользователем" })
    pipelineEvents.emit(`task:${taskId}`, { type: "task_cancelled" })
    return true
  }

  /** Перезапускает ранее упавшую задачу с тем же taskId, используя исходный input.
      Переиспользует существующую запись/канал событий вместо создания новой задачи. */
  retry(userId: number, taskId: string): boolean {
    const row: any = db.prepare(`SELECT status, input FROM generation_tasks WHERE id = ? AND user_id = ?`).get(taskId, userId)
    if (!row || row.status !== "failed") return false

    const input = JSON.parse(row.input)
    cancelledTasks.delete(taskId)
    this.persist(taskId, {
      status: "queued",
      progress: 0,
      current_step: firstAgentType(this.stages),
      artifacts: "[]",
      result: null,
      error: null,
    })

    void this.run(taskId, userId, input)
    return true
  }

  private persist(taskId: string, patch: Record<string, any>) {
    const fields = Object.keys(patch)
    const setClause = ["updated_at = ?", ...fields.map((f) => `${f} = ?`)].join(", ")
    db.prepare(`UPDATE generation_tasks SET ${setClause} WHERE id = ?`).run(
      Date.now(),
      ...fields.map((f) => patch[f]),
      taskId,
    )
  }

  private async run(taskId: string, userId: number, input: any) {
    await acquireSlot()
    const channel = `task:${taskId}`
    const deadline = Date.now() + TASK_TIMEOUT_MS
    const startedAt = Date.now()
    const artifacts: Artifact[] = []

    try {
      if (cancelledTasks.has(taskId)) throw new TaskCancelledError()

      this.persist(taskId, { status: "processing", current_step: firstAgentType(this.stages) })
      pipelineEvents.emit(channel, { type: "task_start", taskId })

      let current: any = input

      for (let i = 0; i < this.stages.length; i++) {
        if (cancelledTasks.has(taskId)) throw new TaskCancelledError()

        const stage = this.stages[i]
        const group = Array.isArray(stage) ? stage : [stage]

        if (Date.now() > deadline) {
          throw new Error("task_timeout")
        }

        const stepLabel = group.map((a) => a.type).join("+")
        this.persist(taskId, {
          current_step: stepLabel,
          progress: Math.round((i / this.stages.length) * 100),
        })
        for (const agent of group) pipelineEvents.emit(channel, { type: "step_start", step: agent.type })

        const outputs = await Promise.all(group.map((agent) => agent.execute(current, { taskId, userId, artifacts })))

        for (let j = 0; j < group.length; j++) {
          const artifact: Artifact = { id: randomUUID(), type: group[j].type, content: outputs[j], timestamp: new Date() }
          artifacts.push(artifact)
          pipelineEvents.emit(channel, { type: "step_done", step: group[j].type, artifact })
        }
        current = group.length === 1 ? outputs[0] : Object.fromEntries(group.map((a, idx) => [a.type, outputs[idx]]))

        this.persist(taskId, {
          artifacts: JSON.stringify(artifacts),
          progress: Math.round(((i + 1) / this.stages.length) * 100),
        })
      }

      /* Цикл выше проверяет cancelledTasks только ПЕРЕД каждым шагом — если cancel()
         пришёл, пока выполнялся последний агент, цикл этого не заметит и дойдёт сюда.
         Без этой проверки статус "cancelled", уже выставленный cancel(), был бы
         перезаписан обратно на "completed", а SSE-клиенты (уже отключившиеся по
         первому task_cancelled) получили бы задним числом ещё и task_done. */
      if (cancelledTasks.has(taskId)) throw new TaskCancelledError()

      const result = typeof current === "object" && current !== null ? current : { output: current }
      this.persist(taskId, { status: "completed", progress: 100, result: JSON.stringify(result) })
      pipelineEvents.emit(channel, { type: "task_done", result })
      void trackGeneration({
        taskId,
        userId,
        status: "completed",
        durationMs: Date.now() - startedAt,
        stepsCompleted: artifacts.length,
        stepsTotal: this.stages.length,
      })
      void notifyGenerationComplete(userId, { taskId, status: "completed", result })
    } catch (err: any) {
      if (err instanceof TaskCancelledError) {
        this.persist(taskId, { status: "cancelled", error: "Отменено пользователем" })
        pipelineEvents.emit(channel, { type: "task_cancelled" })
        void trackGeneration({
          taskId,
          userId,
          status: "cancelled",
          durationMs: Date.now() - startedAt,
          stepsCompleted: artifacts.length,
          stepsTotal: this.stages.length,
        })
      } else {
        const message = err?.message ?? "pipeline_failed"
        this.persist(taskId, { status: "failed", error: message })
        pipelineEvents.emit(channel, { type: "task_error", error: message })
        captureError(`[chain-manager] task ${taskId} failed:`, err)
        void trackGeneration({
          taskId,
          userId,
          status: "failed",
          durationMs: Date.now() - startedAt,
          stepsCompleted: artifacts.length,
          stepsTotal: this.stages.length,
          error: message,
        })
        void notifyGenerationComplete(userId, { taskId, status: "failed", error: message })
      }
    } finally {
      cancelledTasks.delete(taskId)
      releaseSlot()
    }
  }
}
